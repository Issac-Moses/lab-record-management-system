import { supabase } from "@/lib/supabase";
import { sortByExperimentNo } from "@/utils/experimentOrder";
import { requestAdminApi } from "@/services/adminApiClient";

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

function deptMatch(a, b) {
  return normalizeDepartment(a).toLowerCase() === normalizeDepartment(b).toLowerCase();
}

/** When normalized equality fails, allow e.g. "IT Dept" vs "Information Technology" via compact substring. */
function deptMatchRelaxed(studentDept, adminDept) {
  if (deptMatch(studentDept, adminDept)) return true;
  const a = String(studentDept || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  const b = String(adminDept || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

/**
 * Pending = awaiting faculty review. Excludes blank/idle statuses and generic is_completed=false rows.
 */
function rowIsPendingReview(row) {
  const status = String(valueFromRow(row, ["status"], "")).toLowerCase().trim();
  if (row.is_completed === true || status === "evaluated" || status === "approved") return false;
  if (!status) return false;

  const idle = ["not started", "not_started", "not initiated", "upcoming", "locked"];
  if (idle.includes(status)) return false;

  const awaiting = new Set([
    "submitted",
    "pending",
    "pending_review",
    "under review",
    "under_review",
    "awaiting evaluation",
    "awaiting_evaluation",
    "for evaluation",
    "for_evaluation",
    "needs review",
    "needs_review",
    "to evaluate",
    "to_evaluate",
  ]);
  if (awaiting.has(status)) return true;
  if (status.includes("pending") || status.includes("submit")) return true;

  return false;
}

function valueFromRow(row, keys, fallback = null) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null) return row[key];
  }
  return fallback;
}

function toDateLabel(dateLike) {
  const parsed = new Date(String(dateLike || ""));
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(5, 10);
}

/**
 * Load `student_experiments` for admin analytics. Tries column lists in order — PostgREST returns 400 if any selected column is missing.
 */
async function fetchStudentExperimentsRowsForAdmin() {
  const variants = [
    "student_id, experiment_id, is_completed, status, faculty_marks, ai_marks, submitted_date, created_at, updated_at",
    "student_id, experiment_id, is_completed, status, faculty_marks, ai_marks, submitted_date",
    "student_id, experiment_id, is_completed, status, faculty_marks, ai_marks, submitted_at",
    "student_id, experiment_id, is_completed, status, faculty_marks, ai_marks",
    "student_id, experiment_id, is_completed, status",
  ];
  for (const select of variants) {
    const { data, error } = await supabase.from("student_experiments").select(select);
    if (!error) return data || [];
    const msg = String(error.message || error).toLowerCase();
    if (msg.includes("column") || msg.includes("schema") || msg.includes("does not exist")) {
      continue;
    }
    console.warn("[adminDataService] student_experiments:", error.message);
    return [];
  }
  console.warn("[adminDataService] student_experiments: all select variants failed — check table exists");
  return [];
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isFacultyLikeName(value) {
  const name = String(value || "").trim().toLowerCase();
  if (!name) return true;
  if (/^(mr|mrs|ms|miss|dr|prof|sir)\b/.test(name)) return true;
  if (name.includes("faculty") || name.includes("admin")) return true;
  return false;
}

function isUsableRegisterNo(value) {
  const reg = String(value || "").trim().toLowerCase();
  if (!reg) return false;
  return reg !== "-" && reg !== "null" && reg !== "undefined";
}

function isRealStudentRow(row) {
  const role = String(valueFromRow(row, ["role", "student_role"], "") || "").toLowerCase().trim();
  if (role && role !== "student") return false;
  const name = String(valueFromRow(row, ["full_name", "name", "student_name"], "") || "").trim();
  if (isFacultyLikeName(name)) return false;
  if (!isUsableRegisterNo(valueFromRow(row, ["register_no"], ""))) return false;
  return true;
}

function getComputedMark(row) {
  const faculty = valueFromRow(row, ["faculty_marks"], null);
  const ai = valueFromRow(row, ["ai_marks"], null);
  if (faculty !== null && faculty !== undefined) return toNumber(faculty);
  if (ai !== null && ai !== undefined) return toNumber(ai);
  return null;
}

export async function getAdminDepartment() {
  const { data } = await supabase.auth.getSession();
  if (!data?.session) return "";
  const { data: profile } = await supabase
    .from("profiles")
    .select("department")
    .eq("id", data.session.user.id)
    .maybeSingle();
  const fromProfile = String(profile?.department || "").trim();
  if (fromProfile) return fromProfile;
  /** Matches RoleSetup / AuthCallback when profile row had no department yet. */
  if (typeof window !== "undefined") {
    const ls = String(
      window.localStorage.getItem("department") || window.localStorage.getItem("dept") || ""
    ).trim();
    if (ls) return ls;
  }
  return "";
}

/** Headers so /dashboard-summary uses the same scope as client-side admin pages. */
export async function getAdminDashboardScopeHeaders() {
  const dept = await getAdminDepartment();
  if (!dept) return {};
  const safe = String(dept).replace(/[\r\n]/g, "").slice(0, 160);
  return safe ? { "X-Admin-Department-Scope": safe } : {};
}

/** GET path with dept_scope query so cross-origin preflight cannot drop the scope (same dept as getAdminDepartment). */
export async function getAdminDashboardSummaryEndpointPath() {
  const dept = await getAdminDepartment();
  if (!dept) return "admin/dashboard-summary";
  const safe = String(dept).replace(/[\r\n]/g, "").slice(0, 160);
  return `admin/dashboard-summary?dept_scope=${encodeURIComponent(safe)}`;
}

export async function getAdminOverviewData() {
  const adminDept = await getAdminDepartment();
  const safeSeRows = await fetchStudentExperimentsRowsForAdmin();

  const { data: subjectRows, error: subjectsError } = await supabase
    .from("subjects")
    .select("id, department");
  const safeSubjectRows = subjectsError ? [] : (subjectRows || []);

  const { data: fullRows, error: fullError } = await supabase
    .from("full_student_data")
    .select("*");
  const safeFullRows = (fullError ? [] : (fullRows || [])).filter(isRealStudentRow);

  const deptFullRowsBase = adminDept
    ? safeFullRows.filter((row) => {
        const d = valueFromRow(row, ["department"], "");
        return deptMatch(d, adminDept) || deptMatchRelaxed(d, adminDept);
      })
    : safeFullRows;
  const deptFullRows = sortByExperimentNo(
    deptFullRowsBase,
    (row) => valueFromRow(row, ["experiment_no", "experimentNo", "experiment_number"], "")
  );

  const { data: allStudentProfiles } = await supabase
    .from("profiles")
    .select("id, department")
    .eq("role", "student");
  const deptStudentIdSet = new Set();
  (allStudentProfiles || []).forEach((p) => {
    const pDept = String(p.department || "");
    if (!adminDept || deptMatch(pDept, adminDept) || deptMatchRelaxed(pDept, adminDept)) {
      deptStudentIdSet.add(String(p.id));
    }
  });
  deptFullRows.forEach((row) => {
    const sid = String(valueFromRow(row, ["student_id", "id"], "")).trim();
    if (sid) deptStudentIdSet.add(sid);
  });

  /** Only experiments for students in this admin's department (avoids counting every row on shared experiments). */
  const scopedSE = adminDept
    ? safeSeRows.filter((row) => deptStudentIdSet.has(String(row.student_id || "")))
    : safeSeRows;
  const scopedSubjects = adminDept
    ? safeSubjectRows.filter((row) => deptMatch(row.department, adminDept))
    : safeSubjectRows;

  const distinctExperiments = new Set(
    (scopedSE.length > 0 ? scopedSE.map((row) => String(row.experiment_id || "")) : deptFullRows.map((row) => String(valueFromRow(row, ["experiment_id"], ""))))
      .filter(Boolean)
  ).size;
  const subjectCount = scopedSubjects.length;
  const evaluatedCount = (scopedSE.length > 0 ? scopedSE : deptFullRows).filter((row) => {
    const status = String(valueFromRow(row, ["status"], "")).toLowerCase();
    return row.is_completed === true || status === "evaluated" || status === "approved";
  }).length;
  const pendingRows = scopedSE.length > 0 ? scopedSE : deptFullRows;
  const pendingCount = pendingRows.filter((row) => rowIsPendingReview(row)).length;

  const marksRows = deptFullRows
    .map((row) => getComputedMark(row))
    .filter((value) => value !== null);
  const avgMarks = marksRows.length
    ? Number((marksRows.reduce((sum, value) => sum + Number(value || 0), 0) / marksRows.length).toFixed(1))
    : 0;

  const trendMap = new Map();
  deptFullRows.forEach((row) => {
    const key = toDateLabel(
      valueFromRow(row, ["submitted_date", "submission_date", "updated_at", "created_at"], "")
    );
    if (!key) return;
    trendMap.set(key, (trendMap.get(key) || 0) + 1);
  });
  const trend = Array.from(trendMap.entries())
    .map(([label, submissions]) => ({ label, submissions }))
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(-12);

  const perfMap = new Map();
  deptFullRows.forEach((row) => {
    const studentId = String(valueFromRow(row, ["student_id", "id"], "") || "");
    if (!studentId) return;
    const prev = perfMap.get(studentId) || {
      student_id: studentId,
      full_name: String(valueFromRow(row, ["full_name", "name", "student_name"], "Student")),
      total_experiments: 0,
      completed: 0,
      total_marks: 0,
    };
    prev.total_experiments += 1;
    const status = String(valueFromRow(row, ["status"], "") || "").toLowerCase();
    if (status === "evaluated" || status === "submitted" || status === "approved" || row.is_completed === true) {
      prev.completed += 1;
    }
    prev.total_marks += toNumber(valueFromRow(row, ["final_marks", "faculty_marks", "ai_marks", "marks"], 0));
    perfMap.set(studentId, prev);
  });
  const studentPerformance = Array.from(perfMap.values()).sort((a, b) => b.total_marks - a.total_marks);

  const activity = deptFullRows
    .slice()
    .sort((a, b) => new Date(String(valueFromRow(b, ["updated_at", "submitted_date", "submission_date", "created_at"], 0))).getTime() - new Date(String(valueFromRow(a, ["updated_at", "submitted_date", "submission_date", "created_at"], 0))).getTime())
    .slice(0, 10)
    .map((row, idx) => ({
      id: `${valueFromRow(row, ["student_id", "id"], "s")}-${valueFromRow(row, ["experiment_id"], "e")}-${idx}`,
      type: valueFromRow(row, ["status"], "status"),
      text: `${String(valueFromRow(row, ["full_name", "name", "student_name"], "Student"))} · ${valueFromRow(row, ["status"], "updated")}`,
      time: valueFromRow(row, ["updated_at", "submitted_date", "submission_date", "created_at"], "recently"),
    }));

  const displayDistinctStudents = deptStudentIdSet.size;

  /** Same source as AdminStatsCards: server counts (service role, department vs institution rules). */
  let summaryFromApi = null;
  let kpiSource = "client";
  try {
    const { data: sessionWrap } = await supabase.auth.getSession();
    const token = sessionWrap?.session?.access_token;
    if (token) {
      const scopeHeaders = await getAdminDashboardScopeHeaders();
      const summaryPath = await getAdminDashboardSummaryEndpointPath();
      const { response } = await requestAdminApi(summaryPath, {
        method: "GET",
        token,
        headers: scopeHeaders,
      });
      if (response.ok) {
        const payload = await response.json().catch(() => null);
        summaryFromApi = payload?.data || null;
        if (summaryFromApi) kpiSource = "api";
      }
    }
  } catch {
    summaryFromApi = null;
  }

  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const studentKpi = summaryFromApi != null && n(summaryFromApi.students) != null ? n(summaryFromApi.students) : displayDistinctStudents;
  const pendingKpi = summaryFromApi != null && n(summaryFromApi.pending) != null ? n(summaryFromApi.pending) : pendingCount;
  const subjectKpi = summaryFromApi != null && n(summaryFromApi.subjects) != null ? n(summaryFromApi.subjects) : subjectCount;
  const facultyMetric = summaryFromApi != null && n(summaryFromApi.faculty) != null ? String(n(summaryFromApi.faculty)) : "—";

  return {
    department: adminDept,
    stats: [
      { label: "Total Students", value: studentKpi, delta: 0, color: "blue", sparkline: [] },
      { label: "Total Experiments", value: distinctExperiments, delta: 0, color: "violet", sparkline: [] },
      { label: "Pending Count", value: pendingKpi, delta: 0, color: "amber", sparkline: [] },
      { label: "Average Marks", value: avgMarks, delta: 0, color: "emerald", sparkline: [] },
    ],
    trend,
    insights: [
      { title: "Evaluated Count", metric: `${evaluatedCount}`, hint: "Evaluated records", tone: "emerald" },
      { title: "Pending Count", metric: `${pendingKpi}`, hint: "Awaiting review (aligned with admin API when available)", tone: "amber" },
      { title: "Total Subjects", metric: `${subjectKpi}`, hint: "subjects (aligned with admin API when available)", tone: "blue" },
      { title: "Faculty", metric: facultyMetric, hint: "profiles · admin dashboard-summary", tone: "violet" },
    ],
    activity,
    subjectCount,
    studentPerformance,
    /** "api" when dashboard-summary succeeded; else client-only KPIs (can diverge from Student management). */
    kpiSource,
  };
}

export async function getDepartmentDashboardData(departmentName) {
  try {
    const { data: fullRows, error: fullError } = await supabase
      .from("full_student_data")
      .select("*");
    const safeFullRows = (fullError ? [] : (fullRows || []))
      .filter(isRealStudentRow)
      .filter((row) => deptMatchRelaxed(valueFromRow(row, ["department", "dept"], ""), departmentName));

    const { data: subjectRows, error: subjectError } = await supabase
      .from("subjects")
      .select("id, name, code, year, semester, department");
    const safeSubjectRows = (subjectError ? [] : (subjectRows || []))
      .filter((row) => deptMatchRelaxed(row.department, departmentName));

    const { data: facultyRows, error: facultyError } = await supabase
      .from("profiles")
      .select("id, name, department, role, email")
      .or("role.eq.faculty,role.eq.teacher,role.eq.staff");

    let safeFacultyRows = facultyError ? [] : (facultyRows || []);
    let matchedFaculty = safeFacultyRows.filter((row) =>
      deptMatchRelaxed(row.department, departmentName)
    );
    if (matchedFaculty.length === 0) {
      matchedFaculty = safeFacultyRows;
    }

    const { data: studentProfiles } = await supabase
      .from("profiles")
      .select("id, name, register_no, department, year, semester, role")
      .eq("role", "student");
    const safeStudentProfiles = (studentProfiles || [])
      .filter((row) => !isFacultyLikeName(row.name))
      .filter((row) => deptMatchRelaxed(row.department, departmentName));

    const studentMap = new Map();

    safeStudentProfiles.forEach((p) => {
      const studentId = String(p.id || "").trim();
      if (!studentId) return;
      studentMap.set(studentId, {
        id: studentId,
        name: String(p.name || "Student"),
        register_no: String(p.register_no || "-"),
        year: String(p.year || "-"),
        semester: String(p.semester || "-"),
        avgGrade: 0,
        completion: 0,
        _totalMarks: 0,
        _count: 0,
        _completed: 0,
      });
    });

    safeFullRows.forEach((row) => {
      const studentId = String(valueFromRow(row, ["student_id", "id"], ""));
      if (!studentId) return;
      const prev = studentMap.get(studentId) || {
        id: studentId,
        name: String(valueFromRow(row, ["full_name", "name", "student_name"], "Student")),
        register_no: String(valueFromRow(row, ["register_no"], "-")),
        year: String(valueFromRow(row, ["year"], "-")),
        semester: String(valueFromRow(row, ["semester"], "-")),
        avgGrade: 0,
        completion: 0,
        _totalMarks: 0,
        _count: 0,
        _completed: 0,
      };
      prev._count += 1;
      const mark = toNumber(valueFromRow(row, ["final_marks", "faculty_marks", "ai_marks", "marks"], 0));
      prev._totalMarks += mark;
      const status = String(valueFromRow(row, ["status"], "")).toLowerCase();
      if (status === "evaluated" || status === "submitted" || status === "approved") prev._completed += 1;
      studentMap.set(studentId, prev);
    });
    const students = Array.from(studentMap.values()).map((row) => ({
      ...row,
      avgGrade: row._count ? Number((row._totalMarks / row._count).toFixed(1)) : 0,
      completion: row._count ? Math.round((row._completed / row._count) * 100) : 0,
    }));

    const trendMap = new Map();
    safeFullRows.forEach((row) => {
      const key = toDateLabel(valueFromRow(row, ["submitted_date", "submission_date", "updated_at", "created_at"], ""));
      if (!key) return;
      trendMap.set(key, (trendMap.get(key) || 0) + 1);
    });
    const trend = Array.from(trendMap.entries()).map(([label, value]) => ({ label, value })).slice(-10);

    const marks = safeFullRows
      .map((row) => toNumber(valueFromRow(row, ["final_marks", "faculty_marks", "ai_marks", "marks"], 0)))
      .filter((v) => Number.isFinite(v));

    const gradeDistribution = [
      { bucket: "0-49", count: marks.filter((v) => v < 50).length },
      { bucket: "50-74", count: marks.filter((v) => v >= 50 && v < 75).length },
      { bucket: "75-89", count: marks.filter((v) => v >= 75 && v < 90).length },
      { bucket: "90-100", count: marks.filter((v) => v >= 90).length },
    ];

    const diffAgg = new Map();
    safeFullRows.forEach((row) => {
      const experimentName = String(valueFromRow(row, ["experiment_title", "experiment_name", "title"], "Experiment"));
      const mark = toNumber(valueFromRow(row, ["final_marks", "faculty_marks", "ai_marks", "marks"], 0));
      const prev = diffAgg.get(experimentName) || { experiment: experimentName, total: 0, count: 0 };
      prev.total += mark;
      prev.count += 1;
      diffAgg.set(experimentName, prev);
    });
    const difficulty = Array.from(diffAgg.values()).map((row) => ({
      experiment: row.experiment,
      avgGrade: row.count ? Number((row.total / row.count).toFixed(1)) : 0,
      submitTime: 0,
    }));

    const experimentList = Array.from(
      new Set(
        safeFullRows
          .map((row) => String(valueFromRow(row, ["experiment_title", "experiment_name", "title"], "")).trim())
          .filter(Boolean)
      )
    );

    const matrixRows = students.map((student) => {
      const sourceRows = safeFullRows.filter((row) => String(valueFromRow(row, ["student_id", "id"], "")) === String(student.id));
      const byExperiment = new Map();
      sourceRows.forEach((row) => {
        const exp = String(valueFromRow(row, ["experiment_title", "experiment_name", "title"], "")).trim();
        if (!exp) return;
        byExperiment.set(exp, {
          experiment: exp,
          score: toNumber(valueFromRow(row, ["final_marks", "faculty_marks", "ai_marks", "marks"], 0)),
          status: String(valueFromRow(row, ["status"], "")).toLowerCase() || "pending",
        });
      });
      const cells = experimentList.map((exp) => byExperiment.get(exp) || { experiment: exp, score: 0, status: "pending" });
      return { studentName: student.name, cells };
    });

    return {
      department: departmentName,
      stats: {
        students: students.length,
        faculty: matchedFaculty.length,
        subjects: safeSubjectRows.length,
      },
      students,
      faculty: matchedFaculty.map((row) => ({ id: row.id, name: row.name || "Faculty", assigned: 0 })),
      subjects: safeSubjectRows.map((row) => ({
        id: row.id,
        name: row.name || "Untitled Subject",
        code: row.code || "",
        year: row.year || "",
        semester: row.semester || "",
        experiments: 0,
      })),
      experiments: experimentList,
      matrix: matrixRows,
      trend,
      gradeDistribution,
      difficulty,
    };
  } catch (err) {
    console.error("getDepartmentDashboardData error:", err);
    return {
      department: departmentName,
      stats: { students: 0, faculty: 0, subjects: 0 },
      students: [],
      faculty: [],
      subjects: [],
      experiments: [],
      matrix: [],
      trend: [],
      gradeDistribution: [],
      difficulty: [],
    };
  }
}

export async function getStudentsPageData(department) {
  const { data, error } = await supabase.from("full_student_data").select("*");
  let safeRows = (error ? [] : (data || [])).filter(isRealStudentRow);
  if (department) {
    safeRows = safeRows.filter((row) =>
      deptMatchRelaxed(valueFromRow(row, ["department"], ""), department)
    );
  }
  const grouped = new Map();
  safeRows.forEach((row) => {
    const studentId = String(valueFromRow(row, ["student_id", "id"], ""));
    if (!studentId) return;
    // Prefer student_name (set by student at submission time) over generic profile 'name'
    // which can be a faculty/admin name if the view join is wrong.
    const resolvedName =
      String(valueFromRow(row, ["student_name"], "")).trim() ||
      String(valueFromRow(row, ["full_name"], "")).trim() ||
      String(valueFromRow(row, ["name"], "")).trim() ||
      "Student";
    const prev = grouped.get(studentId) || {
      id: studentId,
      name: isFacultyLikeName(resolvedName) ? "Student" : resolvedName,
      email: String(valueFromRow(row, ["email"], "")),
      register_no: String(valueFromRow(row, ["register_no"], "-")),
      registerNo: String(valueFromRow(row, ["register_no"], "-")),
      department: String(valueFromRow(row, ["department"], "Unassigned")),
      year: String(valueFromRow(row, ["year"], "-")),
      semester: String(valueFromRow(row, ["semester"], "-")),
      avgGrade: 0,
      status: "Active",
      completion: 0,
      _total: 0,
      _completed: 0,
      _marks: 0,
    };
    prev._total += 1;
    const status = String(valueFromRow(row, ["status"], "")).toLowerCase();
    if (status === "submitted" || status === "evaluated" || status === "approved") prev._completed += 1;
    prev._marks += toNumber(valueFromRow(row, ["final_marks", "faculty_marks", "ai_marks", "marks"], 0));
    grouped.set(studentId, prev);
  });

  // Cross-enrich names from profiles table so leaderboard shows the real profile name
  // (the authoritative source) rather than whatever was written into student_name at submission.
  if (grouped.size > 0) {
    const ids = Array.from(grouped.keys()).filter(Boolean);
    // Chunk to stay under Supabase in-filter limits
    const CHUNK = 200;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, name, register_no")
        .in("id", chunk);
      if (Array.isArray(profs)) {
        profs.forEach((p) => {
          const uid = String(p.id || "");
          const row = grouped.get(uid);
          if (!row) return;
          const profileName = String(p.name || "").trim();
          const profileReg = String(p.register_no || "").trim();
          // Only override if profile name is not a faculty-like name
          if (profileName && !isFacultyLikeName(profileName)) {
            row.name = profileName;
          }
          // Fill register_no from profile if missing
          if (profileReg && isUsableRegisterNo(profileReg) && !isUsableRegisterNo(row.register_no)) {
            row.register_no = profileReg;
            row.registerNo = profileReg;
          }
          grouped.set(uid, row);
        });
      }
    }
  }

  // Always fetch all registered student profiles so students like SANJAY S appear in the leaderboard
  let profQuery = supabase
    .from("profiles")
    .select("id, name, register_no, department, year, semester, email, xp_points, level")
    .eq("role", "student");
  const { data: profs, error: profErr } = await profQuery;
  if (!profErr && Array.isArray(profs)) {
    profs
      .filter((row) => (department ? deptMatchRelaxed(row.department, department) : true))
      .filter((row) => !isFacultyLikeName(String(row.name || "")))
      .filter((row) => isUsableRegisterNo(row.register_no))
      .forEach((p) => {
        const studentId = String(p.id || "");
        if (!studentId) return;
        const existing = grouped.get(studentId);
        if (existing) {
          if (p.name && !isFacultyLikeName(p.name)) existing.name = String(p.name).trim();
          if (p.register_no && isUsableRegisterNo(p.register_no)) {
            existing.register_no = String(p.register_no).trim();
            existing.registerNo = String(p.register_no).trim();
          }
          if (p.xp_points != null) existing._xp = Number(p.xp_points);
          if (p.level != null) existing._level = Number(p.level);
        } else {
          grouped.set(studentId, {
            id: studentId,
            name: String(p.name || "Student"),
            email: String(p.email || ""),
            register_no: String(p.register_no || "-"),
            registerNo: String(p.register_no || "-"),
            department: String(p.department || "Unassigned"),
            year: String(p.year || "-"),
            semester: String(p.semester || "-"),
            avgGrade: 0,
            status: "Active",
            completion: 0,
            _total: 0,
            _completed: 0,
            _marks: 0,
            _xp: Number(p.xp_points || 0),
            _level: Number(p.level || 1),
          });
        }
      });
  }

  return Array.from(grouped.values()).map((row) => ({
    ...row,
    avgGrade: row._completed ? Number((row._marks / row._completed).toFixed(1)) : 0,
    completion: row._total ? Math.round((row._completed / row._total) * 100) : 0,
  }));
}

function getManualApiBase() {
  return import.meta.env.VITE_MANUAL_API_URL || "http://localhost:7001";
}

/** Real XP from Express gamification (service role); avoids RLS hiding other users' profiles. */
async function fetchGamificationXpMap(department) {
  const base = getManualApiBase();
  const params = new URLSearchParams({ limit: "2000", role: "student" });
  if (department) params.set("department", department);
  try {
    const res = await fetch(`${base}/api/gamification/leaderboard?${params}`);
    const json = await res.json();
    if (!json?.success || !Array.isArray(json.data)) return new Map();
    const m = new Map();
    json.data.forEach((row) => {
      m.set(String(row.user_id || ""), {
        xp: Number(row.xp_points ?? 0),
        level: Number(row.level ?? 1),
      });
    });
    return m;
  } catch (e) {
    console.warn("fetchGamificationXpMap failed", e);
    return new Map();
  }
}

function detectGradeScale(students) {
  const grades = students.map((s) => Number(s.avgGrade || 0)).filter((g) => Number.isFinite(g) && g > 0);
  if (grades.length === 0) {
    return {
      isOutOf10: true,
      highBandThreshold: 7.5,
      topBucketKey: "9-10",
      bucketLegend: "0–4, 5–6, 7–8, 9–10 (out of 10)",
    };
  }
  const maxG = Math.max(...grades);
  const isOutOf10 = maxG <= 10.5;
  if (isOutOf10) {
    return {
      isOutOf10: true,
      highBandThreshold: 7.5,
      topBucketKey: "9-10",
      bucketLegend: "0–4, 5–6, 7–8, 9–10 (out of 10)",
    };
  }
  return {
    isOutOf10: false,
    highBandThreshold: 75,
    topBucketKey: "90-100",
    bucketLegend: "0–49, 50–74, 75–89, 90–100 (out of 100)",
  };
}

function buildGradeDistribution(students, scale) {
  const g = (s) => Number(s.avgGrade || 0);
  if (scale.isOutOf10) {
    return [
      { bucket: "0-4", count: students.filter((s) => g(s) < 5).length },
      { bucket: "5-6", count: students.filter((s) => g(s) >= 5 && g(s) < 7).length },
      { bucket: "7-8", count: students.filter((s) => g(s) >= 7 && g(s) < 9).length },
      { bucket: "9-10", count: students.filter((s) => g(s) >= 9).length },
    ];
  }
  return [
    { bucket: "0-49", count: students.filter((s) => g(s) < 50).length },
    { bucket: "50-74", count: students.filter((s) => g(s) >= 50 && g(s) < 75).length },
    { bucket: "75-89", count: students.filter((s) => g(s) >= 75 && g(s) < 90).length },
    { bucket: "90-100", count: students.filter((s) => g(s) >= 90).length },
  ];
}

export async function getLeaderboardData(department) {
  const dept = department || (await getAdminDepartment());
  const students = await getStudentsPageData(dept || undefined);
  const gradeScale = detectGradeScale(students);
  const gradeDistribution = buildGradeDistribution(students, gradeScale);

  const xpMap = await fetchGamificationXpMap(dept || undefined);

  const ranked = students
    .slice()
    .map((row) => {
      const uid = String(row.id || "");
      const xpRow = xpMap.get(uid);
      const profileXp = Number(row._xp || 0);
      const syntheticXp = Math.round(
        Number(row.avgGrade || 0) * 10 + Number(row.completion || 0) * 2
      );
      const xp = xpRow != null ? xpRow.xp : (profileXp > 0 ? profileXp : syntheticXp);
      const gamificationLevel = xpRow?.level ?? row._level ?? 1;
      return {
        ...row,
        completed: Math.round((Number(row.completion || 0) / 100) * Number(row._total || 0)),
        xp,
        gamificationLevel,
      };
    })
    .sort((a, b) => {
      if (b.xp !== a.xp) return b.xp - a.xp;
      if (b.avgGrade !== a.avgGrade) return Number(b.avgGrade || 0) - Number(a.avgGrade || 0);
      return Number(b.completion || 0) - Number(a.completion || 0);
    })
    .map((row, idx) => ({
      ...row,
      rank: idx + 1,
    }));

  const avgAll = ranked.length
    ? Number((ranked.reduce((sum, row) => sum + Number(row.avgGrade || 0), 0) / ranked.length).toFixed(1))
    : 0;

  return {
    ranked,
    gradeDistribution,
    avgAll,
    totalStudents: ranked.length,
    department: dept,
    isDemo: false,
    gradeScale: gradeScale.isOutOf10 ? "out_of_10" : "out_of_100",
    highBandThreshold: gradeScale.highBandThreshold,
    topBucketKey: gradeScale.topBucketKey,
    gradeBucketLegend: gradeScale.bucketLegend,
  };
}

function rowMarkExp(row) {
  const n = (v) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  };
  return Math.max(n(row?.faculty_marks), n(row?.ai_marks), n(row?.marks));
}

async function mergeSubmissionsExpClient(existingRows, ctx) {
  const { adminDept, scopedStudentIds, scopedSubjectIds, scopedExperimentIds } = ctx;
  const keyOf = (r) => `${String(r.student_id || "")}|${String(r.experiment_id || r.exp_id || "")}`;
  const byKey = new Map();
  (existingRows || []).forEach((r) => {
    const sid = String(r.student_id || "");
    const eid = String(r.experiment_id || r.exp_id || "");
    if (sid && eid) byKey.set(keyOf(r), { ...r, experiment_id: eid });
  });

  const subVariants = [
    "student_id, exp_id, subject_id, status, marks, updated_at",
    "student_id, exp_id, subject_id, status, marks",
    "student_id, exp_id, status, marks",
  ];
  let subs = [];
  for (const sel of subVariants) {
    const { data, error } = await supabase.from("submissions").select(sel).limit(12000);
    if (!error) {
      subs = data || [];
      break;
    }
    const msg = String(error.message || "").toLowerCase();
    if (msg.includes("column") || msg.includes("schema") || msg.includes("does not exist")) continue;
    break;
  }

  for (const s of subs) {
    const sid = String(s.student_id || "");
    const expId = String(s.exp_id || s.experiment_id || "");
    const subj = String(s.subject_id || "");
    if (!sid || !expId) continue;
    if (adminDept) {
      const inScope =
        scopedStudentIds.has(sid) ||
        (subj && scopedSubjectIds.has(subj)) ||
        scopedExperimentIds.has(expId);
      if (!inScope) continue;
    }
    const k = `${sid}|${expId}`;
    if (byKey.has(k)) {
      const cur = byKey.get(k);
      const sm = s.marks != null ? Number(s.marks) : 0;
      if (Number.isFinite(sm) && sm > rowMarkExp(cur)) {
        const st = String(s.status || cur.status || "submitted").toLowerCase();
        byKey.set(k, {
          ...cur,
          faculty_marks: sm,
          marks: sm,
          status: st,
          is_completed: cur.is_completed === true || st === "evaluated" || sm > 0,
        });
      }
      continue;
    }
    const st = String(s.status || "submitted").toLowerCase();
    const mk = s.marks != null ? Number(s.marks) : null;
    byKey.set(k, {
      student_id: sid,
      experiment_id: expId,
      is_completed: st === "evaluated" || (mk != null && Number.isFinite(mk) && mk > 0),
      status: st,
      faculty_marks: mk,
      ai_marks: null,
      marks: mk,
    });
  }
  return Array.from(byKey.values());
}

async function buildExperimentAnalyticsFromClient() {
  const adminDept = await getAdminDepartment();
  const { data: profileRows, error: profileError } = await supabase
    .from("profiles")
    .select("id, name, register_no, department, role")
    .eq("role", "student");
  const safeProfiles = (profileError ? [] : (profileRows || [])).filter((row) => {
    if (adminDept && !deptMatchRelaxed(row.department, adminDept)) return false;
    const name = String(row.name || "").trim();
    if (isFacultyLikeName(name)) return false;
    return true;
  });
  const scopedStudentIds = new Set(
    safeProfiles.map((row) => String(row.id || "").trim()).filter(Boolean)
  );

  const { data: subjectRows, error: subjectError } = await supabase
    .from("subjects")
    .select("id, department");
  const safeSubjects = subjectError ? [] : (subjectRows || []);
  const scopedSubjectIds = new Set(
    safeSubjects
      .filter((row) => (adminDept ? deptMatchRelaxed(row.department, adminDept) : true))
      .map((row) => String(row.id || ""))
      .filter(Boolean)
  );

  const { data: experimentRows, error: experimentError } = await supabase
    .from("experiments")
    .select("id, title, subject_id");
  const safeExperimentRows = experimentError ? [] : (experimentRows || []);
  const scopedExperimentIds = new Set(
    safeExperimentRows
      .filter((row) => (adminDept ? scopedSubjectIds.has(String(row.subject_id || "")) : true))
      .map((row) => String(row.id || ""))
      .filter(Boolean)
  );
  const expNameMap = new Map(
    safeExperimentRows.map((row) => [String(row.id), String(row.title || `Experiment ${row.id}`)])
  );

  const safeSeRows = await fetchStudentExperimentsRowsForAdmin();
  let rows = safeSeRows.filter((row) => {
    if (!adminDept) return true;
    const byStudent = scopedStudentIds.has(String(row.student_id || ""));
    const byExperiment = scopedExperimentIds.has(String(row.experiment_id || ""));
    return byStudent || byExperiment;
  });

  rows = await mergeSubmissionsExpClient(rows, {
    adminDept,
    scopedStudentIds,
    scopedSubjectIds,
    scopedExperimentIds,
  });

  const totalCount = rows.length;
  const submittedCount = rows.filter((row) => {
    const status = String(row.status || "").toLowerCase();
    if (status === "draft" || status === "locked" || status === "not_started") return false;
    if (
      ["submitted", "evaluated", "approved", "pending", "pending_review", "under_review", "in_progress"].includes(
        status
      )
    )
      return true;
    return rowMarkExp(row) > 0;
  }).length;
  const reviewedRows = rows.filter((row) => {
    const status = String(row.status || "").toLowerCase();
    if (rowMarkExp(row) > 0) return true;
    return status === "evaluated" || status === "approved" || row.is_completed === true;
  });
  const reviewedCount = reviewedRows.length;
  const markedRows = reviewedRows.map((row) => ({
    ...row,
    mark: rowMarkExp(row),
  }));

  const statusAgg = new Map();
  rows.forEach((row) => {
    const status = String(row.status || "unknown").toLowerCase();
    statusAgg.set(status, (statusAgg.get(status) || 0) + 1);
  });
  const heatMap = Array.from(statusAgg.entries()).map(([label, value]) => ({ label, value }));

  const distribution = [
    { bucket: "0-2", count: markedRows.filter((row) => Number(row.mark) <= 2).length },
    { bucket: "3-4", count: markedRows.filter((row) => Number(row.mark) > 2 && Number(row.mark) <= 4).length },
    { bucket: "5-6", count: markedRows.filter((row) => Number(row.mark) > 4 && Number(row.mark) <= 6).length },
    { bucket: "7-8", count: markedRows.filter((row) => Number(row.mark) > 6 && Number(row.mark) <= 8).length },
    { bucket: "9-10", count: markedRows.filter((row) => Number(row.mark) > 8).length },
  ];

  const diffAgg = new Map();
  markedRows.forEach((row) => {
    const key = String(row.experiment_id || "");
    const prev = diffAgg.get(key) || { total: 0, count: 0 };
    prev.total += Number(row.mark || 0);
    prev.count += 1;
    diffAgg.set(key, prev);
  });
  const difficulty = Array.from(diffAgg.entries()).map(([experimentId, value]) => ({
    experiment: expNameMap.get(String(experimentId)) || `Experiment ${experimentId}`,
    value: value.count ? Number((value.total / value.count).toFixed(1)) : 0,
  }));

  const topAgg = new Map();
  markedRows.forEach((row) => {
    const sid = String(row.student_id || "");
    const prev = topAgg.get(sid) || 0;
    topAgg.set(sid, prev + Number(row.mark || 0));
  });
  const studentNameMap = new Map(
    safeProfiles.map((row) => [String(row.id || ""), String(row.name || "Student")])
  );
  const topStudents = Array.from(topAgg.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([studentId, total]) => ({
      student: studentNameMap.get(studentId) || "Student",
      experiment: "Total",
      marks: Number(total.toFixed(1)),
    }));

  return {
    funnel: [
      { stage: "Assigned", count: totalCount, pct: totalCount ? 100 : 0 },
      { stage: "Submitted", count: submittedCount, pct: totalCount ? Math.round((submittedCount / totalCount) * 100) : 0 },
      { stage: "Reviewed", count: reviewedCount, pct: totalCount ? Math.round((reviewedCount / totalCount) * 100) : 0 },
      { stage: "Graded", count: markedRows.length, pct: totalCount ? Math.round((markedRows.length / totalCount) * 100) : 0 },
    ],
    distribution,
    heatMap,
    difficulty,
    topGrades: topStudents,
    isDemo: false,
    statusDistribution: heatMap,
    averageMarks: markedRows.length ? Number((markedRows.reduce((sum, row) => sum + Number(row.mark || 0), 0) / markedRows.length).toFixed(2)) : 0,
    topPerformers: topStudents,
  };
}

/** Prefer Node API (service role) so RLS does not hide student_experiments / profiles. */
export async function getExperimentAnalyticsData() {
  try {
    const { data: sessionWrap } = await supabase.auth.getSession();
    const token = sessionWrap?.session?.access_token;
    if (token) {
      const headers = await getAdminDashboardScopeHeaders();
      const path = (await getAdminDashboardSummaryEndpointPath()).replace(
        "dashboard-summary",
        "experiment-analytics"
      );
      const { response } = await requestAdminApi(path, {
        method: "GET",
        token,
        headers,
      });
      if (response.ok) {
        const payload = await response.json().catch(() => null);
        if (payload?.success && payload?.data) return payload.data;
      }
    }
  } catch {
    /* fall back to client */
  }
  return buildExperimentAnalyticsFromClient();
}
