const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const { requireAuth, requireRole } = require("../middleware/authMiddleware.cjs");

const router = express.Router();
const ALLOWED_ROLES = new Set(["student", "faculty", "admin"]);
const STUDENT_SORT_KEYS = new Set(["name", "register_no", "email", "department", "created_at"]);
const DEFAULT_DEPARTMENT_CATALOG = [
  "INFORMATION TECHNOLOGY",
  "ARTIFICIAL INTELLIGENCE DATA SCIENCE",
  "COMPUTER SCIENCE",
  "COMPUTER SCIENCE AND BUSSINESS SYSTEM",
  "COMPUTER SCIENCE AND ENGINEERING",
  "ELECTRONICS AND COMMUNICATION ENGINEERING",
  "ELECTRICAL AND ELECTRONICS ENGINEERING",
  "MECHANICAL ENGINEERING",
  "CIVIL ENGINEERING",
];

function getSupabaseServerClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase configuration missing");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function trimOrNull(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeDepartmentInput(value) {
  return String(value || "").trim();
}

function normalizeDepartmentKey(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";

  const compact = normalized.replace(/\s+/g, "");
  if (compact === "administration" || compact === "admin") return "administration";
  if (compact === "aids" || compact === "artificialintelligenceanddatascience" || compact === "artificialintelligencedatascience") {
    return "artificial intelligence data science";
  }
  if (compact === "it" || compact === "informationtechnology") {
    return "information technology";
  }
  if (
    compact === "csbs" ||
    compact === "computerscienceandbusinesssystems" ||
    compact === "computerscienceandbusinesssystem" ||
    compact === "computerscienceandbussinesssystem" ||
    compact === "computerscienceandbussinesssystems"
  ) {
    return "computer science and business systems";
  }
  if (compact === "cse" || compact === "computerscienceengineering" || compact === "computerscienceandengineering") {
    return "computer science and engineering";
  }
  if (compact === "cs" || compact === "computerscience") {
    return "computer science";
  }
  return normalized;
}

function isSameDepartment(left, right) {
  return normalizeDepartmentKey(left) === normalizeDepartmentKey(right);
}

/** Aligns with client `deptMatchRelaxed` — IT vs full department name, etc. */
function isSameDepartmentRelaxed(left, right) {
  if (isSameDepartment(left, right)) return true;
  const a = String(left || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  const b = String(right || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

function isFacultyLikeNameAnalytics(name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return true;
  if (/^(mr|mrs|ms|miss|dr|prof|sir)\b/.test(n)) return true;
  if (n.includes("faculty") || n.includes("admin")) return true;
  return false;
}

function rowMarkExperimentAnalytics(row) {
  const n = (v) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  };
  return Math.max(n(row?.faculty_marks), n(row?.ai_marks), n(row?.marks));
}

/** Many installs store progress only in `submissions` — merge for admin charts. */
async function mergeSubmissionsIntoExperimentRows(supabase, existingRows, ctx) {
  const { useInstitutionWide, scopeDepartment, scopedStudentIds, scopedSubjectIds, scopedExperimentIds } =
    ctx;
  const keyOf = (r) => `${String(r.student_id || "")}|${String(r.experiment_id || r.exp_id || "")}`;
  const byKey = new Map();
  (existingRows || []).forEach((r) => {
    if (String(r.student_id || "") && String(r.experiment_id || r.exp_id || "")) {
      byKey.set(keyOf(r), { ...r, experiment_id: String(r.experiment_id || r.exp_id || "") });
    }
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
    throw error;
  }

  for (const s of subs) {
    const sid = String(s.student_id || "");
    const expId = String(s.exp_id || s.experiment_id || "");
    const subj = String(s.subject_id || "");
    if (!sid || !expId) continue;

    if (!useInstitutionWide && scopeDepartment) {
      const inScope =
        scopedStudentIds.has(sid) || (subj && scopedSubjectIds.has(subj)) || scopedExperimentIds.has(expId);
      if (!inScope) continue;
    }

    const k = `${sid}|${expId}`;
    if (byKey.has(k)) {
      const cur = byKey.get(k);
      const curM = rowMarkExperimentAnalytics(cur);
      const sm = s.marks != null ? Number(s.marks) : 0;
      if (Number.isFinite(sm) && sm > curM) {
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

async function computeExperimentAnalyticsPayload(supabase, scopeDepartment, useInstitutionWide) {
  const { data: profileRows, error: profileError } = await supabase
    .from("profiles")
    .select("id, name, register_no, department, role")
    .eq("role", "student");
  if (profileError) throw profileError;

  /** Do not require register_no — RLS/UI often hide students when register is blank. */
  const safeProfiles = (profileRows || []).filter((row) => {
    if (!useInstitutionWide && scopeDepartment) {
      if (!isSameDepartmentRelaxed(row.department, scopeDepartment)) return false;
    }
    if (isFacultyLikeNameAnalytics(row.name)) return false;
    return true;
  });
  const scopedStudentIds = new Set(
    safeProfiles.map((row) => String(row.id || "").trim()).filter(Boolean)
  );

  const { data: subjectRows, error: subjectError } = await supabase.from("subjects").select("id, department");
  const safeSubjects = subjectError ? [] : subjectRows || [];
  const scopedSubjectIds = new Set(
    safeSubjects
      .filter((row) => {
        if (useInstitutionWide || !scopeDepartment) return true;
        return isSameDepartmentRelaxed(row.department, scopeDepartment);
      })
      .map((row) => String(row.id || ""))
      .filter(Boolean)
  );

  const { data: experimentRows, error: experimentError } = await supabase
    .from("experiments")
    .select("id, title, subject_id");
  const safeExperimentRows = experimentError ? [] : experimentRows || [];
  const scopedExperimentIds = new Set(
    safeExperimentRows
      .filter((row) => {
        if (useInstitutionWide || !scopeDepartment) return true;
        return scopedSubjectIds.has(String(row.subject_id || ""));
      })
      .map((row) => String(row.id || ""))
      .filter(Boolean)
  );
  const expNameMap = new Map(
    safeExperimentRows.map((row) => [String(row.id), String(row.title || `Experiment ${row.id}`)])
  );

  let seData = [];
  const seVariants = [
    "student_id, experiment_id, is_completed, status, faculty_marks, ai_marks, submitted_date",
    "student_id, experiment_id, is_completed, status, faculty_marks, ai_marks",
    "student_id, experiment_id, is_completed, status",
  ];
  for (const sel of seVariants) {
    const { data, error } = await supabase.from("student_experiments").select(sel);
    if (!error) {
      seData = data || [];
      break;
    }
    const msg = String(error.message || "").toLowerCase();
    if (msg.includes("column") || msg.includes("schema") || msg.includes("does not exist")) continue;
    throw error;
  }

  let rows = seData.filter((row) => {
    if (useInstitutionWide || !scopeDepartment) return true;
    const byStudent = scopedStudentIds.has(String(row.student_id || ""));
    const byExperiment = scopedExperimentIds.has(String(row.experiment_id || ""));
    return byStudent || byExperiment;
  });

  rows = await mergeSubmissionsIntoExperimentRows(supabase, rows, {
    useInstitutionWide,
    scopeDepartment,
    scopedStudentIds,
    scopedSubjectIds,
    scopedExperimentIds,
  });

  const totalCount = rows.length;
  const submittedCount = rows.filter((row) => {
    const status = String(row.status || "").toLowerCase();
    if (status === "draft" || status === "locked" || status === "not_started") return false;
    if (["submitted", "evaluated", "approved", "pending", "pending_review", "under_review", "in_progress"].includes(status))
      return true;
    return rowMarkExperimentAnalytics(row) > 0;
  }).length;
  const reviewedRows = rows.filter((row) => {
    const status = String(row.status || "").toLowerCase();
    if (rowMarkExperimentAnalytics(row) > 0) return true;
    return status === "evaluated" || status === "approved" || row.is_completed === true;
  });
  const reviewedCount = reviewedRows.length;
  const markedRows = reviewedRows.map((row) => ({
    ...row,
    mark: rowMarkExperimentAnalytics(row),
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
    averageMarks: markedRows.length
      ? Number((markedRows.reduce((sum, row) => sum + Number(row.mark || 0), 0) / markedRows.length).toFixed(2))
      : 0,
    topPerformers: topStudents,
  };
}

function getDepartmentCatalogFallback() {
  const envCatalog = String(process.env.ADMIN_DEPARTMENT_CATALOG || "")
    .split(",")
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const source = envCatalog.length ? envCatalog : DEFAULT_DEPARTMENT_CATALOG;
  return Array.from(new Set(source)).sort((a, b) => a.localeCompare(b));
}

function canonicalDepartmentLabel(value) {
  const key = normalizeDepartmentKey(value);
  if (!key || key === "administration") return null;
  const labels = {
    "information technology": "INFORMATION TECHNOLOGY",
    "artificial intelligence data science": "ARTIFICIAL INTELLIGENCE DATA SCIENCE",
    "computer science": "COMPUTER SCIENCE",
    "computer science and engineering": "COMPUTER SCIENCE AND ENGINEERING",
    "computer science and business systems": "COMPUTER SCIENCE AND BUSSINESS SYSTEM",
    "electronics and communication engineering": "ELECTRONICS AND COMMUNICATION ENGINEERING",
    "electrical and electronics engineering": "ELECTRICAL AND ELECTRONICS ENGINEERING",
    "mechanical engineering": "MECHANICAL ENGINEERING",
    "civil engineering": "CIVIL ENGINEERING",
  };
  return labels[key] || key.toUpperCase();
}

function withDepartmentFallback(values) {
  const cleanValues = (Array.isArray(values) ? values : [])
    .map((item) => canonicalDepartmentLabel(item))
    .filter(Boolean);
  const fallbackValues = getDepartmentCatalogFallback()
    .map((item) => canonicalDepartmentLabel(item))
    .filter(Boolean);
  return Array.from(new Set([...cleanValues, ...fallbackValues])).sort((a, b) =>
    a.localeCompare(b)
  );
}

function buildProfilePayload(userId, payload) {
  const normalizedEmail = String(payload.email || "").trim().toLowerCase();
  return {
    id: userId,
    email: normalizedEmail,
    role: payload.role,
    name: String(payload.name || "").trim(),
    department: trimOrNull(payload.department),
    register_no: payload.role === "student" ? trimOrNull(payload.register_no) : null,
    year: payload.role === "student" || payload.role === "faculty" ? trimOrNull(payload.year) : null,
    semester:
      payload.role === "student" || payload.role === "faculty"
        ? trimOrNull(payload.semester)
        : null,
  };
}

function isStudentSubjectsFkError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("student_subjects") &&
    message.includes("foreign key")
  );
}

function extractMissingStudentsColumn(error) {
  const message = String(error?.message || error || "");
  const schemaCacheMatch = message.match(/Could not find the '([^']+)' column of 'students'/i);
  if (schemaCacheMatch?.[1]) return schemaCacheMatch[1];
  const pgMatch = message.match(/column ["']([^"']+)["'] does not exist/i);
  if (pgMatch?.[1]) return pgMatch[1];
  return "";
}

function isOnConflictConstraintError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("on conflict") &&
    message.includes("constraint")
  );
}

function isDuplicateKeyError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("duplicate key") ||
    message.includes("already exists")
  );
}

function extractMissingSubjectsColumn(error) {
  const message = String(error?.message || error || "");
  const schemaCacheMatch = message.match(/Could not find the '([^']+)' column of 'subjects'/i);
  if (schemaCacheMatch?.[1]) return schemaCacheMatch[1];
  const pgMatch = message.match(/column ["']([^"']+)["'] does not exist/i);
  if (pgMatch?.[1]) return pgMatch[1];
  return "";
}

function isMissingColumnError(error) {
  return Boolean(extractMissingSubjectsColumn(error));
}

function sanitizeSubjectPayload(payload) {
  return {
    name: String(payload?.name || "").trim(),
    code: trimOrNull(payload?.code),
    department: trimOrNull(payload?.department),
    year: trimOrNull(payload?.year),
    semester: trimOrNull(payload?.semester),
  };
}

async function createSubjectAdaptive(supabase, payload) {
  const base = sanitizeSubjectPayload(payload);
  if (!base.name) {
    throw new Error("Subject name is required");
  }

  const variants = [
    { ...base },
    { name: base.name, department: base.department, year: base.year, semester: base.semester },
    { name: base.name, code: base.code, department: base.department },
    { name: base.name, department: base.department },
    { name: base.name, code: base.code },
    { name: base.name },
  ];

  let lastError = null;
  for (const variant of variants) {
    let candidate = Object.fromEntries(
      Object.entries(variant).filter(([, value]) => value !== null && value !== undefined && value !== "")
    );
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await supabase
        .from("subjects")
        .insert(candidate)
        .select("id, name, code, department, year, semester")
        .maybeSingle();

      if (!response.error) {
        return response.data || null;
      }

      lastError = response.error;
      const missingColumn = extractMissingSubjectsColumn(response.error);
      if (missingColumn && Object.prototype.hasOwnProperty.call(candidate, missingColumn)) {
        delete candidate[missingColumn];
        continue;
      }
      break;
    }
  }

  throw new Error(lastError?.message || "Failed to create subject");
}

async function updateSubjectAdaptive(supabase, subjectId, payload) {
  const base = sanitizeSubjectPayload(payload);
  const requestedKeys = Object.keys(payload || {});
  const allowedKeys = ["name", "code", "department", "year", "semester"];
  let candidate = {};
  for (const key of allowedKeys) {
    if (requestedKeys.includes(key)) {
      candidate[key] = base[key];
    }
  }

  if (Object.keys(candidate).length === 0) {
    throw new Error("At least one subject field is required for update");
  }
  if (Object.prototype.hasOwnProperty.call(candidate, "name") && !candidate.name) {
    throw new Error("Subject name cannot be empty");
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await supabase
      .from("subjects")
      .update(candidate)
      .eq("id", subjectId)
      .select("id, name, code, department, year, semester")
      .maybeSingle();

    if (!response.error) {
      return response.data || null;
    }

    const missingColumn = extractMissingSubjectsColumn(response.error);
    if (missingColumn && Object.prototype.hasOwnProperty.call(candidate, missingColumn)) {
      delete candidate[missingColumn];
      if (Object.keys(candidate).length === 0) {
        throw new Error("No updateable fields are available in this deployment");
      }
      continue;
    }

    throw new Error(response.error?.message || "Failed to update subject");
  }

  throw new Error("Failed to update subject");
}

async function writeStudentsRowAdaptive(supabase, basePayload) {
  let payload = { ...basePayload };
  let lastError = null;

  // Phase 1: preferred upsert by id.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const upsertRes = await supabase
      .from("students")
      .upsert(payload, { onConflict: "id" });
    if (!upsertRes.error) {
      return;
    }
    lastError = upsertRes.error;

    const missingColumn = extractMissingStudentsColumn(upsertRes.error);
    if (missingColumn && Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
      delete payload[missingColumn];
      continue;
    }

    if (isOnConflictConstraintError(upsertRes.error)) {
      break;
    }

    // Unknown/non-recoverable error.
    break;
  }

  // Phase 2: insert, then update-by-id fallback for duplicate keys.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const insertRes = await supabase
      .from("students")
      .insert(payload);
    if (!insertRes.error) {
      return;
    }
    lastError = insertRes.error;

    const missingColumn = extractMissingStudentsColumn(insertRes.error);
    if (missingColumn && Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
      delete payload[missingColumn];
      continue;
    }

    if (isDuplicateKeyError(insertRes.error) && payload.id) {
      const updatePayload = { ...payload };
      delete updatePayload.id;
      const updateRes = await supabase
        .from("students")
        .update(updatePayload)
        .eq("id", payload.id);
      if (!updateRes.error) {
        return;
      }
      lastError = updateRes.error;
      const missingUpdateColumn = extractMissingStudentsColumn(updateRes.error);
      if (missingUpdateColumn && Object.prototype.hasOwnProperty.call(payload, missingUpdateColumn)) {
        delete payload[missingUpdateColumn];
        continue;
      }
    }

    break;
  }

  throw new Error(lastError?.message || "Failed to sync students table");
}

async function upsertStudentsMasterRow(supabase, userId, payload) {
  if (String(payload?.role || "") !== "student") return;

  const safeUserId = String(userId || "").trim();
  const safeName = String(payload?.name || "").trim();
  const safeEmail = String(payload?.email || "").trim().toLowerCase();
  const safeDepartment = trimOrNull(payload?.department);
  const safeRegisterNo = trimOrNull(payload?.register_no);
  const safeYear = trimOrNull(payload?.year);
  const safeSemester = trimOrNull(payload?.semester);

  // Try common students table shapes observed across deployments.
  const payloadVariants = [
    {
      id: safeUserId,
      name: safeName,
      email: safeEmail,
      department: safeDepartment,
      register_no: safeRegisterNo,
      year: safeYear,
      semester: safeSemester,
    },
    {
      id: safeUserId,
      name: safeName,
      email: safeEmail,
      department: safeDepartment,
      register_number: safeRegisterNo,
      year: safeYear,
      semester: safeSemester,
    },
    {
      id: safeUserId,
      name: safeName,
      department: safeDepartment,
      register_no: safeRegisterNo,
      year: safeYear,
      semester: safeSemester,
    },
    {
      id: safeUserId,
      name: safeName,
      department: safeDepartment,
      register_number: safeRegisterNo,
      year: safeYear,
      semester: safeSemester,
    },
  ];

  let lastError = null;
  for (const variant of payloadVariants) {
    // Remove null keys to avoid failing on NOT NULL defaults in some schemas.
    const compact = Object.fromEntries(
      Object.entries(variant).filter(([, value]) => value !== null && value !== undefined && value !== "")
    );

    try {
      await writeStudentsRowAdaptive(supabase, compact);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw new Error(`Failed to sync students table: ${lastError?.message || String(lastError)}`);
  }
}

async function upsertProfileWithRetry(supabase, userId, payload) {
  const profilePayload = buildProfilePayload(userId, payload);
  let { error: profileError } = await supabase
    .from("profiles")
    .upsert(profilePayload, { onConflict: "id" });

  if (!profileError) {
    return profilePayload;
  }

  // Some deployments have DB triggers that write to student_subjects when
  // profile rows are inserted/updated. Ensure students row exists, then retry.
  if (String(payload?.role || "") === "student" && isStudentSubjectsFkError(profileError)) {
    await upsertStudentsMasterRow(supabase, userId, payload);
    const retry = await supabase
      .from("profiles")
      .upsert(profilePayload, { onConflict: "id" });
    profileError = retry.error;
    if (!profileError) {
      return profilePayload;
    }
  }

  throw new Error(profileError.message);
}

function validatePayload(payload) {
  const role = String(payload?.role || "").trim();
  const email = String(payload?.email || "").trim();
  const password = String(payload?.password || "");
  const name = String(
    payload?.name || `${payload?.first_name || ""} ${payload?.last_name || ""}`
  )
    .trim();
  const department = String(payload?.department || "").trim();

  if (!email) return "Email is required";
  if (!password || password.length < 6) return "Password must be at least 6 characters";
  if (!name) return "Name is required";
  if (!ALLOWED_ROLES.has(role)) return "Invalid role";
  if ((role === "student" || role === "faculty") && !department) {
    return "Department is required for students and faculty";
  }

  return null;
}

async function createUserWithProfile(supabase, payload) {
  const normalizedEmail = String(payload.email || "").trim().toLowerCase();
  const normalizedPassword = String(payload.password || "").trim();
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password: normalizedPassword,
    email_confirm: true,
    user_metadata: {
      role: payload.role,
      name: payload.name,
    },
  });

  if (authError || !authData?.user?.id) {
    throw new Error(authError?.message || "Failed to create auth user");
  }

  await upsertStudentsMasterRow(supabase, authData.user.id, payload);
  const profilePayload = await upsertProfileWithRetry(supabase, authData.user.id, payload);

  return {
    id: authData.user.id,
    email: profilePayload.email,
    role: profilePayload.role,
    name: profilePayload.name,
  };
}

async function updateExistingUserWithProfile(supabase, userId, payload) {
  const safeUserId = String(userId || "").trim();
  if (!safeUserId) {
    throw new Error("Existing user id is required");
  }

  await upsertStudentsMasterRow(supabase, safeUserId, payload);
  const profilePayload = await upsertProfileWithRetry(supabase, safeUserId, payload);

  const normalizedEmail = String(payload.email || "").trim().toLowerCase();
  const normalizedPassword = String(payload.password || "").trim();
  const { error: authError } = await supabase.auth.admin.updateUserById(safeUserId, {
    email: normalizedEmail,
    password: normalizedPassword,
    email_confirm: true,
    user_metadata: {
      role: payload.role,
      name: payload.name,
    },
  });
  if (authError) {
    throw new Error(authError.message);
  }

  return {
    id: safeUserId,
    email: profilePayload.email,
    role: profilePayload.role,
    name: profilePayload.name,
  };
}

async function buildAuthUserEmailIndex(supabase) {
  const perPage = 1000;
  const maxPages = 20;
  const index = new Map();

  for (let page = 1; page <= maxPages; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(error.message || "Failed to list auth users");
    }

    const users = Array.isArray(data?.users) ? data.users : [];
    users.forEach((user) => {
      const email = String(user?.email || "").trim().toLowerCase();
      const id = String(user?.id || "").trim();
      if (email && id && !index.has(email)) {
        index.set(email, id);
      }
    });

    if (users.length < perPage) {
      break;
    }
  }

  return index;
}

async function getAuthUserIdByEmailFromSchema(supabase, email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return null;

  try {
    const { data, error } = await supabase
      .schema("auth")
      .from("users")
      .select("id, email")
      .eq("email", normalizedEmail)
      .limit(1);
    if (!error && Array.isArray(data) && data.length > 0) {
      const id = String(data[0]?.id || "").trim();
      if (id) return id;
    }
  } catch (_error) {
    // Ignore and continue to next fallback.
  }

  try {
    const { data, error } = await supabase
      .schema("auth")
      .from("users")
      .select("id, email")
      .ilike("email", normalizedEmail)
      .limit(1);
    if (!error && Array.isArray(data) && data.length > 0) {
      const id = String(data[0]?.id || "").trim();
      if (id) return id;
    }
  } catch (_error) {
    // Ignore and return null.
  }

  return null;
}

router.post("/create-user", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const fallbackName = `${String(req.body?.first_name || "").trim()} ${String(
      req.body?.last_name || ""
    ).trim()}`.trim();
    const payload = {
      email: String(req.body?.email || "").trim(),
      password: String(req.body?.password || ""),
      role: String(req.body?.role || "").trim(),
      name: String(req.body?.name || fallbackName).trim(),
      first_name: String(req.body?.first_name || "").trim(),
      last_name: String(req.body?.last_name || "").trim(),
      department: normalizeDepartmentInput(String(req.body?.department || "").trim()),
      register_no: String(req.body?.register_no || "").trim(),
      year: String(req.body?.year || "").trim(),
      semester: String(req.body?.semester || "").trim(),
    };

    const validationError = validatePayload(payload);
    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
        error: validationError,
        data: null,
      });
    }

    const supabase = getSupabaseServerClient();
    const createdUser = await createUserWithProfile(supabase, payload);

    return res.json({
      success: true,
      message: "User created successfully",
      error: null,
      data: createdUser,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to create user",
      error: error?.message || "Unexpected error",
      data: null,
    });
  }
});

router.delete("/remove-user", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const userId = String(req.body?.user_id || req.body?.id || "").trim();
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "user_id is required",
        error: "Missing user_id",
        data: null,
      });
    }

    if (req.user?.id && req.user.id === userId) {
      return res.status(400).json({
        success: false,
        message: "You cannot remove your own account",
        error: "Self removal is not allowed",
        data: null,
      });
    }

    const supabase = getSupabaseServerClient();
    const { data: existingProfile, error: profileLookupError } = await supabase
      .from("profiles")
      .select("id, role, email")
      .eq("id", userId)
      .single();

    if (profileLookupError || !existingProfile?.id) {
      return res.status(404).json({
        success: false,
        message: "User profile not found",
        error: profileLookupError?.message || "Not found",
        data: null,
      });
    }

    if (existingProfile.role === "admin") {
      return res.status(400).json({
        success: false,
        message: "Admin users cannot be removed here",
        error: "Protected role",
        data: null,
      });
    }

    // Cleanup faculty mappings before deleting profile.
    if (existingProfile.role === "faculty") {
      await supabase.from("faculty_subjects").delete().eq("faculty_id", userId);
    }

    const { error: deleteProfileError } = await supabase.from("profiles").delete().eq("id", userId);
    if (deleteProfileError) {
      throw new Error(deleteProfileError.message);
    }

    const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteAuthError && !/not found/i.test(String(deleteAuthError.message || ""))) {
      throw new Error(deleteAuthError.message);
    }

    return res.json({
      success: true,
      message: "User removed successfully",
      error: null,
      data: {
        id: userId,
        role: existingProfile.role,
        email: existingProfile.email || null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to remove user",
      error: error?.message || "Unexpected error",
      data: null,
    });
  }
});

router.post("/bulk-create", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const role = String(req.body?.role || "").trim();
    const users = Array.isArray(req.body?.users) ? req.body.users : [];
    const departmentOverride = normalizeDepartmentInput(String(req.body?.department || "").trim());

    if (!ALLOWED_ROLES.has(role) || role === "admin") {
      return res.status(400).json({
        success: false,
        message: "Bulk create supports student/faculty roles only",
        error: "Invalid role",
        data: null,
      });
    }

    if (users.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Users list is required",
        error: "Missing users",
        data: null,
      });
    }

    const supabase = getSupabaseServerClient();
    let success = 0;
    let failed = 0;
    let skipped = 0;
    let updated = 0;
    const errors = [];
    let authEmailIndex = null;
    let authEmailIndexUnavailable = false;

    async function getAuthUserIdByEmail(email) {
      const normalizedEmail = String(email || "").trim().toLowerCase();
      if (!normalizedEmail || authEmailIndexUnavailable) return null;
      if (!authEmailIndex) {
        try {
          authEmailIndex = await buildAuthUserEmailIndex(supabase);
        } catch (_indexError) {
          authEmailIndexUnavailable = true;
        }
      }
      const fromIndex = String(authEmailIndex?.get(normalizedEmail) || "").trim() || null;
      if (fromIndex) return fromIndex;
      return getAuthUserIdByEmailFromSchema(supabase, normalizedEmail);
    }

    for (let i = 0; i < users.length; i += 1) {
      const row = users[i] || {};
      const fallbackName = `${String(row.first_name || "").trim()} ${String(
        row.last_name || ""
      ).trim()}`.trim();
      const payload = {
        email: String(row.email || "").trim(),
        password: String(row.password || ""),
        role,
        name: String(row.name || fallbackName).trim(),
        first_name: String(row.first_name || "").trim(),
        last_name: String(row.last_name || "").trim(),
        department: normalizeDepartmentInput(String(row.department || departmentOverride || "").trim()),
        register_no: String(row.register_no || "").trim(),
        year: String(row.year || "").trim(),
        semester: String(row.semester || "").trim(),
      };

      const validationError = validatePayload(payload);
      if (validationError) {
        failed += 1;
        errors.push(`Row ${i + 1}: ${validationError}`);
        continue;
      }

      // Upsert behavior: if email/register exists, update profile/auth in-place.
      try {
        let existingQuery = supabase
          .from("profiles")
          .select("id, email, role, register_no")
          .eq("email", payload.email)
          .limit(1);

        if (role === "student" && payload.register_no) {
          existingQuery = supabase
            .from("profiles")
            .select("id, email, role, register_no")
            .eq("role", role)
            .or(`email.eq.${payload.email},register_no.eq.${payload.register_no}`)
            .limit(1);
        }

        const { data: existingRows, error: existingError } = await existingQuery;
        if (existingError) {
          throw new Error(existingError.message);
        }

        if (Array.isArray(existingRows) && existingRows.length > 0) {
          try {
            await updateExistingUserWithProfile(supabase, existingRows[0].id, payload);
            updated += 1;
          } catch (updateError) {
            failed += 1;
            errors.push(`Row ${i + 1}: ${updateError?.message || "Failed to update existing user"}`);
          }
          continue;
        }

        // If profile is missing but auth account already exists, repair by upserting profile.
        const existingAuthUserId = await getAuthUserIdByEmail(payload.email);
        if (existingAuthUserId) {
          try {
            await updateExistingUserWithProfile(supabase, existingAuthUserId, payload);
            updated += 1;
          } catch (authUpdateError) {
            failed += 1;
            errors.push(
              `Row ${i + 1}: ${authUpdateError?.message || "Failed to sync existing auth user"}`
            );
          }
          continue;
        }
      } catch (lookupError) {
        failed += 1;
        errors.push(`Row ${i + 1}: ${lookupError?.message || "Failed to validate existing user"}`);
        continue;
      }

      try {
        await createUserWithProfile(supabase, payload);
        success += 1;
      } catch (error) {
        const message = String(error?.message || "Failed to create user");
        if (/already been registered|already exists|duplicate/i.test(message)) {
          try {
            let conflictLookup = supabase
              .from("profiles")
              .select("id")
              .eq("email", payload.email)
              .limit(1);

            if (role === "student" && payload.register_no) {
              conflictLookup = supabase
                .from("profiles")
                .select("id")
                .or(`email.eq.${payload.email},register_no.eq.${payload.register_no}`)
                .limit(1);
            }

            const { data: existingAfterConflict, error: conflictLookupError } = await conflictLookup;

            if (!conflictLookupError && Array.isArray(existingAfterConflict) && existingAfterConflict.length > 0) {
              await updateExistingUserWithProfile(supabase, existingAfterConflict[0].id, payload);
              updated += 1;
              continue;
            }

            const existingAuthUserId = await getAuthUserIdByEmail(payload.email);
            if (existingAuthUserId) {
              await updateExistingUserWithProfile(supabase, existingAuthUserId, payload);
              updated += 1;
              continue;
            }

            skipped += 1;
            errors.push(
              `Row ${i + 1}: User already exists in auth but profile mapping could not be resolved`
            );
            continue;
          } catch (conflictUpdateError) {
            failed += 1;
            errors.push(`Row ${i + 1}: ${conflictUpdateError?.message || "Failed to update duplicate user"}`);
          }
        } else {
          failed += 1;
          errors.push(`Row ${i + 1}: ${message}`);
        }
      }
    }

    return res.json({
      success: true,
      message: "Bulk user creation completed",
      error: null,
      data: { success, updated, skipped, failed, errors },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to process bulk creation",
      error: error?.message || "Unexpected error",
      data: null,
    });
  }
});

router.get("/students", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const supabase = getSupabaseServerClient();
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 10)));
    const sortKeyRaw = String(req.query.sortKey || "name");
    const sortDir = String(req.query.sortDir || "asc").toLowerCase() === "desc" ? "desc" : "asc";
    const search = String(req.query.search || "").trim().toLowerCase();
    let department = String(req.query.department || "").trim();
    const status = String(req.query.status || "").trim().toLowerCase();
    const createdId = String(req.query.createdId || "").trim();

    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("department")
      .eq("id", req.user.id)
      .maybeSingle();
    const adminDeptRaw = String(adminProfile?.department || "").trim();

    if (!createdId && adminDeptRaw && (!department || department === "all")) {
      department = adminDeptRaw;
    }

    let rawData = [];
    let queryError = null;

    if (createdId) {
      const res = await supabase.from("profiles").select("*").eq("id", createdId);
      rawData = res.data || [];
      queryError = res.error;
    } else {
      const res = await supabase.from("profiles").select("*").eq("role", "student");
      rawData = res.data || [];
      queryError = res.error;
    }

    if (queryError && rawData.length === 0) {
      // Fallback query without role filter if RLS or role index issue occurs
      const resFallback = await supabase.from("profiles").select("*");
      rawData = resFallback.data || [];
    }

    // Normalize student rows (handling name / full_name / email variations)
    let rows = rawData.map((row) => ({
      ...row,
      name: row.name || row.full_name || row.email || "Unnamed Student",
      department: row.department || "",
      register_no: row.register_no || row.reg_no || row.roll_no || "",
    }));

    // In-memory department filtering (handles aliases like "IT" vs "Information Technology")
    if (department && department !== "all" && !createdId) {
      const deptMatch = rows.filter((row) => {
        if (!row.department) return false;
        if (isSameDepartment(row.department, department)) return true;
        const d1 = String(row.department).toLowerCase().replace(/[^a-z0-9]/g, "");
        const d2 = String(department).toLowerCase().replace(/[^a-z0-9]/g, "");
        return d1.includes(d2) || d2.includes(d1);
      });
      rows = deptMatch;
    }

    // In-memory status filtering
    if (status && status !== "all") {
      if (status === "inactive") {
        rows = rows.filter((row) => row.is_active === false || row.status === "inactive");
      } else if (status === "active") {
        rows = rows.filter((row) => row.is_active !== false && row.status !== "inactive");
      }
    }

    // In-memory search filtering
    if (search) {
      rows = rows.filter((row) => {
        const nameStr = String(row.name || "").toLowerCase();
        const emailStr = String(row.email || "").toLowerCase();
        const regStr = String(row.register_no || "").toLowerCase();
        return nameStr.includes(search) || emailStr.includes(search) || regStr.includes(search);
      });
    }

    // In-memory sorting
    rows.sort((a, b) => {
      const valA = String(a[sortKeyRaw] || a.name || "").toLowerCase();
      const valB = String(b[sortKeyRaw] || b.name || "").toLowerCase();
      const comp = valA.localeCompare(valB);
      return sortDir === "asc" ? comp : -comp;
    });

    const totalCount = rows.length;
    const from = (page - 1) * pageSize;
    const paginatedRows = rows.slice(from, from + pageSize);

    return res.json({
      success: true,
      message: "Students fetched successfully",
      error: null,
      data: {
        rows: paginatedRows,
        totalCount,
        page,
        pageSize,
      },
    });
  } catch (error) {
    console.error("GET /api/admin/students error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch students",
      error: error?.message || "Internal server error",
      data: {
        rows: [],
        totalCount: 0,
        page: 1,
        pageSize: 10,
      },
    });
  }
});

router.get("/student-departments", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const supabase = getSupabaseServerClient();
    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("department")
      .eq("id", req.user.id)
      .maybeSingle();
    const adminDept = String(adminProfile?.department || "").trim();
    if (adminDept) {
      const label = canonicalDepartmentLabel(adminDept) || adminDept.toUpperCase();
      return res.json({
        success: true,
        message: "Departments fetched",
        error: null,
        data: [label],
      });
    }

    const [profilesRes, studentsRes, subjectsRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("department")
        .limit(5000),
      supabase
        .from("students")
        .select("department")
        .limit(5000),
      // `subjects.department` may not exist in all environments.
      supabase
        .from("subjects")
        .select("department")
        .limit(5000),
    ]);

    if (profilesRes.error) throw profilesRes.error;
    if (studentsRes.error) throw studentsRes.error;

    const departments = withDepartmentFallback(
      [
        ...(profilesRes.data || []),
        ...(studentsRes.data || []),
        ...(subjectsRes.error ? [] : subjectsRes.data || []),
      ].map((row) => row.department)
    );

    return res.json({
      success: true,
      message: "Departments fetched",
      error: null,
      data: departments,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch departments",
      error: error?.message || "Unexpected error",
      data: [],
    });
  }
});

router.get("/dashboard-summary", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const supabase = getSupabaseServerClient();

    const { data: adminProfile, error: adminProfileError } = await supabase
      .from("profiles")
      .select("department")
      .eq("id", req.user.id)
      .maybeSingle();

    if (adminProfileError) throw adminProfileError;

    const authHeader = String(req.headers?.authorization || "");
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

    const sanitizeDept = (value) =>
      String(value || "")
        .trim()
        .replace(/[\r\n]/g, "")
        .slice(0, 160);
    /** Express 5 / mounted routers: req.query can be empty; parse query from URL. */
    const readDeptScopeFromUrl = () => {
      const tryParse = (urlString) => {
        const u = String(urlString || "");
        const qIdx = u.indexOf("?");
        if (qIdx === -1) return "";
        try {
          const sp = new URLSearchParams(u.slice(qIdx + 1));
          return sanitizeDept(sp.get("dept_scope"));
        } catch {
          return "";
        }
      };
      return tryParse(req.originalUrl) || tryParse(req.url);
    };
    const rawDeptScope = req.query?.dept_scope;
    const fromQueryParsed = sanitizeDept(Array.isArray(rawDeptScope) ? rawDeptScope[0] : rawDeptScope);
    const fromQueryFallback = readDeptScopeFromUrl();
    const fromQuery = fromQueryParsed || fromQueryFallback;
    const fromHeader = sanitizeDept(req.get("x-admin-department-scope"));
    const fromProfile = sanitizeDept(adminProfile?.department);

    /** Query > header > profile > JWT — query works when CORS drops custom headers on cross-origin GET. */
    let adminDeptRaw = fromQuery || fromHeader || fromProfile;
    /** When profiles.department is empty, department admins often still have department on JWT (role setup). */
    if (!adminDeptRaw && bearerToken) {
      const { data: userData, error: getUserErr } = await supabase.auth.getUser(bearerToken);
      if (!getUserErr && userData?.user) {
        const meta = userData.user.user_metadata || {};
        const appMeta = userData.user.app_metadata || {};
        adminDeptRaw = String(
          meta.department || meta.dept || appMeta.department || appMeta.dept || ""
        ).trim();
      }
    }

    const adminDeptKey = normalizeDepartmentKey(adminDeptRaw);
    /** Institution-wide: no dept, central "administration", or explicit "all". */
    const useInstitutionWide =
      !adminDeptRaw ||
      adminDeptKey === "administration" ||
      /^all(\s+departments)?$/i.test(adminDeptRaw);
    const scopeDepartment = useInstitutionWide ? "" : adminDeptRaw;

    if (!scopeDepartment) {
      const [studentsRes, facultyRes, subjectsRes, submissionsRes, pendingRes, evaluatedRes, departmentsRes] =
        await Promise.all([
          supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "student"),
          supabase.from("profiles").select("id", { count: "exact", head: true }).neq("role", "student"),
          supabase.from("subjects").select("id", { count: "exact", head: true }),
          supabase.from("submissions").select("id", { count: "exact", head: true }),
          supabase.from("submissions").select("id", { count: "exact", head: true }).eq("status", "submitted"),
          supabase.from("submissions").select("id", { count: "exact", head: true }).eq("status", "evaluated"),
          supabase.from("profiles").select("department").eq("role", "student").limit(5000),
        ]);

      if (studentsRes.error) throw studentsRes.error;
      if (facultyRes.error) throw facultyRes.error;
      if (subjectsRes.error) throw subjectsRes.error;
      if (submissionsRes.error) throw submissionsRes.error;
      if (pendingRes.error) throw pendingRes.error;
      if (evaluatedRes.error) throw evaluatedRes.error;
      if (departmentsRes.error) throw departmentsRes.error;

      const departments = Array.from(
        new Set(
          (departmentsRes.data || [])
            .map((row) => String(row.department || "").trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b));

      return res.json({
        success: true,
        message: "Admin dashboard summary fetched",
        error: null,
        data: {
          scope: "all",
          department: null,
          students: studentsRes.count ?? 0,
          faculty: facultyRes.count ?? 0,
          subjects: subjectsRes.count ?? 0,
          submissions: submissionsRes.count ?? 0,
          pending: pendingRes.count ?? 0,
          evaluated: evaluatedRes.count ?? 0,
          departments_count: departments.length,
        },
      });
    }

    const [{ data: studentRows, error: studentErr }, { data: facultyRows, error: facultyErr }, { data: subjectRows, error: subjectErr }] =
      await Promise.all([
        supabase.from("profiles").select("id, department").eq("role", "student"),
        supabase.from("profiles").select("id, department").neq("role", "student"),
        supabase.from("subjects").select("id, department"),
      ]);

    if (studentErr) throw studentErr;
    if (facultyErr) throw facultyErr;
    if (subjectErr) throw subjectErr;

    const studentsInDept = (studentRows || []).filter((row) => isSameDepartment(row.department, scopeDepartment));
    const facultyInDept = (facultyRows || []).filter((row) => isSameDepartment(row.department, scopeDepartment));
    const subjectsInDept = (subjectRows || []).filter((row) => isSameDepartment(row.department, scopeDepartment));

    const deptStudentIds = studentsInDept.map((row) => row.id).filter(Boolean);
    let submissionsCount = 0;
    let pendingCount = 0;
    let evaluatedCount = 0;

    if (deptStudentIds.length > 0) {
      const chunkSize = 120;
      for (let i = 0; i < deptStudentIds.length; i += chunkSize) {
        const chunk = deptStudentIds.slice(i, i + chunkSize);
        const [{ count: subC, error: e1 }, { count: penC, error: e2 }, { count: evC, error: e3 }] = await Promise.all([
          supabase.from("submissions").select("id", { count: "exact", head: true }).in("student_id", chunk),
          supabase
            .from("submissions")
            .select("id", { count: "exact", head: true })
            .in("student_id", chunk)
            .eq("status", "submitted"),
          supabase
            .from("submissions")
            .select("id", { count: "exact", head: true })
            .in("student_id", chunk)
            .eq("status", "evaluated"),
        ]);
        if (e1) throw e1;
        if (e2) throw e2;
        if (e3) throw e3;
        submissionsCount += subC ?? 0;
        pendingCount += penC ?? 0;
        evaluatedCount += evC ?? 0;
      }
    }

    return res.json({
      success: true,
      message: "Admin dashboard summary fetched",
      error: null,
      data: {
        scope: "department",
        department: adminDeptRaw,
        students: studentsInDept.length,
        faculty: facultyInDept.length,
        subjects: subjectsInDept.length,
        submissions: submissionsCount,
        pending: pendingCount,
        evaluated: evaluatedCount,
        departments_count: 1,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch admin dashboard summary",
      error: error?.message || "Unexpected error",
      data: null,
    });
  }
});

/** Service-role analytics for /admin/experiments — browser Supabase RLS often hides student_experiments / profiles. */
router.get("/experiment-analytics", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const supabase = getSupabaseServerClient();

    const { data: adminProfile, error: adminProfileError } = await supabase
      .from("profiles")
      .select("department")
      .eq("id", req.user.id)
      .maybeSingle();
    if (adminProfileError) throw adminProfileError;

    const authHeader = String(req.headers?.authorization || "");
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

    const sanitizeDept = (value) =>
      String(value || "")
        .trim()
        .replace(/[\r\n]/g, "")
        .slice(0, 160);
    const readDeptScopeFromUrl = () => {
      const tryParse = (urlString) => {
        const u = String(urlString || "");
        const qIdx = u.indexOf("?");
        if (qIdx === -1) return "";
        try {
          const sp = new URLSearchParams(u.slice(qIdx + 1));
          return sanitizeDept(sp.get("dept_scope"));
        } catch {
          return "";
        }
      };
      return tryParse(req.originalUrl) || tryParse(req.url);
    };
    const rawDeptScope = req.query?.dept_scope;
    const fromQueryParsed = sanitizeDept(Array.isArray(rawDeptScope) ? rawDeptScope[0] : rawDeptScope);
    const fromQuery = fromQueryParsed || readDeptScopeFromUrl();
    const fromHeader = sanitizeDept(req.get("x-admin-department-scope"));
    const fromProfile = sanitizeDept(adminProfile?.department);

    let adminDeptRaw = fromQuery || fromHeader || fromProfile;
    if (!adminDeptRaw && bearerToken) {
      const { data: userData, error: getUserErr } = await supabase.auth.getUser(bearerToken);
      if (!getUserErr && userData?.user) {
        const meta = userData.user.user_metadata || {};
        const appMeta = userData.user.app_metadata || {};
        adminDeptRaw = String(
          meta.department || meta.dept || appMeta.department || appMeta.dept || ""
        ).trim();
      }
    }

    const adminDeptKey = normalizeDepartmentKey(adminDeptRaw);
    const useInstitutionWide =
      !adminDeptRaw ||
      adminDeptKey === "administration" ||
      /^all(\s+departments)?$/i.test(adminDeptRaw);
    const scopeDepartment = useInstitutionWide ? "" : adminDeptRaw;

    const data = await computeExperimentAnalyticsPayload(supabase, scopeDepartment, useInstitutionWide);
    return res.json({
      success: true,
      message: "Experiment analytics",
      error: null,
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to compute experiment analytics",
      error: error?.message || "Unexpected error",
      data: null,
    });
  }
});

router.get("/dashboard-data", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const supabase = getSupabaseServerClient();
    const [
      studentsRes,
      studentsMasterRes,
      facultyRes,
      subjectsRes,
      facultySubjectsRes,
      submissionsMetaRes,
      profilesDeptRes,
      studentsDeptRes,
      subjectsDeptRes,
    ] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("id, name, email, register_no, department, year, semester, role")
          .eq("role", "student")
          .order("name"),
        supabase
          .from("students")
          .select("id, name, email, department, semester, created_at")
          .order("name"),
        supabase
          .from("profiles")
          .select("id, name, department, role")
          .neq("role", "student")
          .order("name"),
        supabase
          .from("subjects")
          .select("id, name")
          .order("name"),
        supabase
          .from("faculty_subjects")
          .select("faculty_id, subjects!inner(name)"),
        supabase
          .from("submissions")
          .select("id, student_id, subject_id, status, marks, updated_at"),
        supabase
          .from("profiles")
          .select("department")
          .limit(10000),
        supabase
          .from("students")
          .select("department")
          .limit(10000),
        // `subjects.department` may not exist in all environments.
        supabase
          .from("subjects")
          .select("department")
          .limit(10000),
      ]);

    if (studentsRes.error) throw studentsRes.error;
    if (studentsMasterRes.error) throw studentsMasterRes.error;
    if (facultyRes.error) throw facultyRes.error;
    if (subjectsRes.error) throw subjectsRes.error;
    if (facultySubjectsRes.error) throw facultySubjectsRes.error;
    if (submissionsMetaRes.error) throw submissionsMetaRes.error;
    if (profilesDeptRes.error) throw profilesDeptRes.error;
    if (studentsDeptRes.error) throw studentsDeptRes.error;

    const profileStudents = studentsRes.data || [];
    const studentById = new Map(profileStudents.map((row) => [row.id, row]));
    const mergedStudents = [
      ...profileStudents,
      ...((studentsMasterRes.data || [])
        .filter((row) => !studentById.has(row.id))
        .map((row) => ({
          id: row.id,
          name: row.name || null,
          email: row.email || null,
          register_no: null,
          department: row.department || null,
          year: null,
          semester: row.semester || null,
          role: "student",
        }))),
    ];

    const departmentSet = new Set();
    for (const row of mergedStudents) {
      const dept = String(row?.department || "").trim();
      if (dept) departmentSet.add(dept);
    }
    for (const row of facultyRes.data || []) {
      const dept = String(row?.department || "").trim();
      if (dept) departmentSet.add(dept);
    }
    for (const row of subjectsRes.data || []) {
      const dept = String(row?.department || "").trim();
      if (dept) departmentSet.add(dept);
    }
    for (const row of profilesDeptRes.data || []) {
      const dept = String(row?.department || "").trim();
      if (dept) departmentSet.add(dept);
    }
    for (const row of studentsDeptRes.data || []) {
      const dept = String(row?.department || "").trim();
      if (dept) departmentSet.add(dept);
    }
    if (!subjectsDeptRes.error) {
      for (const row of subjectsDeptRes.data || []) {
        const dept = String(row?.department || "").trim();
        if (dept) departmentSet.add(dept);
      }
    }
    const departments = withDepartmentFallback(Array.from(departmentSet));

    return res.json({
      success: true,
      message: "Admin dashboard data fetched",
      error: null,
      data: {
        students: mergedStudents,
        faculty: facultyRes.data || [],
        subjects: subjectsRes.data || [],
        faculty_subjects: facultySubjectsRes.data || [],
        submissions_meta: submissionsMetaRes.data || [],
        departments,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch admin dashboard data",
      error: error?.message || "Unexpected error",
      data: null,
    });
  }
});

router.get("/department-data", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const department = String(req.query?.department || "").trim();
    if (!department) {
      return res.status(400).json({
        success: false,
        message: "department query param is required",
        error: "Missing department",
        data: null,
      });
    }

    const requestedDepartmentKey = normalizeDepartmentKey(department);
    const supabase = getSupabaseServerClient();
    const [studentsRes, facultyRes, subjectsRes, facultySubjectsRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, name, email, register_no, department, year, semester, role")
        .eq("role", "student")
        .order("name"),
      supabase
        .from("profiles")
        .select("id, name, department, role")
        .neq("role", "student")
        .order("name"),
      supabase
        .from("subjects")
        .select("id, name, code, department, year, semester")
        .order("name"),
      supabase
        .from("faculty_subjects")
        .select("faculty_id, subjects!inner(name, code, department)"),
    ]);

    if (studentsRes.error) throw studentsRes.error;
    if (facultyRes.error) throw facultyRes.error;
    if (subjectsRes.error) throw subjectsRes.error;
    if (facultySubjectsRes.error) throw facultySubjectsRes.error;

    const matchDepartment = (value) => normalizeDepartmentKey(value) === requestedDepartmentKey;

    const studentsData = (studentsRes.data || []).filter((row) => matchDepartment(row.department));
    const facultyData = (facultyRes.data || []).filter((row) => matchDepartment(row.department));
    const subjectsData = (subjectsRes.data || []).filter((row) => matchDepartment(row.department));
    const allowedSubjectNames = new Set(
      subjectsData.map((row) => String(row.name || "").trim().toLowerCase()).filter(Boolean)
    );
    const facultySubjectsData = (facultySubjectsRes.data || []).filter((row) => {
      const subject = row?.subjects || null;
      if (!subject) return false;
      if (!isSameDepartment(subject.department, department)) return false;
      const subjectName = String(subject.name || "").trim().toLowerCase();
      if (!subjectName) return false;
      return allowedSubjectNames.has(subjectName);
    });

    return res.json({
      success: true,
      message: "Department data fetched",
      error: null,
      data: {
        students: studentsData,
        faculty: facultyData,
        subjects: subjectsData,
        faculty_subjects: facultySubjectsData,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch department data",
      error: error?.message || "Unexpected error",
      data: null,
    });
  }
});

router.post("/subjects", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const payload = {
      name: String(req.body?.name || "").trim(),
      code: String(req.body?.code || "").trim(),
      department: normalizeDepartmentInput(String(req.body?.department || "").trim()),
      year: String(req.body?.year || "").trim(),
      semester: String(req.body?.semester || "").trim(),
    };

    if (!payload.name) {
      return res.status(400).json({
        success: false,
        message: "Subject name is required",
        error: "Missing subject name",
        data: null,
      });
    }

    const supabase = getSupabaseServerClient();
    const createdSubject = await createSubjectAdaptive(supabase, payload);

    return res.json({
      success: true,
      message: "Subject created successfully",
      error: null,
      data: createdSubject,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to create subject",
      error: error?.message || "Unexpected error",
      data: null,
    });
  }
});

router.put("/subjects/:subject_id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const subjectId = String(req.params?.subject_id || "").trim();
    if (!subjectId) {
      return res.status(400).json({
        success: false,
        message: "subject_id is required",
        error: "Missing subject_id",
        data: null,
      });
    }

    const payload = {
      name: req.body?.name,
      code: req.body?.code,
      department: req.body?.department,
      year: req.body?.year,
      semester: req.body?.semester,
    };

    const supabase = getSupabaseServerClient();
    const updated = await updateSubjectAdaptive(supabase, subjectId, payload);

    return res.json({
      success: true,
      message: "Subject updated successfully",
      error: null,
      data: updated,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update subject",
      error: error?.message || "Unexpected error",
      data: null,
    });
  }
});

router.delete("/subjects/:subject_id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const subjectId = String(req.params?.subject_id || "").trim();
    if (!subjectId) {
      return res.status(400).json({
        success: false,
        message: "subject_id is required",
        error: "Missing subject_id",
        data: null,
      });
    }

    const supabase = getSupabaseServerClient();

    await supabase.from("faculty_subjects").delete().eq("subject_id", subjectId);
    await supabase.from("student_subjects").delete().eq("subject_id", subjectId);
    await supabase.from("submissions").delete().eq("subject_id", subjectId);
    await supabase.from("experiments").delete().eq("subject_id", subjectId);

    const { error: subjectDeleteError } = await supabase
      .from("subjects")
      .delete()
      .eq("id", subjectId);
    if (subjectDeleteError) {
      throw subjectDeleteError;
    }

    return res.json({
      success: true,
      message: "Subject deleted successfully",
      error: null,
      data: { subject_id: subjectId },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to delete subject",
      error: error?.message || "Unexpected error",
      data: null,
    });
  }
});

router.get("/subjects-management-data", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const department = String(req.query?.department || "").trim();
    const requestedDepartmentKey = normalizeDepartmentKey(department);
    const supabase = getSupabaseServerClient();

    const [subjectsRes, facultyRes, mappingsRes] = await Promise.all([
      (async () => {
        const candidates = [
          "id, name, code, department, year, semester",
          "id, name, code, department",
          "*",
        ];
        let lastError = null;
        for (const selectClause of candidates) {
          const response = await supabase
            .from("subjects")
            .select(selectClause);
          if (!response.error) return response;
          lastError = response.error;
        }
        return { data: [], error: lastError };
      })(),
      (async () => {
        const response = await supabase
          .from("profiles")
          .select("*")
          .neq("role", "student");
        if (!response.error && Array.isArray(response.data)) {
          const mapped = response.data.map((f) => ({
            ...f,
            name: f.name || f.full_name || f.email || "Unnamed Faculty",
          }));
          return { data: mapped, error: null };
        }
        return { data: [], error: null };
      })(),
      (async () => {
        const response = await supabase.from("faculty_subjects").select("*");
        if (!response.error && Array.isArray(response.data)) {
          return {
            data: response.data.map((row, index) => ({
              id: row.id || `${String(row.faculty_id)}:${String(row.subject_id)}:${index}`,
              ...row,
            })),
            error: null,
          };
        }
        return { data: [], error: null };
      })(),
    ]);

    const subjectsRaw = (subjectsRes.data || []).map((row) => ({
      id: row.id,
      name: row.name || row.title || "Untitled Subject",
      code: row.code ?? null,
      department: row.department ?? null,
      year: row.year ?? null,
      semester: row.semester ?? null,
    }));
    const facultyRaw = (facultyRes.data || []).sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""))
    );
    const mappingsRaw = mappingsRes.data || [];

    const departments = withDepartmentFallback([
      ...subjectsRaw.map((row) => row.department),
      ...facultyRaw.map((row) => row.department),
    ]);

    const subjectMap = new Map(subjectsRaw.map((row) => [String(row.id), row]));
    const facultyMap = new Map(facultyRaw.map((row) => [String(row.id), row]));

    // Fuzzy department match helper
    function isMatch(deptValue) {
      if (!requestedDepartmentKey) return true;
      if (!deptValue) return false;
      const key = normalizeDepartmentKey(deptValue);
      if (key === requestedDepartmentKey) return true;
      if (isSameDepartment(deptValue, department)) return true;
      const d1 = String(deptValue).toLowerCase().replace(/[^a-z0-9]/g, "");
      const d2 = String(department).toLowerCase().replace(/[^a-z0-9]/g, "");
      return d1.includes(d2) || d2.includes(d1);
    }

    let subjects = requestedDepartmentKey
      ? subjectsRaw.filter((row) => isMatch(row.department))
      : subjectsRaw;

    let faculty = requestedDepartmentKey
      ? facultyRaw.filter(
          (row) => !row.department || isMatch(row.department)
        )
      : facultyRaw;

    const visibleSubjectIds = new Set(subjects.map((row) => String(row.id)));

    // Preserve all existing mappings
    const assignments = mappingsRaw
      .map((row) => {
        const subject = subjectMap.get(String(row.subject_id));
        const facultyItem = facultyMap.get(String(row.faculty_id));
        if (!subject || !facultyItem) return null;

        return {
          id: String(row.id),
          faculty_id: String(row.faculty_id),
          faculty_name: String(facultyItem.name || "Unnamed Faculty"),
          subject_id: String(row.subject_id),
          subject_name: String(subject.name || "Untitled Subject"),
          subject_code: String(subject.code || ""),
          department: String(subject.department || ""),
        };
      })
      .filter(Boolean);

    const assignmentCountMap = new Map();
    assignments.forEach((row) => {
      const key = String(row.subject_id || "");
      assignmentCountMap.set(key, (assignmentCountMap.get(key) || 0) + 1);
    });

    const subjectRows = subjects.map((row) => ({
      id: String(row.id),
      name: String(row.name || "Untitled Subject"),
      code: String(row.code || ""),
      department: String(row.department || ""),
      year: String(row.year || ""),
      semester: String(row.semester || ""),
      assigned_count: assignmentCountMap.get(String(row.id)) || 0,
    }));

    const facultyRows = faculty.map((row) => ({
      id: String(row.id || ""),
      name: String(row.name || "Unnamed Faculty"),
      department: String(row.department || ""),
    }));

    return res.json({
      success: true,
      message: "Subjects management data fetched successfully",
      error: null,
      data: {
        departments,
        subjects: subjectRows,
        faculty: facultyRows,
        assignments,
      },
    });
  } catch (error) {
    console.error("GET /api/admin/subjects-management-data error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load subjects data",
      error: error?.message || "Internal server error",
      data: null,
    });
  }
});

router.post("/subjects/assign-faculty", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const facultyId = String(req.body?.faculty_id || "").trim();
    const subjectId = String(req.body?.subject_id || "").trim();
    if (!facultyId || !subjectId) {
      return res.status(400).json({
        success: false,
        message: "faculty_id and subject_id are required",
        error: "Missing mapping fields",
        data: null,
      });
    }

    const supabase = getSupabaseServerClient();

    const { data: facultyProfile, error: facultyProfileError } = await supabase
      .from("profiles")
      .select("id, role, department")
      .eq("id", facultyId)
      .maybeSingle();

    if (facultyProfileError) {
      const { data: fallbackProf } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", facultyId)
        .maybeSingle();
      if (!fallbackProf || String(fallbackProf.role || "") !== "faculty") {
        return res.status(400).json({
          success: false,
          message: "Selected user is not a faculty account",
          error: "Invalid faculty",
          data: null,
        });
      }
    } else if (!facultyProfile || String(facultyProfile.role || "") !== "faculty") {
      return res.status(400).json({
        success: false,
        message: "Selected user is not a faculty account",
        error: "Invalid faculty",
        data: null,
      });
    }

    const { data: subject, error: subjectError } = await supabase
      .from("subjects")
      .select("id, department")
      .eq("id", subjectId)
      .maybeSingle();
    if (subjectError) throw subjectError;
    if (!subject) {
      return res.status(404).json({
        success: false,
        message: "Subject not found",
        error: "Invalid subject",
        data: null,
      });
    }

    const subjectDeptKey = normalizeDepartmentKey(subject.department);
    const facultyDeptKey = normalizeDepartmentKey(facultyProfile?.department || "");

    const isMatch =
      !subjectDeptKey ||
      !facultyDeptKey ||
      subjectDeptKey === facultyDeptKey ||
      (subjectDeptKey.includes("information") && facultyDeptKey.includes("information")) ||
      (subjectDeptKey.includes("it") && facultyDeptKey.includes("it")) ||
      subjectDeptKey.includes(facultyDeptKey) ||
      facultyDeptKey.includes(subjectDeptKey);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Faculty department does not match selected subject department",
        error: "Department mismatch",
        data: null,
      });
    }

    const { data: existing, error: existingError } = await supabase
      .from("faculty_subjects")
      .select("id")
      .eq("faculty_id", facultyId)
      .eq("subject_id", subjectId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      return res.json({
        success: true,
        message: "Faculty already assigned to subject",
        error: null,
        data: existing,
      });
    }

    const { data: created, error: createError } = await supabase
      .from("faculty_subjects")
      .insert({
        faculty_id: facultyId,
        subject_id: subjectId,
      })
      .select("id, faculty_id, subject_id")
      .single();
    if (createError) throw createError;

    return res.json({
      success: true,
      message: "Faculty assigned successfully",
      error: null,
      data: created,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to assign faculty",
      error: error?.message || "Unexpected error",
      data: null,
    });
  }
});

// Backward-compatibility no-op for stale bundles.
router.post("/subjects/auto-assign-faculty", requireAuth, requireRole("admin"), async (_req, res) => {
  return res.json({
    success: true,
    message: "Auto mapping is disabled. Use manual HOD assignment.",
    error: null,
    data: { created_mappings: 0, deleted_mappings: 0, skipped_existing: 0 },
  });
});

router.delete("/subjects/assign-faculty", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const facultyId = String(req.body?.faculty_id || "").trim();
    const subjectId = String(req.body?.subject_id || "").trim();
    if (!facultyId || !subjectId) {
      return res.status(400).json({
        success: false,
        message: "faculty_id and subject_id are required",
        error: "Missing mapping fields",
        data: null,
      });
    }

    const supabase = getSupabaseServerClient();
    const { error: deleteError } = await supabase
      .from("faculty_subjects")
      .delete()
      .eq("faculty_id", facultyId)
      .eq("subject_id", subjectId);
    if (deleteError) throw deleteError;

    return res.json({
      success: true,
      message: "Faculty unassigned from subject",
      error: null,
      data: { faculty_id: facultyId, subject_id: subjectId },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to unassign faculty",
      error: error?.message || "Unexpected error",
      data: null,
    });
  }
});

router.delete("/subjects/assign-faculty/by-subject/:subject_id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const subjectId = String(req.params?.subject_id || "").trim();
    if (!subjectId) {
      return res.status(400).json({
        success: false,
        message: "subject_id is required",
        error: "Missing subject_id",
        data: null,
      });
    }

    const supabase = getSupabaseServerClient();
    const { data: existingRows, error: existingError } = await supabase
      .from("faculty_subjects")
      .select("faculty_id, subject_id")
      .eq("subject_id", subjectId);
    if (existingError) throw existingError;

    const { error: deleteError } = await supabase
      .from("faculty_subjects")
      .delete()
      .eq("subject_id", subjectId);
    if (deleteError) throw deleteError;

    return res.json({
      success: true,
      message: "All faculty unassigned from subject",
      error: null,
      data: {
        subject_id: subjectId,
        removed_count: Array.isArray(existingRows) ? existingRows.length : 0,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to clear faculty assignments for subject",
      error: error?.message || "Unexpected error",
      data: null,
    });
  }
});

module.exports = router;
