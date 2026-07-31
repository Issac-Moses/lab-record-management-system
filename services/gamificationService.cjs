const { createClient } = require("@supabase/supabase-js");

const LEVEL_DIVISOR = 200;
const LAB_COMPLETION_XP_REWARD = 25;
/** XP granted to faculty when they complete a submission review (distinct from student lab XP). */
const FACULTY_REVIEW_XP_REWARD = 15;
const DEFAULT_PROGRESS = {
  xp_points: 0,
  level: 1,
  labs_completed: 0,
  current_streak: 0,
};

const TASKS_TABLE = "student_gamification_tasks";

function getServiceClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase service configuration missing");
  }
  return createClient(supabaseUrl, serviceRoleKey);
}

function normalizeNonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function computeLevel(xpPoints) {
  return Math.floor(normalizeNonNegativeInteger(xpPoints, 0) / LEVEL_DIVISOR) + 1;
}

function mapProgressRow(row) {
  return {
    xp_points: normalizeNonNegativeInteger(row?.xp_points, 0),
    level: normalizeNonNegativeInteger(row?.level, 1) || 1,
    labs_completed: normalizeNonNegativeInteger(row?.labs_completed, 0),
    current_streak: normalizeNonNegativeInteger(row?.current_streak, 0),
  };
}

async function canQueryTable(supabase, tableName) {
  try {
    const { error } = await supabase.from(tableName).select("id", { head: true, count: "exact" }).limit(1);
    return !error;
  } catch {
    return false;
  }
}

let cachedUserTable = null;
async function resolveUserTable(supabase) {
  if (cachedUserTable) return cachedUserTable;

  // Prefer public.profiles: role, department, and XP live here in this app.
  // A public `users` table may exist but often has no department/role columns.
  if (await canQueryTable(supabase, "profiles")) {
    cachedUserTable = "profiles";
    return cachedUserTable;
  }

  if (await canQueryTable(supabase, "users")) {
    cachedUserTable = "users";
    return cachedUserTable;
  }

  throw new Error("No users/profiles table found for gamification");
}

async function getUserProgress(userId) {
  if (!userId) {
    return { ...DEFAULT_PROGRESS };
  }

  const supabase = getServiceClient();
  const tableName = await resolveUserTable(supabase);

  try {
    const { data, error } = await supabase
      .from(tableName)
      .select("xp_points, level, labs_completed, current_streak")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("getUserProgress error:", error.message);
      return { ...DEFAULT_PROGRESS };
    }

    if (!data) {
      return { ...DEFAULT_PROGRESS };
    }

    return mapProgressRow(data);
  } catch (error) {
    console.error("getUserProgress runtime error:", error?.message || error);
    return { ...DEFAULT_PROGRESS };
  }
}

async function addXP(userId, amount) {
  if (!userId) {
    return { ...DEFAULT_PROGRESS };
  }

  const safeAmount = normalizeNonNegativeInteger(amount, 0);
  const supabase = getServiceClient();
  const tableName = await resolveUserTable(supabase);

  try {
    const progress = await getUserProgress(userId);
    const nextXp = progress.xp_points + safeAmount;
    const nextLevel = computeLevel(nextXp);

    const { error } = await supabase
      .from(tableName)
      .update({
        xp_points: nextXp,
        level: nextLevel,
      })
      .eq("id", userId);

    if (error) {
      console.error("addXP update error:", error.message);
      return progress;
    }

    return {
      ...progress,
      xp_points: nextXp,
      level: nextLevel,
    };
  } catch (error) {
    console.error("addXP runtime error:", error?.message || error);
    return { ...DEFAULT_PROGRESS };
  }
}

async function incrementLabCompletion(userId, options = {}) {
  if (!userId) {
    return { ...DEFAULT_PROGRESS };
  }

  const reward = normalizeNonNegativeInteger(options?.xpReward, LAB_COMPLETION_XP_REWARD);
  const supabase = getServiceClient();
  const tableName = await resolveUserTable(supabase);

  try {
    const progress = await getUserProgress(userId);
    const nextLabs = progress.labs_completed + 1;

    const { error } = await supabase
      .from(tableName)
      .update({ labs_completed: nextLabs })
      .eq("id", userId);

    if (error) {
      console.error("incrementLabCompletion error:", error.message);
      return progress;
    }

    const xpProgress = await addXP(userId, reward);
    return {
      ...xpProgress,
      labs_completed: nextLabs,
    };
  } catch (error) {
    console.error("incrementLabCompletion runtime error:", error?.message || error);
    return { ...DEFAULT_PROGRESS };
  }
}

function submissionStatusCountsAsComplete(status) {
  const s = String(status || "").toLowerCase();
  return s === "submitted" || s === "evaluated" || s === "approved";
}

async function countQuestXp(userId) {
  const supabase = getServiceClient();
  const sid = String(userId || "").trim();
  if (!sid) return 0;

  // 1. Direct tasks completed
  const { data: directTasks } = await supabase
    .from(TASKS_TABLE)
    .select("xp_reward")
    .eq("student_id", sid)
    .eq("status", "completed");

  const directXp = (directTasks || []).reduce((sum, t) => sum + normalizeNonNegativeInteger(t.xp_reward, 0), 0);

  // 2. Global tasks completed
  let globalXp = 0;
  if (await canQueryTable(supabase, "student_quest_completions")) {
    const { data: completions } = await supabase
      .from("student_quest_completions")
      .select("task_id")
      .eq("student_id", sid)
      .eq("status", "completed");

    const globalTaskIds = (completions || []).map((c) => String(c.task_id)).filter(Boolean);
    if (globalTaskIds.length > 0) {
      const { data: globalTasks } = await supabase
        .from(TASKS_TABLE)
        .select("xp_reward")
        .in("id", globalTaskIds);
      globalXp = (globalTasks || []).reduce((sum, t) => sum + normalizeNonNegativeInteger(t.xp_reward, 0), 0);
    }
  }

  return directXp + globalXp;
}

/**
 * Reconcile profiles.xp_points / labs_completed / level from real activity so the
 * leaderboard matches completed work (not only reward-submission events).
 */
async function syncStudentProgressFromSubmissions(userId) {
  if (!userId) {
    return { ...DEFAULT_PROGRESS };
  }

  const supabase = getServiceClient();
  let tableName;
  try {
    tableName = await resolveUserTable(supabase);
  } catch {
    return getUserProgress(userId);
  }

  try {
    const completedExpIds = new Set();

    const { data: subs, error: subErr } = await supabase
      .from("submissions")
      .select("exp_id, experiment_id, status")
      .eq("student_id", userId);

    if (!subErr && Array.isArray(subs)) {
      subs.forEach((row) => {
        const expId = String(row.exp_id || row.experiment_id || "").trim();
        if (!expId) return;
        if (submissionStatusCountsAsComplete(row.status)) {
          completedExpIds.add(expId);
        }
      });
    }

    if (await canQueryTable(supabase, "student_experiments")) {
      const { data: seRows } = await supabase
        .from("student_experiments")
        .select("experiment_id, is_completed")
        .eq("student_id", userId);

      (seRows || []).forEach((row) => {
        const expId = String(row.experiment_id || "").trim();
        if (!expId) return;
        if (row.is_completed === true) {
          completedExpIds.add(expId);
        }
      });
    }

    if (await canQueryTable(supabase, "full_student_data")) {
      const { data: fullRows } = await supabase
        .from("full_student_data")
        .select("experiment_no, title, status")
        .eq("student_id", userId);

      (fullRows || []).forEach((row) => {
        const key = String(row.experiment_no || row.title || "").trim();
        if (!key) return;
        if (submissionStatusCountsAsComplete(row.status)) {
          completedExpIds.add(key);
        }
      });
    }

    const labsCount = completedExpIds.size;
    const labXp = labsCount * LAB_COMPLETION_XP_REWARD;
    const questXp = await countQuestXp(userId);
    const nextXp = labXp + questXp;
    const nextLevel = computeLevel(nextXp);
    const nextLabs = labsCount;

    const { error: updateError } = await supabase
      .from(tableName)
      .update({
        xp_points: nextXp,
        level: nextLevel,
        labs_completed: nextLabs,
      })
      .eq("id", userId);

    if (updateError) {
      console.error("syncStudentProgressFromSubmissions update error:", updateError.message);
      return mapProgressRow({
        xp_points: nextXp,
        level: nextLevel,
        labs_completed: nextLabs,
        current_streak: 0,
      });
    }

    try {
      await checkAndGrantAchievements(userId);
    } catch (_e) {
      /* non-fatal */
    }

    return getUserProgress(userId);
  } catch (error) {
    console.error("syncStudentProgressFromSubmissions error:", error?.message || error);
    return getUserProgress(userId);
  }
}

function normalizeDepartment(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  const compact = normalized.replace(/\s+/g, "");
  const aliases = {
    it: "information technology",
    informationtechnology: "information technology",
    aids: "artificial intelligence data science",
    artificialintelligenceanddatascience: "artificial intelligence data science",
    artificialintelligencedatascience: "artificial intelligence data science",
    cse: "computer science and engineering",
    computerscienceandengineering: "computer science and engineering",
    computerscienceengineering: "computer science and engineering",
    csbs: "computer science and business systems",
    computerscienceandbusinesssystems: "computer science and business systems",
    computerscienceandbusinesssystem: "computer science and business systems",
  };
  return aliases[compact] || normalized;
}

function departmentMatches(rowDept, filterDept) {
  const b = normalizeDepartment(filterDept);
  if (!b) return true;
  const a = normalizeDepartment(rowDept);
  if (!a) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

function isStudentRole(roleStr) {
  const r = String(roleStr || "").trim().toLowerCase();
  return !r || r === "student";
}

function isFacultyRole(roleStr) {
  const r = String(roleStr || "").trim().toLowerCase();
  return r === "faculty";
}

function emptyRoleAgg() {
  return { count: 0, withXp: 0, totalXp: 0, avgLevel: 0, totalLabsCompleted: 0 };
}

function aggregateProfileRows(rows) {
  if (!rows || !rows.length) return emptyRoleAgg();
  let totalXp = 0;
  let levelSum = 0;
  let labsSum = 0;
  let withXp = 0;
  rows.forEach((row) => {
    const xp = normalizeNonNegativeInteger(row?.xp_points, 0);
    totalXp += xp;
    if (xp > 0) withXp += 1;
    levelSum += normalizeNonNegativeInteger(row?.level, 1) || 1;
    labsSum += normalizeNonNegativeInteger(row?.labs_completed, 0);
  });
  const n = rows.length || 1;
  return {
    count: rows.length,
    withXp,
    totalXp,
    avgLevel: Number((levelSum / n).toFixed(2)),
    totalLabsCompleted: labsSum,
  };
}

/** Helper to auto-reconcile XP/labs for students with submissions if their profiles.xp_points is 0 */
async function autoReconcileSubmissionsMap(supabase, studentIds) {
  if (!studentIds || !studentIds.length) return new Map();
  try {
    const { data: subs } = await supabase
      .from("submissions")
      .select("student_id, exp_id, experiment_id, status, marks, faculty_marks, final_marks, ai_marks")
      .in("student_id", studentIds);

    const map = new Map();
    (subs || []).forEach((row) => {
      const sid = String(row.student_id || "");
      if (!sid) return;
      const st = String(row.status || "").toLowerCase();
      if (st === "submitted" || st === "evaluated" || st === "approved") {
        if (!map.has(sid)) map.set(sid, { completedSet: new Set(), totalMarks: 0 });
        const entry = map.get(sid);
        const expId = String(row.exp_id || row.experiment_id || idRow(row));
        if (expId) entry.completedSet.add(expId);
        const markVal = Number(row.final_marks ?? row.faculty_marks ?? row.ai_marks ?? row.marks ?? 0);
        if (Number.isFinite(markVal)) entry.totalMarks += markVal;
      }
    });
    return map;
  } catch {
    return new Map();
  }
}

function idRow(r) {
  return r.id || "";
}

/** Aggregates XP/labs for admin dashboards (service role; not limited to top-N). */
async function getDepartmentGamificationStats(department) {
  const supabase = getServiceClient();
  const tableName = await resolveUserTable(supabase);

  try {
    let { data, error } = await supabase
      .from(tableName)
      .select("id, xp_points, level, labs_completed, role, department");

    if (error && String(error.message || "").toLowerCase().includes("column")) {
      ({ data, error } = await supabase.from(tableName).select("id, xp_points, level, role, department"));
    }

    if (error) {
      console.error("getDepartmentGamificationStats error:", error.message);
      return { students: emptyRoleAgg(), faculty: emptyRoleAgg(), error: error.message };
    }

    const rows = data || [];
    const inDept = (row) => !department || departmentMatches(row.department, department);
    let studentRows = rows.filter((row) => isStudentRole(row.role) && inDept(row));
    const facultyRows = rows.filter((row) => isFacultyRole(row.role) && inDept(row));

    // Auto-reconcile XP for all students
    const allStudentIds = studentRows.map((r) => String(r.id)).filter(Boolean);
    if (allStudentIds.length > 0) {
      const subMap = await autoReconcileSubmissionsMap(supabase, allStudentIds);
      studentRows = studentRows.map((row) => {
        const sid = String(row.id || "");
        const subData = subMap.get(sid);
        const completedLabs = subData ? subData.completedSet.size : 0;
        const totalMarks = subData ? subData.totalMarks : 0;
        const syntheticXp = completedLabs * LAB_COMPLETION_XP_REWARD + Math.round(totalMarks * 10);
        const labs = Math.max(row.labs_completed || 0, completedLabs);
        const xp = Math.max(row.xp_points || 0, syntheticXp);
        return {
          ...row,
          labs_completed: labs,
          xp_points: xp,
          level: computeLevel(xp),
        };
      });
    }

    return {
      students: aggregateProfileRows(studentRows),
      faculty: aggregateProfileRows(facultyRows),
    };
  } catch (error) {
    console.error("getDepartmentGamificationStats runtime error:", error?.message || error);
    return { students: emptyRoleAgg(), faculty: emptyRoleAgg(), error: String(error?.message || error) };
  }
}

async function getLeaderboard(department, options = {}) {
  const limit = Math.min(2000, Math.max(1, normalizeNonNegativeInteger(options?.limit, 10)));
  const roleFilter = options.role !== undefined ? options.role : "student";
  const supabase = getServiceClient();
  const tableName = await resolveUserTable(supabase);

  try {
    const selectFull = "id, name, department, xp_points, level, role, labs_completed, current_streak";
    const selectBasic = "id, name, department, xp_points, level, role";

    let query = supabase.from(tableName).select(selectFull).order("xp_points", { ascending: false }).limit(2000);

    let { data, error } = await query;
    if (error && String(error.message || "").toLowerCase().includes("column")) {
      query = supabase.from(tableName).select(selectBasic).order("xp_points", { ascending: false }).limit(2000);
      ({ data, error } = await query);
    }
    if (error) {
      console.error("getLeaderboard error:", error.message);
      return [];
    }

    let rows = data || [];

    if (roleFilter === "student") {
      rows = rows.filter((row) => isStudentRole(row.role));
    } else if (roleFilter === "faculty") {
      rows = rows.filter((row) => isFacultyRole(row.role));
    } else if (roleFilter) {
      rows = rows.filter((row) => String(row.role || "").toLowerCase() === roleFilter.toLowerCase());
    }

    if (department) {
      rows = rows.filter((row) => departmentMatches(row.department, department));
    }

    // Auto-reconcile XP for all students using submissions + marks
    if (roleFilter === "student" || !roleFilter) {
      const allStudentIds = rows.map((r) => String(r.id)).filter(Boolean);
      if (allStudentIds.length > 0) {
        const subMap = await autoReconcileSubmissionsMap(supabase, allStudentIds);
        rows = rows.map((row) => {
          const sid = String(row.id || "");
          const subData = subMap.get(sid);
          const completedLabs = subData ? subData.completedSet.size : 0;
          const totalMarks = subData ? subData.totalMarks : 0;
          const syntheticXp = completedLabs * LAB_COMPLETION_XP_REWARD + Math.round(totalMarks * 10);
          const labs = Math.max(row.labs_completed || 0, completedLabs);
          const xp = Math.max(row.xp_points || 0, syntheticXp);
          return {
            ...row,
            labs_completed: labs,
            xp_points: xp,
            level: computeLevel(xp),
          };
        });
      }
    }

    rows.sort((a, b) => (b.xp_points || 0) - (a.xp_points || 0));

    return rows.slice(0, limit).map((row, index) => ({
      rank: index + 1,
      user_id: row.id,
      name: row.name || (roleFilter === "faculty" ? "Faculty" : "Student"),
      department: row.department || null,
      xp_points: normalizeNonNegativeInteger(row.xp_points, 0),
      level: normalizeNonNegativeInteger(row.level, 1) || 1,
      labs_completed: normalizeNonNegativeInteger(row.labs_completed, 0),
      current_streak: normalizeNonNegativeInteger(row.current_streak, 0),
    }));
  } catch (error) {
    console.error("getLeaderboard runtime error:", error?.message || error);
    return [];
  }
}

const STREAK_XP_MULTIPLIER = 1.5;
const HIGH_MARKS_THRESHOLD = 80;
const HIGH_MARKS_BONUS_XP = 30;

function normalizeMarksToPercentage(marks) {
  const numericMarks = Number(marks);
  if (!Number.isFinite(numericMarks)) return null;
  const clamped = Math.max(0, numericMarks);
  if (clamped <= 10) {
    return clamped * 10;
  }
  return Math.min(100, clamped);
}

async function updateStreak(userId) {
  if (!userId) return 0;

  const supabase = getServiceClient();
  const tableName = await resolveUserTable(supabase);

  try {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStart = new Date(yesterday.setHours(0, 0, 0, 0)).toISOString();
    const todayStart = new Date(now.setHours(0, 0, 0, 0)).toISOString();

    const { count: todayCount } = await supabase
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("student_id", userId)
      .gte("updated_at", todayStart);

    if ((todayCount || 0) > 1) {
      const progress = await getUserProgress(userId);
      return progress.current_streak;
    }

    const { count: yesterdayCount } = await supabase
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("student_id", userId)
      .gte("updated_at", yesterdayStart)
      .lt("updated_at", todayStart);

    const progress = await getUserProgress(userId);
    const nextStreak = (yesterdayCount || 0) > 0 ? progress.current_streak + 1 : 1;

    await supabase
      .from(tableName)
      .update({ current_streak: nextStreak })
      .eq("id", userId);

    return nextStreak;
  } catch (error) {
    console.error("updateStreak error:", error?.message || error);
    return 0;
  }
}

async function countCompletedQuests(userId) {
  const sid = String(userId || "").trim();
  if (!sid) return 0;
  const supabase = getServiceClient();
  try {
    const { count, error } = await supabase
      .from(TASKS_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("student_id", sid)
      .eq("status", "completed");
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function checkAndGrantAchievements(userId) {
  if (!userId) return [];

  const supabase = getServiceClient();
  const granted = [];

  try {
    const { data: allAchievements } = await supabase
      .from("achievements")
      .select("id, name, description, xp_reward");

    if (!allAchievements || allAchievements.length === 0) return [];

    const { data: earned } = await supabase
      .from("user_achievements")
      .select("achievement_id")
      .eq("user_id", userId);

    const earnedIds = new Set((earned || []).map((e) => e.achievement_id));
    const progress = await getUserProgress(userId);
    const completedQuests = await countCompletedQuests(userId);

    const rules = [
      { match: (a) => /first.*(sub|lab)/i.test(a.name), condition: () => progress.labs_completed >= 1 },
      { match: (a) => /5.*(exp|lab|complete)/i.test(a.name), condition: () => progress.labs_completed >= 5 },
      { match: (a) => /10.*(exp|lab|complete)/i.test(a.name), condition: () => progress.labs_completed >= 10 },
      { match: (a) => /streak.*7|7.*streak|week.*streak/i.test(a.name), condition: () => progress.current_streak >= 7 },
      { match: (a) => /streak.*3|3.*streak/i.test(a.name), condition: () => progress.current_streak >= 3 },
      { match: (a) => /first quest complete/i.test(a.name), condition: () => completedQuests >= 1 },
      { match: (a) => /quest sprint/i.test(a.name), condition: () => completedQuests >= 5 },
      { match: (a) => /quest legend/i.test(a.name), condition: () => completedQuests >= 10 },
    ];

    for (const achievement of allAchievements) {
      if (earnedIds.has(achievement.id)) continue;

      const rule = rules.find((r) => r.match(achievement));
      if (rule && rule.condition()) {
        const { error } = await supabase.from("user_achievements").insert({
          user_id: userId,
          achievement_id: achievement.id,
        });

        if (!error) {
          granted.push(achievement);
          if (achievement.xp_reward > 0) {
            await addXP(userId, achievement.xp_reward);
          }
        }
      }
    }
  } catch (error) {
    console.error("checkAndGrantAchievements error:", error?.message || error);
  }

  return granted;
}

async function rewardSubmission(userId, marks, options = {}) {
  if (!userId) return { ...DEFAULT_PROGRESS, streak: 0, newAchievements: [] };

  const reviewerUserId = String(options?.reviewerUserId || "").trim();

  try {
    const labResult = await incrementLabCompletion(userId);

    const streak = await updateStreak(userId);

    let bonusXp = 0;
    if (marks !== undefined && marks !== null) {
      const marksPercent = normalizeMarksToPercentage(marks);
      if (marksPercent !== null && marksPercent >= HIGH_MARKS_THRESHOLD) {
        bonusXp += HIGH_MARKS_BONUS_XP;
      }
    }

    if (streak >= 3) {
      bonusXp = Math.round(bonusXp * STREAK_XP_MULTIPLIER);
    }

    let finalProgress = labResult;
    if (bonusXp > 0) {
      finalProgress = await addXP(userId, bonusXp);
    }

    const newAchievements = await checkAndGrantAchievements(userId);

    if (reviewerUserId && reviewerUserId !== userId) {
      await addXP(reviewerUserId, FACULTY_REVIEW_XP_REWARD);
    }

    return {
      ...finalProgress,
      streak,
      newAchievements,
    };
  } catch (error) {
    console.error("rewardSubmission error:", error?.message || error);
    return { ...DEFAULT_PROGRESS, streak: 0, newAchievements: [] };
  }
}

async function createStudentTask(payload) {
  const inputStudent = String(payload?.studentId || "").trim();
  const assignedBy = String(payload?.assignedBy || "").trim();
  const title = String(payload?.title || "").trim();
  const description = String(payload?.description || "").trim();
  const xpReward = Math.min(500, Math.max(1, normalizeNonNegativeInteger(payload?.xpReward, 50)));
  const subjectId = payload?.subjectId ? String(payload.subjectId).trim() : null;

  if (!inputStudent || !title) {
    throw new Error("Student target and Quest title are required");
  }

  const isGlobal =
    inputStudent.toUpperCase() === "ALL" ||
    inputStudent.toUpperCase() === "GLOBAL" ||
    inputStudent === "*";

  const supabase = getServiceClient();
  const tableName = await resolveUserTable(supabase);

  let studentId = null;

  if (!isGlobal) {
    // Flexible lookup: UUID, register_no, or email
    let profile = null;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inputStudent);

    if (isUuid) {
      const { data } = await supabase
        .from(tableName)
        .select("id, role, name")
        .eq("id", inputStudent)
        .maybeSingle();
      profile = data;
    }

    if (!profile) {
      const { data } = await supabase
        .from(tableName)
        .select("id, role, name")
        .eq("register_no", inputStudent)
        .maybeSingle();
      profile = data;
    }

    if (!profile && inputStudent.includes("@")) {
      const { data } = await supabase
        .from(tableName)
        .select("id, role, name")
        .eq("email", inputStudent)
        .maybeSingle();
      profile = data;
    }

    if (!profile?.id) {
      throw new Error(`Student not found for "${inputStudent}". Select a valid student or "All Students (Global Quest)".`);
    }

    const targetRole = String(profile.role || "").toLowerCase();
    if (targetRole && targetRole !== "student") {
      throw new Error(`User "${profile.name || inputStudent}" is a ${profile.role}, not a student.`);
    }

    studentId = profile.id;
  }

  const insertRow = {
    student_id: studentId,
    assigned_by: assignedBy || null,
    title,
    description: description || "",
    xp_reward: xpReward,
    subject_id: subjectId || null,
    is_global: isGlobal,
    status: "pending",
  };

  const { data, error } = await supabase.from(TASKS_TABLE).insert(insertRow).select("*").maybeSingle();

  if (error) {
    console.error("createStudentTask insert error:", error.message);
    const msg = String(error.message || "").toLowerCase();
    if (msg.includes("relation") || msg.includes("does not exist") || msg.includes("404")) {
      throw new Error(
        'Quest table missing in database. Please run "docs/gamification-tasks-schema.sql" in Supabase SQL Editor once.'
      );
    }
    throw new Error(error.message);
  }

  return data;
}

async function performStudentTask(taskId, studentId) {
  const supabase = getServiceClient();
  const id = String(taskId || "").trim();
  const sid = String(studentId || "").trim();
  if (!id || !sid) {
    return { ok: false, error: "Missing task or user" };
  }

  const { data: task, error: fetchError } = await supabase
    .from(TASKS_TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !task) {
    return { ok: false, error: "Task not found" };
  }

  const isGlobalTask = Boolean(task.is_global) || !task.student_id;

  if (isGlobalTask) {
    if (await canQueryTable(supabase, "student_quest_completions")) {
      const { data: existing } = await supabase
        .from("student_quest_completions")
        .select("id, status")
        .eq("task_id", id)
        .eq("student_id", sid)
        .maybeSingle();

      if (existing) {
        if (existing.status === "completed") {
          return { ok: false, error: "You have already completed this quest" };
        }
        return { ok: true, message: "Quest is already in progress" };
      }

      const { error: insertError } = await supabase
        .from("student_quest_completions")
        .insert({ task_id: id, student_id: sid, status: "performing" });

      if (insertError) {
        console.error("Global task performance insert error:", insertError.message);
        return { ok: false, error: insertError.message };
      }
    }
  } else {
    if (String(task.student_id) !== sid) {
      return { ok: false, error: "This task is not assigned to you" };
    }

    const currentStatus = String(task.status || "").toLowerCase();
    if (currentStatus === "completed") {
      return { ok: false, error: "Task is already completed" };
    }
    if (currentStatus === "performing") {
      return { ok: true, message: "Quest is already in progress" };
    }

    const { error: updateError } = await supabase
      .from(TASKS_TABLE)
      .update({
        status: "performing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("student_id", sid);

    if (updateError) {
      console.error("performStudentTask update error:", updateError.message);
      return { ok: false, error: updateError.message };
    }
  }

  return { ok: true };
}

async function submitStudentTask(taskId, studentId, submissionNotes = null) {
  const supabase = getServiceClient();
  const id = String(taskId || "").trim();
  const sid = String(studentId || "").trim();
  const notes = submissionNotes ? String(submissionNotes).trim() : null;
  if (!id || !sid) {
    return { ok: false, error: "Missing task or user" };
  }

  const { data: task, error: fetchError } = await supabase
    .from(TASKS_TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !task) {
    return { ok: false, error: "Task not found" };
  }

  const isGlobalTask = Boolean(task.is_global) || !task.student_id;

  if (isGlobalTask) {
    if (await canQueryTable(supabase, "student_quest_completions")) {
      const { data: existing } = await supabase
        .from("student_quest_completions")
        .select("id, status")
        .eq("task_id", id)
        .eq("student_id", sid)
        .maybeSingle();

      if (existing) {
        if (existing.status === "completed" || existing.status === "submitted") {
          return { ok: false, error: "You have already submitted this quest" };
        }
        
        // Update from performing to submitted
        const { error: updateError } = await supabase
          .from("student_quest_completions")
          .update({
            status: "submitted",
            completed_at: new Date().toISOString(),
            submission_notes: notes,
          })
          .eq("id", existing.id);

        if (updateError) {
          console.error("Global task submission update error:", updateError.message);
          return { ok: false, error: updateError.message };
        }
      } else {
        // Direct submit
        const { error: compError } = await supabase
          .from("student_quest_completions")
          .insert({
            task_id: id,
            student_id: sid,
            status: "submitted",
            submission_notes: notes,
          });

        if (compError) {
          console.error("Global task submission record error:", compError.message);
          return { ok: false, error: compError.message };
        }
      }
    }
  } else {
    if (String(task.student_id) !== sid) {
      return { ok: false, error: "This task is not assigned to you" };
    }

    const currentStatus = String(task.status || "").toLowerCase();
    if (currentStatus === "completed" || currentStatus === "submitted") {
      return { ok: false, error: "Task is already submitted/completed" };
    }
    if (currentStatus !== "pending" && currentStatus !== "performing") {
      return { ok: false, error: "Task cannot be submitted from current state" };
    }

    const { error: updateError } = await supabase
      .from(TASKS_TABLE)
      .update({
        status: "submitted",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        submission_notes: notes,
      })
      .eq("id", id)
      .eq("student_id", sid);

    if (updateError) {
      console.error("submitStudentTask update error:", updateError.message);
      return { ok: false, error: updateError.message };
    }
  }

  return { ok: true };
}

async function verifyStudentTask(taskId, studentId) {
  const supabase = getServiceClient();
  const id = String(taskId || "").trim();
  const sid = String(studentId || "").trim();
  if (!id || !sid) {
    return { ok: false, error: "Missing task or student" };
  }

  const { data: task, error: fetchError } = await supabase
    .from(TASKS_TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !task) {
    return { ok: false, error: "Task not found" };
  }

  const isGlobalTask = Boolean(task.is_global) || !task.student_id;

  if (isGlobalTask) {
    if (await canQueryTable(supabase, "student_quest_completions")) {
      const { data: existing } = await supabase
        .from("student_quest_completions")
        .select("id, status")
        .eq("task_id", id)
        .eq("student_id", sid)
        .maybeSingle();

      if (!existing || existing.status !== "submitted") {
        return { ok: false, error: "No pending submission found to verify" };
      }

      const { error: updateError } = await supabase
        .from("student_quest_completions")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (updateError) {
        console.error("Global task verification update error:", updateError.message);
        return { ok: false, error: updateError.message };
      }
    }
  } else {
    if (String(task.status || "").toLowerCase() !== "submitted") {
      return { ok: false, error: "Quest is not in submitted state" };
    }

    const { error: updateError } = await supabase
      .from(TASKS_TABLE)
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      console.error("verifyStudentTask update error:", updateError.message);
      return { ok: false, error: updateError.message };
    }
  }

  const xpReward = normalizeNonNegativeInteger(task.xp_reward, 0);
  const progress = await addXP(sid, xpReward);
  const newAchievements = await checkAndGrantAchievements(sid);

  return { ok: true, progress, newAchievements };
}

async function listTasksForStudent(studentId, options = {}) {
  const sid = String(studentId || "").trim();
  if (!sid) return [];

  const supabase = getServiceClient();
  const statusFilter = String(options?.status || "").trim().toLowerCase();

  let { data: directTasks } = await supabase
    .from(TASKS_TABLE)
    .select("*")
    .eq("student_id", sid)
    .order("created_at", { ascending: false })
    .limit(100);

  let { data: globalTasks } = await supabase
    .from(TASKS_TABLE)
    .select("*")
    .or("is_global.eq.true,student_id.is.null")
    .order("created_at", { ascending: false })
    .limit(100);

  const directList = directTasks || [];
  const globalList = globalTasks || [];

  const globalTaskStatusMap = new Map();
  if (globalList.length > 0 && (await canQueryTable(supabase, "student_quest_completions"))) {
    const { data: compRows } = await supabase
      .from("student_quest_completions")
      .select("task_id, status, submission_notes")
      .eq("student_id", sid);

    (compRows || []).forEach((r) => {
      globalTaskStatusMap.set(String(r.task_id), {
        status: r.status || "completed",
        submission_notes: r.submission_notes || null,
      });
    });
  }

  const mappedGlobal = globalList.map((t) => {
    const record = globalTaskStatusMap.get(String(t.id));
    const status = record?.status || "pending";
    const submission_notes = record?.submission_notes || null;
    return {
      ...t,
      status,
      submission_notes,
      is_global: true,
    };
  });

  const merged = [...directList, ...mappedGlobal];

  if (statusFilter) {
    return merged.filter((t) => t.status === statusFilter);
  }

  return merged;
}

async function listTasksCreatedBy(assignerId, options = {}) {
  const aid = String(assignerId || "").trim();
  if (!aid) return [];

  const supabase = getServiceClient();
  const limit = Math.min(200, Math.max(1, normalizeNonNegativeInteger(options?.limit, 100)));

  const { data, error } = await supabase
    .from(TASKS_TABLE)
    .select("*")
    .eq("assigned_by", aid)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("listTasksCreatedBy error:", error.message);
    return [];
  }

  const tasks = data || [];
  return enrichTasksWithProfileNames(tasks);
}

async function enrichTasksWithProfileNames(tasks) {
  const ids = new Set();
  tasks.forEach((t) => {
    if (t.student_id) ids.add(String(t.student_id));
    if (t.assigned_by) ids.add(String(t.assigned_by));
  });
  const idList = [...ids].filter(Boolean);

  const supabase = getServiceClient();
  let map = new Map();
  if (idList.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, name, department, role").in("id", idList);
    map = new Map((profiles || []).map((p) => [p.id, p]));
  }

  return tasks.map((t) => ({
    ...t,
    student_name: t.is_global || !t.student_id ? "🌟 All Students (Global Quest)" : map.get(t.student_id)?.name || null,
    student_department: t.student_id ? map.get(t.student_id)?.department || null : "All Departments",
    assigner_name: t.assigned_by ? map.get(t.assigned_by)?.name || null : null,
  }));
}

async function listAllTasksForAdmin(options = {}) {
  const supabase = getServiceClient();
  const department = String(options?.department || "").trim().toLowerCase();
  const limit = Math.min(400, Math.max(1, normalizeNonNegativeInteger(options?.limit, 200)));

  const { data, error } = await supabase
    .from(TASKS_TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("listAllTasksForAdmin error:", error.message);
    return [];
  }

  let tasks = data || [];
  if (department) {
    const deptNorm = department.replace(/[^a-z0-9]+/g, "");
    const enriched = await enrichTasksWithProfileNames(tasks);
    tasks = enriched.filter((t) => {
      const d = String(t.student_department || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
      return d && (d === deptNorm || d.includes(deptNorm) || deptNorm.includes(d));
    });
    return tasks;
  }

  return enrichTasksWithProfileNames(tasks);
}

async function getGlobalTaskCompletions(taskId) {
  const supabase = getServiceClient();
  const id = String(taskId || "").trim();
  if (!id) return [];

  const { data, error } = await supabase
    .from("student_quest_completions")
    .select("student_id, completed_at, status, submission_notes")
    .eq("task_id", id);

  if (error || !data) {
    console.error("getGlobalTaskCompletions error:", error?.message);
    return [];
  }

  const studentIds = data.map((d) => String(d.student_id)).filter(Boolean);
  let profileMap = new Map();
  if (studentIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name, register_no")
      .in("id", studentIds);
    profileMap = new Map((profiles || []).map((p) => [p.id, p]));
  }

  return data.map((d) => ({
    student_id: d.student_id,
    student_name: profileMap.get(d.student_id)?.name || "Student",
    register_no: profileMap.get(d.student_id)?.register_no || "-",
    completed_at: d.completed_at,
    status: d.status,
    submission_notes: d.submission_notes,
  }));
}

module.exports = {
  getUserProgress,
  addXP,
  incrementLabCompletion,
  syncStudentProgressFromSubmissions,
  getLeaderboard,
  getDepartmentGamificationStats,
  computeLevel,
  updateStreak,
  checkAndGrantAchievements,
  rewardSubmission,
  createStudentTask,
  submitStudentTask,
  verifyStudentTask,
  performStudentTask,
  listTasksForStudent,
  listTasksCreatedBy,
  listAllTasksForAdmin,
  getGlobalTaskCompletions,
  LEVEL_DIVISOR,
  LAB_COMPLETION_XP_REWARD,
  FACULTY_REVIEW_XP_REWARD,
  HIGH_MARKS_THRESHOLD,
  HIGH_MARKS_BONUS_XP,
};
