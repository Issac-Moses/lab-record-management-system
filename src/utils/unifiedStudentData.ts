import { supabase } from "@/lib/supabase";
import { getExperimentOrderNumber, sortByExperimentNo } from "@/utils/experimentOrder";
import { applyOoseExperimentOrderIfNeeded } from "@/utils/ooseExperimentOrder";
import { repairLeadingTitle } from "@/utils/titleRepair";
import {
  isNndlSubjectName,
  shouldHideLegacyNndlUnifiedExperiment,
} from "@/utils/nndlExperimentFilter";

type AiBreakdown = Record<string, number> | null;

type FullStudentDataRow = Record<string, unknown>;

export type UnifiedExperiment = {
  id: string;
  experimentId: string;
  experimentNo: number;
  title: string;
  status: string;
  marks: number;
  facultyMarks: number | null;
  finalMarks: number;
  isOverridden: boolean;
  evaluationSource: "faculty" | "ai";
  updatedAt: string | null;
  submittedDate: string | null;
  isCompleted: boolean;
  aim: string;
  algorithm: string;
  program: string;
  output: string;
  result: string;
  images: string[];
  aiScore: number | null;
  confidence: number | null;
  aiStatus: string | null;
  aiBreakdown: AiBreakdown;
  dueDate?: string | null;
};

export type UnifiedStudentDataResult = {
  experiments: UnifiedExperiment[];
  totalMarks: number;
  internalPercent: number;
  demoModeActive: boolean;
  aiAssistedEvaluation: true;
  parsedContentAvailable?: boolean;
  profile: {
    studentName: string;
    registerNo: string;
    department: string;
    yearSemester: string;
  };
  source: "real" | "fallback";
};

export type FacultyUnifiedRow = {
  key: string;
  studentName: string;
  registerNumber: string;
  experimentNo: number;
  experimentName: string;
  status: string;
  marks: number;
  facultyMarks: number | null;
  finalMarks: number;
  isOverridden: boolean;
  aiScore: number | null;
  confidence: number | null;
  aim: string;
  algorithm: string;
  program: string;
  output: string;
  result: string;
  updatedAt: string;
};

type Options = {
  subjectId: string;
  subjectName?: string;
  searchParams?: URLSearchParams;
};
let fullStudentDataViewAvailable: boolean | null = null;

type StudentExperimentRow = Record<string, unknown> & {
  experiments?: Record<string, unknown> | null;
};

function isGenericExperimentTitle(title: string): boolean {
  return /^experiment\s+\d+$/i.test(String(title || "").trim());
}

function text(value: unknown, fallback = ""): string {
  return String(value ?? fallback).trim();
}

/**
 * Safe numeric parse for DB nullable fields. `Number(null) === 0` would break `??` chains for marks.
 */
function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

function asImages(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  // jsonb arrays sometimes deserialize as plain objects ({ "0": "...", "1": "..." })
  if (typeof value === "object" && value !== null) {
    const vals = Object.values(value as Record<string, unknown>);
    if (vals.length > 0) {
      return vals.map((item) => String(item ?? "").trim()).filter(Boolean);
    }
  }
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return [];
    if (t.startsWith("[") && t.endsWith("]")) {
      try {
        const parsed = JSON.parse(t) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item || "").trim()).filter(Boolean);
        }
      } catch {
        return t ? [t] : [];
      }
    }
    return [t];
  }
  return [];
}

/** Prefer first source that yields any image URLs / data URLs (after SQL jsonb migration). */
function firstNonEmptyImageList(...sources: unknown[]): string[] {
  for (const s of sources) {
    const out = asImages(s);
    if (out.length > 0) return out;
  }
  return [];
}

function normalizeStatus(status: unknown): string {
  const value = text(status).toLowerCase();
  if (!value) return "pending";
  if (value === "approved") return "evaluated";
  return value;
}

/** Faculty / final marks stored explicitly on the row (not combined `marks` only). */
function hasExplicitFacultyMarks(row: FullStudentDataRow): boolean {
  return numOrNull(row.faculty_marks) != null || numOrNull(row.final_marks) != null;
}

/**
 * Experiments the UI shows as locked / not started can still carry template or demo
 * `ai_marks` / `marks` from a view — suppress those so the PDF index does not show fake scores.
 * Real submissions (submitted / evaluated / completed) or explicit faculty marks are kept.
 */
function shouldSuppressTemplateMarks(row: FullStudentDataRow): boolean {
  if (hasExplicitFacultyMarks(row)) return false;
  const raw = text(row.status).toLowerCase();
  if (raw === "submitted" || raw === "evaluated" || raw === "approved") return false;
  if (bool(row.is_completed)) return false;
  return (
    raw === "locked" ||
    raw === "unlocked" ||
    raw === "pending" ||
    raw === "draft" ||
    raw === ""
  );
}

function stripTemplateMarksRow(row: FullStudentDataRow): FullStudentDataRow {
  if (!shouldSuppressTemplateMarks(row)) return row;
  return {
    ...row,
    marks: hasExplicitFacultyMarks(row) ? row.marks : null,
    ai_marks: hasExplicitFacultyMarks(row) ? row.ai_marks : null,
  };
}

async function resolveSubjectIdsByName(subjectName?: string): Promise<string[]> {
  const name = String(subjectName || "").trim();
  if (!name) return [];
  const { data } = await supabase.from("subjects").select("id").eq("name", name);
  return (Array.isArray(data) ? data : [])
    .map((row) => text((row as Record<string, unknown>)?.id))
    .filter(Boolean);
}

function mapUnifiedExperiment(row: FullStudentDataRow, index: number): UnifiedExperiment {
  const gated = stripTemplateMarksRow(row);
  const facultyMarks = numOrNull(gated.faculty_marks);
  const aiMarks = numOrNull(gated.ai_marks);
  const finalMarksColumn = numOrNull(gated.final_marks);
  /** Combined `marks` on submissions is what faculty flows often update; `faculty_marks` can lag if only `marks` was written. */
  const baseMarks = numOrNull(gated.marks);
  const suppress = shouldSuppressTemplateMarks(gated);
  const finalMarks = suppress
    ? facultyMarks ?? finalMarksColumn ?? 0
    : baseMarks ?? facultyMarks ?? finalMarksColumn ?? aiMarks ?? 0;
  const status = normalizeStatus(gated.status);
  const experimentNo =
    numOrNull(row.experiment_no) ??
    numOrNull(row.experiment_number) ??
    numOrNull(row.experimentNo) ??
    getExperimentOrderNumber(row.experiment_no ?? row.experiment_number ?? row.experimentNo) ??
    0;

  return {
    id: text(gated.id, `row-${index + 1}`),
    experimentId: text(gated.experiment_id ?? gated.exp_id ?? gated.id, `exp-${index + 1}`),
    experimentNo,
    title: repairLeadingTitle(text(gated.title ?? gated.experiment_title, `Experiment ${index + 1}`)),
    status,
    marks: finalMarks,
    facultyMarks: baseMarks ?? facultyMarks,
    finalMarks,
    isOverridden:
      bool(gated.is_overridden) ||
      facultyMarks != null ||
      finalMarksColumn != null ||
      baseMarks != null,
    evaluationSource:
      baseMarks != null || facultyMarks != null || finalMarksColumn != null ? "faculty" : "ai",
    updatedAt: text(gated.updated_at) || null,
    submittedDate: text(gated.submitted_date) || null,
    dueDate: text(gated.due_date ?? gated.deadline_date ?? gated.deadline) || null,
    isCompleted: bool(gated.is_completed) || status === "submitted" || status === "evaluated",
    aim: text(gated.aim),
    algorithm: text(gated.algorithm ?? gated.procedure),
    program: text(gated.program ?? gated.source_code),
    output: text(gated.output),
    result: text(gated.result),
    images: firstNonEmptyImageList(gated.images, gated.attachments),
    aiScore: suppress ? null : aiMarks,
    confidence: numOrNull(gated.confidence),
    aiStatus: text(gated.ai_status) || null,
    aiBreakdown:
      gated.breakdown && typeof gated.breakdown === "object"
        ? (gated.breakdown as Record<string, number>)
        : null,
  };
}

async function mergeLatestSubmissionData(
  studentId: string,
  subjectId: string,
  rows: FullStudentDataRow[]
): Promise<FullStudentDataRow[]> {
  const { data, error } = await supabase
    .from("submissions")
    .select("*")
    .eq("student_id", studentId)
    .eq("subject_id", subjectId)
    .order("updated_at", { ascending: false });
  if (error || !Array.isArray(data) || data.length === 0) return rows;

  const byExpId = new Map<string, Record<string, unknown>>();
  data.forEach((row) => {
    const expId = text((row as Record<string, unknown>).exp_id ?? (row as Record<string, unknown>).experiment_id);
    if (!expId || byExpId.has(expId)) return;
    byExpId.set(expId, row as Record<string, unknown>);
  });

  return rows.map((row) => {
    const expId = text(row.experiment_id ?? row.exp_id ?? row.id);
    const submission = byExpId.get(expId);
    if (!submission) return stripTemplateMarksRow(row);
    const s = submission as Record<string, unknown>;
    /** Prefer `marks` (updated by several faculty UIs); then explicit faculty/final columns. */
    const marksFromSub =
      numOrNull(s.marks) ?? numOrNull(s.faculty_marks) ?? numOrNull(s.final_marks);
    const facultyFromSub = numOrNull(s.faculty_marks) ?? numOrNull(s.marks);
    const finalFromSub = numOrNull(s.final_marks) ?? numOrNull(s.marks);
    return {
      ...row,
      status: text(submission.status ?? row.status, text(row.status, "pending")),
      marks: marksFromSub ?? numOrNull(row.marks),
      faculty_marks: facultyFromSub ?? numOrNull(row.faculty_marks),
      final_marks: finalFromSub ?? numOrNull(row.final_marks),
      ai_marks: numOrNull(s.ai_marks) ?? numOrNull(row.ai_marks),
      is_overridden: bool(s.is_overridden) || bool(row.is_overridden),
      updated_at: submission.updated_at ?? row.updated_at,
      submitted_date: submission.submitted_date ?? row.submitted_date,
      due_date: submission.due_date ?? row.due_date ?? row.deadline_date,
      aim: submission.aim ?? row.aim,
      procedure: submission.procedure ?? row.procedure,
      algorithm: submission.algorithm ?? row.algorithm,
      program: submission.program ?? submission.source_code ?? row.program,
      source_code: submission.source_code ?? row.source_code,
      output: submission.output ?? row.output,
      result: submission.result ?? row.result,
      images: firstNonEmptyImageList(
        submission.images,
        submission.attachments,
        row.images,
        row.attachments
      ),
    };
  });
}

function isMissingRelationError(error: unknown, relationName: string): boolean {
  const blob = JSON.stringify(error || {}).toLowerCase();
  const relation = relationName.toLowerCase();
  return (
    blob.includes("404") ||
    blob.includes("not found") ||
    blob.includes("does not exist") ||
    blob.includes(relation)
  );
}

function mapFromStudentExperimentRow(
  row: StudentExperimentRow,
  submissionByExpId: Map<string, Record<string, unknown>>,
  index: number
): FullStudentDataRow {
  const exp = (row.experiments || {}) as Record<string, unknown>;
  const expId = text(row.experiment_id ?? exp.id);
  const submission = submissionByExpId.get(expId) || {};
  const sub = submission as Record<string, unknown>;
  const marksFromSub =
    numOrNull(sub.marks) ?? numOrNull(sub.faculty_marks) ?? numOrNull(sub.final_marks);
  const merged: FullStudentDataRow = {
    id: text(row.id, `row-${index + 1}`),
    experiment_id: expId,
    experiment_no: numOrNull(exp.experiment_no) ?? 0,
    title: text(exp.title, "Untitled Experiment"),
    status: text(submission.status ?? row.status, "pending"),
    updated_at: text(row.updated_at ?? submission.updated_at),
    submitted_date: text(row.submitted_date ?? submission.submitted_date),
    start_date: text(row.start_date) || null,
    /** From `experiments.due_date` — always current when faculty edits catalog */
    deadline_date: text(exp.due_date) || null,
    is_completed: row.is_completed,
    faculty_marks:
      numOrNull(sub.faculty_marks) ?? numOrNull(sub.marks) ?? numOrNull(row.faculty_marks),
    ai_marks: numOrNull(sub.ai_marks) ?? numOrNull(row.ai_marks),
    final_marks:
      numOrNull(sub.final_marks) ?? numOrNull(sub.marks) ?? numOrNull(row.final_marks),
    marks: marksFromSub ?? numOrNull(row.marks) ?? numOrNull(row.ai_marks) ?? numOrNull(row.faculty_marks),
    is_overridden: row.is_overridden,
    aim: submission.aim,
    algorithm: submission.algorithm ?? submission.procedure,
    procedure: submission.procedure,
    program: submission.program ?? submission.source_code,
    source_code: submission.source_code,
    output: submission.output,
    result: submission.result,
    images: firstNonEmptyImageList(submission.images, submission.attachments, row.images, row.attachments),
    confidence: submission.confidence,
    breakdown: submission.breakdown,
  };
  if (marksFromSub != null) return merged;
  return stripTemplateMarksRow(merged);
}

/**
 * Load the subject experiment catalog from `experiments` (faculty source of truth for title / number / due date).
 * Not the `full_student_data` view — that can omit new labs or show stale titles until DB view is recreated.
 */
async function fetchRowsFromStudentExperiments(
  studentId: string,
  subjectId: string
): Promise<{ rows: FullStudentDataRow[]; resolvedSubjectId: string }> {
  async function fetchExperimentsBySubjectId(targetSubjectId: string) {
    const selectVariants = [
      "id, title, experiment_no, subject_id, due_date",
      "id, title, experiment_no, subject_id",
    ];
    let lastErr: { message?: string } | null = null;
    for (const sel of selectVariants) {
      const res = await supabase
        .from("experiments")
        .select(sel)
        .eq("subject_id", targetSubjectId)
        .order("experiment_no", { ascending: true });
      if (!res.error) {
        return { data: Array.isArray(res.data) ? res.data : [], error: null as null };
      }
      lastErr = res.error;
    }
    return { data: [], error: lastErr };
  }

  let resolvedSubjectId = String(subjectId || "").trim();
  let experimentsResponse = await fetchExperimentsBySubjectId(resolvedSubjectId);
  if (experimentsResponse.error) {
    throw new Error(experimentsResponse.error.message || "Unable to load subject experiments.");
  }
  if (!Array.isArray(experimentsResponse.data) || experimentsResponse.data.length === 0) {
    const subjectCandidates = await resolveSubjectIdsByName(
      localStorage.getItem("student_subject_name") || ""
    );
    for (const candidateId of subjectCandidates) {
      if (!candidateId || candidateId === String(subjectId)) continue;
      const candidateExpRes = await fetchExperimentsBySubjectId(candidateId);
      if (
        !candidateExpRes.error &&
        Array.isArray(candidateExpRes.data) &&
        candidateExpRes.data.length > 0
      ) {
        experimentsResponse = candidateExpRes;
        resolvedSubjectId = candidateId;
        localStorage.setItem("student_subject_id", candidateId);
        break;
      }
    }
  }
  const experimentRows = (experimentsResponse.data || []) as Record<string, unknown>[];
  const experimentIds = experimentRows
    .map((row) => text(row.id))
    .filter(Boolean);

  const [studentExpResponse, submissionsResponse] = await Promise.all([
    experimentIds.length > 0
      ? supabase
          .from("student_experiments")
          .select("*")
          .eq("student_id", studentId)
          .in("experiment_id", experimentIds)
      : Promise.resolve({ data: [], error: null } as any),
    supabase
      .from("submissions")
      .select("*")
      .eq("student_id", studentId)
      .eq("subject_id", resolvedSubjectId || subjectId)
      .order("updated_at", { ascending: false }),
  ]);

  if (studentExpResponse.error) {
    throw new Error(studentExpResponse.error.message || "Unable to load student experiment progress.");
  }
  if (submissionsResponse.error) {
    throw new Error(submissionsResponse.error.message || "Unable to load submissions.");
  }

  const studentExpByExperimentId = new Map<string, StudentExperimentRow>();
  ((studentExpResponse.data || []) as StudentExperimentRow[]).forEach((row) => {
    const expId = text(row.experiment_id);
    if (!expId || studentExpByExperimentId.has(expId)) return;
    studentExpByExperimentId.set(expId, row);
  });

  const submissionRows = (submissionsResponse.data || []) as Record<string, unknown>[];
  const submissionByExpId = new Map<string, Record<string, unknown>>();
  submissionRows.forEach((row) => {
    const expId = text(row.exp_id ?? row.experiment_id);
    if (!expId || submissionByExpId.has(expId)) return;
    submissionByExpId.set(expId, row);
  });

  const rows = experimentRows.map((expRow, index) => {
    const expId = text(expRow.id);
    const seRow = studentExpByExperimentId.get(expId) || ({} as StudentExperimentRow);
    return mapFromStudentExperimentRow(
      {
        ...seRow,
        id: text(seRow.id, `row-${index + 1}`),
        experiment_id: expId,
        experiments: expRow,
      } as StudentExperimentRow,
      submissionByExpId,
      index
    );
  });
  return { rows, resolvedSubjectId: resolvedSubjectId || subjectId };
}

/**
 * Student dashboard / hooks: titles and experiment numbers always match faculty `experiments` rows
 * (including bulk upload and edits), merged with submissions.
 */
export async function loadStudentExperimentRowsFromCatalog(
  studentId: string,
  subjectId: string
): Promise<FullStudentDataRow[]> {
  const { rows, resolvedSubjectId } = await fetchRowsFromStudentExperiments(studentId, subjectId);
  return mergeLatestSubmissionData(studentId, resolvedSubjectId, rows);
}

async function fetchFullStudentRows(studentId: string, subjectId: string, subjectName?: string) {
  void subjectName;
  const { rows, resolvedSubjectId } = await fetchRowsFromStudentExperiments(studentId, subjectId);
  const mergedRows = await mergeLatestSubmissionData(studentId, resolvedSubjectId, rows);
  return sortByExperimentNo(mergedRows, (row) => row.experiment_no ?? row.experiment_number ?? row.experimentNo);
}

export function saveFacultyRecordOverride() {
  // DB is now the only source of truth for marks.
}

export async function getFacultyUnifiedData(options: {
  subjectId: string;
  subjectName?: string;
}): Promise<{ rows: FacultyUnifiedRow[]; totalStudents: number }> {
  if (fullStudentDataViewAvailable === false) {
    return { rows: [], totalStudents: 0 };
  }
  const { data, error } = await supabase
    .from("full_student_data")
    .select("*")
    .eq("subject_id", options.subjectId)
    .order("experiment_no", { ascending: true });

  if (error) {
    if (isMissingRelationError(error, "full_student_data")) {
      fullStudentDataViewAvailable = false;
      return { rows: [], totalStudents: 0 };
    }
    throw new Error(error.message || "Unable to load faculty data.");
  }
  fullStudentDataViewAvailable = true;

  let rows = ((data || []) as FullStudentDataRow[]).map((row, index) => {
    const facultyMarks = numOrNull(row.faculty_marks);
    const aiMarks = numOrNull(row.ai_marks);
    const finalMarks = facultyMarks ?? aiMarks ?? 0;
    const experimentNo =
      numOrNull(row.experiment_no) ??
      numOrNull(row.experiment_number) ??
      numOrNull(row.experimentNo) ??
      0;
    const register = text(row.register_no ?? row.register_number);
    return {
      key: `${register}:${experimentNo}`,
      studentName: text(row.student_name ?? row.name, "Student"),
      registerNumber: register,
      experimentNo,
      experimentName: text(row.title ?? row.experiment_title, `Experiment ${experimentNo}`),
      status: normalizeStatus(row.status),
      marks: finalMarks,
      facultyMarks,
      finalMarks,
      isOverridden: bool(row.is_overridden) || facultyMarks != null,
      aiScore: aiMarks,
      confidence: numOrNull(row.confidence),
      aim: text(row.aim),
      algorithm: text(row.algorithm ?? row.procedure),
      program: text(row.program ?? row.source_code),
      output: text(row.output),
      result: text(row.result),
      updatedAt: text(row.updated_at),
    };
  });

  if (isNndlSubjectName(options.subjectName || localStorage.getItem("faculty_subject_name") || "")) {
    rows = rows.filter(
      (row) =>
        !isGenericExperimentTitle(row.experimentName) &&
        !shouldHideLegacyNndlUnifiedExperiment(
          options.subjectName || localStorage.getItem("faculty_subject_name") || "",
          row.experimentNo,
          row.experimentName
        )
    );
  }

  const uniqueStudents = new Set(rows.map((row) => row.registerNumber).filter(Boolean));
  return { rows, totalStudents: uniqueStudents.size };
}

export async function getStudentExperimentData(
  options: Options
): Promise<UnifiedStudentDataResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("No authenticated user.");
  }

  const rows = await fetchFullStudentRows(user.id, options.subjectId, options.subjectName);
  const subjectLabelForOrder =
    options.subjectName || localStorage.getItem("student_subject_name") || "";
  let mappedExperiments = sortByExperimentNo(rows.map(mapUnifiedExperiment), (row) => row.experimentNo);
  mappedExperiments = applyOoseExperimentOrderIfNeeded(
    options.subjectId,
    subjectLabelForOrder,
    mappedExperiments,
    (row) => row.title
  );
  const nndlName = options.subjectName || localStorage.getItem("student_subject_name") || "";
  if (isNndlSubjectName(nndlName)) {
    mappedExperiments = mappedExperiments.filter(
      (row) =>
        !isGenericExperimentTitle(row.title) &&
        !shouldHideLegacyNndlUnifiedExperiment(nndlName, row.experimentNo, row.title)
    );
  }
  let experiments = mappedExperiments;

  const totalMarks = experiments.reduce((sum, item) => sum + (Number.isFinite(item.marks) ? item.marks : 0), 0);
  const maxMarks = Math.max(1, experiments.length * 10);
  const internalPercent = Number(((totalMarks / maxMarks) * 100).toFixed(2));

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("name, register_no, department, year, semester, role")
    .eq("id", user.id)
    .maybeSingle();
  const first = rows[0] || {};
  const typedProfile = (profileRow as Record<string, unknown> | null) || null;
  const profileRole = text(typedProfile?.role).toLowerCase();
  const profileIsStudent = profileRole === "student" || profileRole === "";
  const year = text((profileIsStudent ? typedProfile?.year : null) ?? first.year, "III");
  const semester = text(
    (profileIsStudent ? typedProfile?.semester : null) ?? first.semester,
    "V"
  );
  const profile = {
    studentName: text(
      first.student_name ?? first.name ?? (profileIsStudent ? typedProfile?.name : null),
      "Student"
    ),
    registerNo: text(
      first.register_no ?? first.register_number ?? (profileIsStudent ? typedProfile?.register_no : null),
      "N/A"
    ),
    department: text(first.department ?? (profileIsStudent ? typedProfile?.department : null), "IT"),
    yearSemester: `Year ${year} / Semester ${semester}`,
  };

  return {
    experiments,
    totalMarks,
    internalPercent,
    demoModeActive: false,
    aiAssistedEvaluation: true,
    parsedContentAvailable: false,
    profile,
    source: "real",
  };
}
