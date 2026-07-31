const express = require("express");
const multer = require("multer");
const { randomUUID } = require("crypto");
const {
  getSupabaseClient,
  uploadManual,
  extractExperimentTitles,
  extractExperimentTitlesFromText,
  detectContentType,
  saveExperiments,
  processAllManualsFromStorage,
  syncExperimentsToSubject,
} = require("../services/manualService.cjs");
const { calculateMarks } = require("../services/evaluationService.cjs");
const { extractPdfTextWithPages } = require("../services/pdfParsingService.cjs");
const { rewardSubmission } = require("../services/gamificationService.cjs");
const { requireAuth, requireFaculty } = require("../middleware/roleMiddleware.cjs");

const router = express.Router();
const uploadJobs = new Map();
const UPLOAD_JOB_TTL_MS = 15 * 60 * 1000;
const UPLOAD_JOB_MAX_RUNTIME_MS = 8 * 60 * 1000;
let experimentNumberColumnMode = "unknown"; // unknown | legacy | modern

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

function maybeUploadStudentPdf(req, res, next) {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (!contentType.includes("multipart/form-data")) {
    next();
    return;
  }
  upload.single("student_pdf")(req, res, next);
}

function safeErrorResponse(res, status, message, error) {
  return res.status(status).json({
    success: false,
    message,
    error: error || "Operation failed",
    data: null,
  });
}

function safeSuccessResponse(res, message, data) {
  return res.json({
    success: true,
    message,
    error: null,
    data: data || null,
  });
}

function isMissingColumnError(error, columnName) {
  const blob = JSON.stringify(error || {}).toLowerCase();
  return blob.includes(String(columnName || "").toLowerCase()) && blob.includes("column");
}

function isOnConflictUnsupportedError(error) {
  const blob = JSON.stringify(error || {}).toLowerCase();
  return (
    blob.includes("on_conflict") ||
    blob.includes("no unique or exclusion constraint") ||
    blob.includes("42p10")
  );
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function cleanupExpiredUploadJobs() {
  const now = Date.now();
  for (const [jobId, job] of uploadJobs.entries()) {
    const createdAt = Number(job?.created_at || now);
    if (now - createdAt > UPLOAD_JOB_TTL_MS) {
      uploadJobs.delete(jobId);
    }
  }
}

function normalizeTitle(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDepartmentKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractNumericToken(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  const numeric = text.match(/\d+/)?.[0];
  if (numeric) return String(Number(numeric));
  const romanMap = {
    i: 1,
    ii: 2,
    iii: 3,
    iv: 4,
    v: 5,
    vi: 6,
    vii: 7,
    viii: 8,
  };
  return romanMap[text] ? String(romanMap[text]) : "";
}

function academicFieldMatches(studentValue, subjectValue) {
  const student = String(studentValue || "").trim().toLowerCase();
  const subject = String(subjectValue || "").trim().toLowerCase();
  if (!subject || !student) return true;
  if (subject === student) return true;
  const studentNumeric = extractNumericToken(student);
  const subjectNumeric = extractNumericToken(subject);
  if (studentNumeric && subjectNumeric) return studentNumeric === subjectNumeric;
  return false;
}

function isScopedStudentForSubject(student, subject) {
  if (!student || !subject) return true;

  const subjectDepartment = normalizeDepartmentKey(subject.department);
  const studentDepartment = normalizeDepartmentKey(student.department);
  if (subjectDepartment && studentDepartment && subjectDepartment !== studentDepartment) {
    return false;
  }
  if (subjectDepartment && !studentDepartment) {
    return false;
  }

  const subjectYear = String(subject.year || "").trim();
  const studentYear = String(student.year || "").trim();
  if (!academicFieldMatches(studentYear, subjectYear)) {
    return false;
  }
  // Missing year in legacy rows should not hide valid submissions.
  if (subjectYear && !studentYear) {
    return true;
  }

  return true;
}

function resolveProfileName(row) {
  const direct = String(row?.name || "").trim();
  if (direct) return direct;
  const fullName = String(row?.full_name || "").trim();
  if (fullName) return fullName;
  const joined = `${String(row?.first_name || "").trim()} ${String(row?.last_name || "").trim()}`.trim();
  if (joined) return joined;
  return null;
}

async function fetchProfileRowsByKeys(supabase, studentIds) {
  const selectAttempts = [
    { select: "id, name, full_name, first_name, last_name, register_no, department, year, semester, role", role: true },
    { select: "id, name, full_name, first_name, last_name, register_no, department, year, semester", role: false },
    { select: "id, name, register_no, department, year, semester, role", role: true },
    { select: "id, name, register_no, department, year, semester", role: false },
    { select: "id, name, register_no, role", role: true },
    { select: "id, name, register_no", role: false },
    { select: "id, name", role: false },
  ];

  for (const attempt of selectAttempts) {
    const [byIdRes, byRegisterRes] = await Promise.all([
      (() => {
        let q = supabase.from("profiles").select(attempt.select).in("id", studentIds);
        if (attempt.role) q = q.eq("role", "student");
        return q;
      })(),
      (() => {
        let q = supabase.from("profiles").select(attempt.select).in("register_no", studentIds);
        if (attempt.role) q = q.eq("role", "student");
        return q;
      })(),
    ]);

    if (!byIdRes.error && !byRegisterRes.error) {
      return [...(byIdRes.data || []), ...(byRegisterRes.data || [])];
    }
  }
  return [];
}

async function fetchStudentsRowsByKeys(supabase, studentIds) {
  const selectAttempts = [
    "id, name, register_number, department, year, semester",
    "id, name, register_number, department, year",
    "id, name, register_number",
    "id, name",
  ];

  for (const selectClause of selectAttempts) {
    const [byIdRes, byRegisterRes] = await Promise.all([
      supabase.from("students").select(selectClause).in("id", studentIds),
      supabase.from("students").select(selectClause).in("register_number", studentIds),
    ]);
    if (!byIdRes.error && !byRegisterRes.error) {
      return [...(byIdRes.data || []), ...(byRegisterRes.data || [])];
    }
  }
  return [];
}

async function fetchAllProfileStudentsRows(supabase) {
  const attempts = [
    { select: "id, name, full_name, first_name, last_name, register_no, department, year, semester, role, is_active", role: true },
    { select: "id, name, full_name, first_name, last_name, register_no, department, year, semester, role", role: true },
    { select: "id, name, full_name, first_name, last_name, register_no, department, year, semester, is_active", role: false },
    { select: "id, name, register_no, department, year, semester, role, is_active", role: true },
    { select: "id, name, register_no, department, year, semester, role", role: true },
    { select: "id, name, register_no, department, year, semester", role: false },
    { select: "id, name, register_no", role: false },
    { select: "id, name", role: false },
  ];
  for (const attempt of attempts) {
    let query = supabase.from("profiles").select(attempt.select);
    if (attempt.role) query = query.eq("role", "student");
    const { data, error } = await query;
    if (!error) {
      const rows = Array.isArray(data) ? data : [];
      if (attempt.role) return rows;
      return rows.filter((row) => {
        const role = String(row?.role || "").toLowerCase().trim();
        return !role || role === "student";
      });
    }
  }
  return [];
}

async function fetchAllStudentsMasterRows(supabase) {
  const attempts = [
    "id, name, register_number, department, year, semester",
    "id, name, register_number, department, year",
    "id, name, register_number",
    "id, name",
  ];
  for (const selectClause of attempts) {
    const { data, error } = await supabase.from("students").select(selectClause);
    if (!error) return Array.isArray(data) ? data : [];
  }
  return [];
}

function isQuestionLikeTitle(title) {
  const value = normalizeTitle(title);
  if (!value) return true;
  if (value.includes("?")) return true;
  return /^(what|who|why|how|which|when|where|define|explain|list|write|state|differentiate|compare)\b/i.test(
    value
  );
}

function isValidExperimentTitle(title) {
  const value = normalizeTitle(title);
  if (!value) return false;
  if (isQuestionLikeTitle(value)) return false;
  if (/^(aim|requirements?|source code|result|viva questions?|question|questions?)\b/i.test(value)) {
    return false;
  }
  if (/^(q\.?\s*\d+|question\s*\d+)[\s:.-]/i.test(value)) return false;
  if (value.length < 3) return false;
  return true;
}

function parseVivaQuestions(rawContent) {
  try {
    let source = "";

    if (typeof rawContent === "string") {
      source = rawContent;
      try {
        const parsed = JSON.parse(rawContent);
        if (parsed && typeof parsed === "object" && typeof parsed.viva === "string") {
          source = parsed.viva;
        }
      } catch {
        // Keep raw string fallback
      }
    } else if (rawContent && typeof rawContent === "object") {
      source = String(rawContent.viva || rawContent.content || "");
    }

    source = String(source || "").trim();
    if (!source) return [];

    const lines = source
      .split(/\r?\n/)
      .map((line) => String(line || "").replace(/\u00a0/g, " ").trim())
      .filter(Boolean)
      .map((line) => line.replace(/^\d+\s*[\).:-]\s*/, "").trim())
      .filter((line) => line.length > 2)
      .filter(
        (line) =>
          !/^viva\s*questions?/i.test(line) &&
          !/^marks awarded/i.test(line) &&
          !/^signature/i.test(line) &&
          !/^date[:\s-]*$/i.test(line) &&
          !/^result[:\s-]*$/i.test(line) &&
          !/^-{1,}\s*\d+\s+of\s+\d+\s*-{1,}$/i.test(line) &&
          !/^\d+\s+of\s+\d+$/i.test(line) &&
          !/^\d{1,3}$/.test(line)
      );

    const questionStartPattern =
      /^(what|who|why|how|which|when|where|define|explain|list|write|state|differentiate|compare)\b/i;

    const cleaned = lines
      .filter((line) => line.includes("?") || questionStartPattern.test(line))
      .map((line) => line.replace(/\s+/g, " ").trim())
      .map((line) => (line.endsWith("?") ? line : `${line}?`));

    const unique = [];
    const seen = new Set();
    for (const q of cleaned) {
      const key = q.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(q);
    }

    return unique;
  } catch (error) {
    return [];
  }
}

function safeJsonParse(value) {
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return null;
  }
}

function extractSectionFromText(text, label) {
  const source = String(text || "");
  if (!source.trim()) return "";
  const labels = ["AIM", "REQUIREMENTS", "SOURCE CODE", "RESULT", "VIVA QUESTIONS"];
  const regex = new RegExp(
    `${label}\\s*:(.*?)((?:${labels.join("|")})\\s*:|$)`,
    "is"
  );
  const match = source.match(regex);
  if (!match) return "";
  return String(match[1] || "").replace(/\s+\n/g, "\n").trim();
}

function cleanExtractedSectionText(value, options = {}) {
  const allowStandaloneNumbers = options.allowStandaloneNumbers === true;
  const source = String(value || "");
  if (!source.trim()) return "";

  const cleaned = source
    .split(/\r?\n/)
    .map((line) => String(line || "").replace(/\u00a0/g, " ").trim())
    .map((line) =>
      line
        // Remove OCR/page-counter fragments often found in extracted manuals.
        .replace(/-{1,}\s*\d+\s+of\s+\d+\s*-{0,}/gi, "")
        .replace(/\b\d+\s+of\s+\d+\b/gi, "")
        .replace(/[┐┘┌└│]/g, "")
        .trim()
    )
    .filter((line) => line.length > 0)
    .filter((line) => {
      if (/^page\s*\d+$/i.test(line)) return false;
      if (/^date[:\s-]*$/i.test(line)) return false;
      if (/^result[:\s-]*$/i.test(line)) return false;
      if (/^aim[:\s-]*$/i.test(line)) return false;
      if (!allowStandaloneNumbers && /^\d{1,3}$/.test(line)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned;
}

function buildSubjectExperimentSequence(rows = []) {
  const filtered = [...rows].filter((row) => isValidExperimentTitle(row?.title));
  return filtered.map((row, index) => ({
    id: row.id,
    title: row.title,
    experiment_number: index + 1,
  }));
}

function parseManualTemplate(rawContent) {
  const parsed = safeJsonParse(rawContent);

  if (parsed && typeof parsed === "object") {
    const rawText = cleanExtractedSectionText(parsed.raw_text || parsed.content || "", {
      allowStandaloneNumbers: true,
    });
    const parsedAlgorithm = cleanExtractedSectionText(
      parsed.algorithm || extractSectionFromText(rawText, "ALGORITHM")
    );
    const parsedProgram = cleanExtractedSectionText(
      parsed.program || extractSectionFromText(rawText, "PROGRAM"),
      { allowStandaloneNumbers: true }
    );
    const parsedOutput = cleanExtractedSectionText(
      parsed.output || extractSectionFromText(rawText, "OUTPUT"),
      { allowStandaloneNumbers: true }
    );
    return {
      aim: cleanExtractedSectionText(parsed.aim || ""),
      procedure: cleanExtractedSectionText(parsed.requirements || parsed.procedure || ""),
      source_code: cleanExtractedSectionText(parsed.source_code || parsed.program || "", {
        allowStandaloneNumbers: true,
      }),
      result: cleanExtractedSectionText(parsed.result || ""),
      algorithm: parsedAlgorithm,
      program: parsedProgram,
      output: parsedOutput,
      viva: parseVivaQuestions(parsed),
      raw_text: rawText,
    };
  }

  const source = String(rawContent || "");
  const rawText = cleanExtractedSectionText(source, { allowStandaloneNumbers: true });
  return {
    aim: cleanExtractedSectionText(extractSectionFromText(source, "AIM")),
    procedure: cleanExtractedSectionText(extractSectionFromText(source, "REQUIREMENTS")),
    source_code: cleanExtractedSectionText(extractSectionFromText(source, "SOURCE CODE"), {
      allowStandaloneNumbers: true,
    }),
    result: cleanExtractedSectionText(extractSectionFromText(source, "RESULT")),
    algorithm: cleanExtractedSectionText(extractSectionFromText(source, "ALGORITHM")),
    program: cleanExtractedSectionText(extractSectionFromText(source, "PROGRAM"), {
      allowStandaloneNumbers: true,
    }),
    output: cleanExtractedSectionText(extractSectionFromText(source, "OUTPUT"), {
      allowStandaloneNumbers: true,
    }),
    viva: parseVivaQuestions(source),
    raw_text: rawText,
  };
}

async function processManualUpload(file, subjectId) {
  const uploadResult = await uploadManual(file);
  if (!uploadResult.success) {
    throw new Error(uploadResult.error || uploadResult.message || "Upload failed");
  }

  // `uploadManual` already performs extraction and caches it in returned data.
  const extractedText = String(uploadResult?.data?.extracted_text || "");
  const extractedTitles = extractExperimentTitles(extractedText);
  const normalizedTitles = Array.from(
    new Set((extractedTitles || []).map((title) => normalizeTitle(title)).filter(Boolean))
  );
  const shouldSyncToSubject = Boolean(subjectId) && normalizedTitles.length > 0;
  const imageCount = String(file?.mimetype || "").startsWith("image/") ? 1 : 0;
  const contentType = detectContentType(extractedText, imageCount);

  const experimentRows = normalizedTitles.map((title) => ({
    experiment_title: title || "Experiment 1",
    content: extractedText || "",
    content_type: contentType,
    image_url:
      contentType === "image" || contentType === "mixed"
        ? uploadResult.data.file_url
        : null,
  }));

  const saveResult = await saveExperiments(uploadResult.data.manual_id, experimentRows);
  if (!saveResult.success) {
    throw new Error(saveResult.error || saveResult.message || "Failed to save extracted experiments");
  }

  let syncResult = null;
  if (shouldSyncToSubject) {
    syncResult = await syncExperimentsToSubject(subjectId, normalizedTitles, {
      replaceExisting: true,
    });
    if (!syncResult.success) {
      throw new Error(syncResult.error || syncResult.message || "Failed to sync experiments");
    }
  }

  return {
    manual: uploadResult.data,
    experiments: saveResult.data,
    extracted_text: extractedText,
    synced_subject_id: subjectId || null,
    subject_sync_skipped: Boolean(subjectId) && !shouldSyncToSubject,
    sync_summary: syncResult?.data || null,
  };
}

async function getExperimentsForSubject(supabase, subjectId) {
  if (experimentNumberColumnMode !== "modern") {
    const legacyQuery = await supabase
      .from("experiments")
      .select("id, title, experiment_no")
      .eq("subject_id", subjectId)
      .order("id", { ascending: true });

    if (!legacyQuery.error) {
      experimentNumberColumnMode = "legacy";
      return {
        data: buildSubjectExperimentSequence(legacyQuery.data || []),
        error: null,
      };
    }

    const errorBlob = JSON.stringify(legacyQuery.error || "").toLowerCase();
    const missingLegacyColumn = errorBlob.includes("experiment_no") && errorBlob.includes("column");
    if (!missingLegacyColumn) {
      return { data: [], error: legacyQuery.error };
    }
    experimentNumberColumnMode = "modern";
  }

  const modernQuery = await supabase
    .from("experiments")
    .select("id, title, experiment_number")
    .eq("subject_id", subjectId)
    .order("id", { ascending: true });

  if (modernQuery.error) {
    return { data: [], error: modernQuery.error };
  }

  return {
    data: buildSubjectExperimentSequence(
      (modernQuery.data || []).map((row) => ({
        id: row.id,
        title: row.title,
        experiment_no: row.experiment_number,
      }))
    ),
    error: null,
  };
}

async function getExperimentMeta(supabase, subjectId, experimentId) {
  let experiment = null;

  if (experimentNumberColumnMode !== "modern") {
    const legacy = await supabase
      .from("experiments")
      .select("id, title, subject_id, experiment_no")
      .eq("id", experimentId)
      .eq("subject_id", subjectId)
      .maybeSingle();

    if (!legacy.error && legacy.data) {
      experimentNumberColumnMode = "legacy";
      experiment = {
        id: legacy.data.id,
        title: legacy.data.title,
        subject_id: legacy.data.subject_id,
        experiment_number: legacy.data.experiment_no ?? null,
        content_type: null,
      };
    } else if (legacy.error) {
      const legacyMissing =
        JSON.stringify(legacy.error || "").toLowerCase().includes("experiment_no") &&
        JSON.stringify(legacy.error || "").toLowerCase().includes("column");

      if (!legacyMissing) {
        throw new Error(legacy.error.message);
      }
      experimentNumberColumnMode = "modern";
    }
  }

  if (!experiment) {
    const modern = await supabase
      .from("experiments")
      .select("id, title, subject_id, experiment_number")
      .eq("id", experimentId)
      .eq("subject_id", subjectId)
      .maybeSingle();

    if (modern.error) {
      throw new Error(modern.error.message);
    }
    if (modern.data) {
      experiment = {
        id: modern.data.id,
        title: modern.data.title,
        subject_id: modern.data.subject_id,
        experiment_number: modern.data.experiment_number ?? null,
        content_type: null,
      };
    }
  }

  if (!experiment) {
    return null;
  }

  const exactMatch = await supabase
    .from("manual_experiments")
    .select("id, experiment_title, content, content_type")
    .eq("experiment_title", experiment.title)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (exactMatch.error) {
    throw new Error(exactMatch.error.message);
  }

  let manualRow = exactMatch.data;
  if (!manualRow) {
    const looseMatch = await supabase
      .from("manual_experiments")
      .select("id, experiment_title, content, content_type")
      .ilike("experiment_title", `%${experiment.title}%`)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (looseMatch.error) {
      throw new Error(looseMatch.error.message);
    }
    manualRow = looseMatch.data;
  }

  const template = parseManualTemplate(manualRow?.content || "");
  const contentType = String(
    manualRow?.content_type || experiment.content_type || "mixed"
  ).toLowerCase();

  return {
    experiment_id: experiment.id,
    subject_id: experiment.subject_id,
    title: experiment.title,
    experiment_number: experiment.experiment_number,
    content_type: contentType,
    template,
    source: manualRow
      ? { manual_experiment_id: manualRow.id, experiment_title: manualRow.experiment_title }
      : null,
  };
}

router.post("/upload", requireAuth, requireFaculty, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return safeErrorResponse(res, 400, "Manual file is required", "Missing file");
    }
    const subjectId = String(req.body?.subject_id || "").trim();
    const payload = await processManualUpload(req.file, subjectId);

    return safeSuccessResponse(res, "Manual uploaded and analyzed", payload);
  } catch (error) {
    console.error("POST /api/manual/upload error:", error);
    return safeErrorResponse(res, 500, "Failed to upload manual", error?.message);
  }
});

router.post("/upload-async", requireAuth, requireFaculty, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return safeErrorResponse(res, 400, "Manual file is required", "Missing file");
    }

    cleanupExpiredUploadJobs();
    const subjectId = String(req.body?.subject_id || "").trim();
    const jobId = randomUUID();
    const createdAt = Date.now();

    uploadJobs.set(jobId, {
      job_id: jobId,
      status: "queued",
      message: "Upload received. Processing will start shortly.",
      created_at: createdAt,
      updated_at: createdAt,
      subject_id: subjectId || null,
      result: null,
      error: null,
    });

    setImmediate(async () => {
      const current = uploadJobs.get(jobId);
      if (!current) return;
      uploadJobs.set(jobId, {
        ...current,
        status: "processing",
        message: "Extracting manual and syncing experiments...",
        updated_at: Date.now(),
      });

      try {
        const result = await Promise.race([
          processManualUpload(req.file, subjectId),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Manual processing timeout exceeded")), UPLOAD_JOB_MAX_RUNTIME_MS)
          ),
        ]);
        const latest = uploadJobs.get(jobId);
        if (!latest) return;
        uploadJobs.set(jobId, {
          ...latest,
          status: "completed",
          message: "Manual processed successfully.",
          updated_at: Date.now(),
          result,
          error: null,
        });
      } catch (error) {
        const latest = uploadJobs.get(jobId);
        if (!latest) return;
        uploadJobs.set(jobId, {
          ...latest,
          status: "failed",
          message: "Manual processing failed.",
          updated_at: Date.now(),
          result: null,
          error: error?.message || "Unexpected error",
        });
      }
    });

    return res.status(202).json({
      success: true,
      message: "Upload accepted for background processing",
      data: {
        job_id: jobId,
        status: "queued",
      },
    });
  } catch (error) {
    return safeErrorResponse(res, 500, "Failed to start background upload", error?.message);
  }
});

router.get("/upload-status/:job_id", requireAuth, async (req, res) => {
  cleanupExpiredUploadJobs();
  const jobId = String(req.params.job_id || "").trim();
  if (!jobId) {
    return safeErrorResponse(res, 400, "job_id is required", "Missing params");
  }

  const job = uploadJobs.get(jobId);
  if (!job) {
    return safeErrorResponse(res, 404, "Upload job not found", "Job expired or invalid id");
  }

  return safeSuccessResponse(res, "Upload job status loaded", job);
});

router.get("/list", async (req, res) => {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return safeErrorResponse(
        res,
        500,
        "Unable to initialize manual service",
        "Supabase configuration missing"
      );
    }

    const { data, error } = await supabase
      .from("manuals")
      .select("id, title, file_url, uploaded_at")
      .order("uploaded_at", { ascending: false });

    if (error) {
      return safeErrorResponse(res, 500, "Failed to fetch manuals", error.message);
    }

    return safeSuccessResponse(res, "Manual list loaded", data || []);
  } catch (error) {
    console.error("GET /api/manual/list error:", error);
    return safeErrorResponse(res, 500, "Failed to fetch manuals", error?.message);
  }
});

router.get("/process-all", async (req, res) => {
  try {
    const force = String(req.query?.force || "").toLowerCase() === "true";
    const result = await processAllManualsFromStorage({ force });
    return res.json(result);
  } catch (error) {
    console.error("GET /api/manual/process-all error:", error);
    return safeErrorResponse(
      res,
      500,
      "Failed to process manuals from storage",
      error?.message
    );
  }
});

router.get("/exam-data/:exam_id", async (req, res) => {
  try {
    const examId = String(req.params.exam_id || "").trim();
    if (!examId) {
      return safeErrorResponse(res, 400, "exam_id is required", "Missing exam_id");
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return safeErrorResponse(res, 500, "Supabase client uninitialized");
    }

    const [examRes, subsRes, logsRes, violsRes, sessionsRes] = await Promise.all([
      supabase.from("exams").select("*").eq("id", examId).maybeSingle(),
      supabase.from("exam_submissions").select("*").eq("exam_id", examId).order("submitted_at", { ascending: false }),
      supabase.from("exam_activity_logs").select("*").eq("exam_id", examId).order("created_at", { ascending: false }),
      supabase.from("violations").select("*").eq("session_id", examId).order("created_at", { ascending: false }),
      supabase.from("exam_sessions").select("id, student_id").eq("exam_id", examId),
    ]);

    return safeSuccessResponse(res, "Exam data fetched successfully", {
      exam: examRes.data || null,
      submissions: subsRes.data || [],
      activity_logs: logsRes.data || [],
      violations: violsRes.data || [],
      sessions: sessionsRes.data || [],
    });
  } catch (error) {
    return safeErrorResponse(res, 500, "Failed to fetch exam data", error?.message);
  }
});

router.post("/exam-activity-log", async (req, res) => {
  try {
    const { exam_id, examId, register_no, registerNo, event, details, reason } = req.body || {};
    const eid = String(exam_id || examId || "").trim();
    const reg = String(register_no || registerNo || "").trim();
    const evt = String(event || "tab_switch").trim();
    const dtl = String(details || reason || "Tab switch / window hidden").trim();

    if (!eid || !reg) {
      return safeErrorResponse(res, 400, "exam_id and register_no are required", "Missing params");
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return safeErrorResponse(res, 500, "Supabase client uninitialized");
    }

    // Insert into exam_activity_logs using Service Role client
    const { error: logErr } = await supabase.from("exam_activity_logs").insert({
      exam_id: eid,
      register_no: reg,
      event: evt,
      details: dtl,
    });

    // Also insert into violations table as backup
    const { error: violErr } = await supabase.from("violations").insert({
      session_id: eid,
      violation_type: evt,
      details: `${reg}: ${dtl}`,
    });

    if (logErr && violErr) {
      console.warn("Backend exam activity log insert warning:", logErr.message, violErr.message);
    }

    return safeSuccessResponse(res, "Activity logged successfully", { exam_id: eid, register_no: reg, event: evt });
  } catch (error) {
    return safeErrorResponse(res, 500, "Failed to log activity", error?.message);
  }
});

router.get("/admin-proctor-data", async (req, res) => {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return safeErrorResponse(res, 500, "Supabase client uninitialized");
    }

    const [logsRes, violRes, examSubsRes, examsRes] = await Promise.all([
      supabase.from("exam_activity_logs").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("violations").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("exam_submissions").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("exams").select("id, title, room_id, subject_id, faculty_id"),
    ]);

    const activityLogs = logsRes.data || [];
    const violations = violRes.data || [];
    const submissions = examSubsRes.data || [];
    const exams = examsRes.data || [];

    return safeSuccessResponse(res, "Proctor data fetched", {
      activityLogs,
      violations,
      submissions,
      exams,
    });
  } catch (error) {
    return safeErrorResponse(res, 500, "Failed to fetch admin proctor data", error?.message);
  }
});

router.get("/faculty/students/:subject_id", requireAuth, requireFaculty, async (req, res) => {
  try {
    const subjectId = String(req.params.subject_id || "").trim();
    const rawStudentIds = String(req.query?.student_ids || "").trim();
    const studentIds = Array.from(
      new Set(
        rawStudentIds
          .split(",")
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      )
    );

    if (!subjectId) {
      return safeErrorResponse(res, 400, "subject_id is required", "Missing subject id");
    }

    if (studentIds.length === 0) {
      return safeSuccessResponse(res, "Scoped students loaded", []);
    }

    const supabase = getSupabaseClient();

    // Verify faculty assignment
    const { data: assignment, error: assignmentError } = await supabase
      .from("faculty_subjects")
      .select("faculty_id, subject_id")
      .eq("faculty_id", req.user.id)
      .eq("subject_id", subjectId)
      .maybeSingle();

    if (assignmentError) {
      return safeErrorResponse(res, 500, "Failed to verify faculty assignment", assignmentError.message);
    }

    if (!assignment) {
      return safeErrorResponse(res, 403, "Access denied", "Subject is not assigned to this faculty");
    }

    // Verify student enrollments for this subject
    const { data: enrollments, error: enrollmentsError } = await supabase
      .from("student_subjects")
      .select("student_id")
      .eq("subject_id", subjectId)
      .in("student_id", studentIds);

    if (enrollmentsError) {
      return safeErrorResponse(res, 500, "Failed to load student enrollments", enrollmentsError.message);
    }

    const enrolledStudentIds = (enrollments || []).map((row) => row.student_id).filter(Boolean);

    if (enrolledStudentIds.length === 0) {
      return safeSuccessResponse(res, "Scoped students loaded", []);
    }

    // Query profiles for the enrolled student IDs
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, name, email, register_no, department, year, semester, role")
      .in("id", enrolledStudentIds);

    if (profilesError) {
      return safeErrorResponse(res, 500, "Failed to load profiles for enrolled students", profilesError.message);
    }

    const studentMap = new Map();
    for (const row of profiles || []) {
      const normalizedRow = {
        ...row,
        name: resolveProfileName(row),
      };
      studentMap.set(String(row.id), normalizedRow);
    }

    return safeSuccessResponse(res, "Scoped students loaded", Array.from(studentMap.values()));
  } catch (error) {
    console.error("GET /api/manual/faculty/students/:subject_id error:", error);
    return safeErrorResponse(res, 500, "Failed to fetch scoped students", error?.message);
  }
});

router.get("/faculty/students-all/:subject_id", requireAuth, requireFaculty, async (req, res) => {
  try {
    const subjectId = String(req.params.subject_id || "").trim();
    if (!subjectId) {
      return safeErrorResponse(res, 400, "subject_id is required", "Missing subject id");
    }

    const supabase = getSupabaseClient();
    
    // Verify faculty assignment
    const { data: assignment, error: assignmentError } = await supabase
      .from("faculty_subjects")
      .select("faculty_id, subject_id")
      .eq("faculty_id", req.user.id)
      .eq("subject_id", subjectId)
      .maybeSingle();

    if (assignmentError) {
      return safeErrorResponse(res, 500, "Failed to verify faculty assignment", assignmentError.message);
    }
    if (!assignment) {
      return safeErrorResponse(res, 403, "Access denied", "Subject is not assigned to this faculty");
    }

    // Get all students enrolled in this subject via student_subjects
    const { data: enrollments, error: enrollmentsError } = await supabase
      .from("student_subjects")
      .select("student_id")
      .eq("subject_id", subjectId);

    if (enrollmentsError) {
      return safeErrorResponse(res, 500, "Failed to load student enrollments", enrollmentsError.message);
    }

    const enrolledStudentIds = (enrollments || []).map((row) => row.student_id).filter(Boolean);

    if (enrolledStudentIds.length === 0) {
      return safeSuccessResponse(res, "Scoped students loaded", []);
    }

    // Query profiles of enrolled students
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, name, email, register_no, department, year, semester, role")
      .in("id", enrolledStudentIds)
      .order("name");

    if (profilesError) {
      return safeErrorResponse(res, 500, "Failed to load profiles for enrolled students", profilesError.message);
    }

    const scopedMap = new Map();
    for (const row of profiles || []) {
      const normalizedRow = {
        ...row,
        name: resolveProfileName(row),
      };
      scopedMap.set(String(row.id), normalizedRow);
    }

    return safeSuccessResponse(res, "Scoped students loaded", Array.from(scopedMap.values()));
  } catch (error) {
    console.error("GET /api/manual/faculty/students-all/:subject_id error:", error);
    return safeErrorResponse(res, 500, "Failed to fetch scoped students", error?.message);
  }
});

router.get("/experiments/:subject_id", requireAuth, async (req, res) => {
  try {
    const subjectId = req.params.subject_id;
    const supabase = getSupabaseClient();

    const { data, error: queryError } = await getExperimentsForSubject(supabase, subjectId);

    if (queryError) {
      return res.status(500).json({
        success: false,
        error: queryError.message,
      });
    }

    return res.json(data);

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

router.patch(
  "/experiments/:subject_id/:experiment_id/content-type",
  requireAuth,
  requireFaculty,
  async (req, res) => {
    try {
      const subjectId = String(req.params.subject_id || "").trim();
      const experimentId = String(req.params.experiment_id || "").trim();
      const contentType = String(req.body?.content_type || "")
        .trim()
        .toLowerCase();

      if (!subjectId || !experimentId) {
        return safeErrorResponse(
          res,
          400,
          "subject_id and experiment_id are required",
          "Missing params"
        );
      }

      if (!["code", "text", "image", "mixed"].includes(contentType)) {
        return safeErrorResponse(
          res,
          400,
          "content_type must be one of: code, text, image, mixed",
          "Invalid content_type"
        );
      }

      const supabase = getSupabaseClient();

      const meta = await getExperimentMeta(supabase, subjectId, experimentId);
      if (!meta) {
        return safeErrorResponse(res, 404, "Experiment not found", "Not found");
      }

      // Update experiments table directly using Service Role
      await supabase
        .from("experiments")
        .update({ content_type: contentType })
        .eq("id", experimentId);

      const manualExperimentId = String(meta?.source?.manual_experiment_id || "").trim();
      if (manualExperimentId) {
        await supabase
          .from("manual_experiments")
          .update({ content_type: contentType })
          .eq("id", manualExperimentId);
      }

      return safeSuccessResponse(res, "Content type updated successfully", {
        experiment_id: experimentId,
        content_type: contentType,
      });
    } catch (error) {
      return safeErrorResponse(
        res,
        500,
        "Failed to update content type",
        error?.message
      );
    }
  }
);

router.patch(
  "/experiments/:subject_id/:experiment_id/deadline",
  requireAuth,
  requireFaculty,
  async (req, res) => {
    try {
      const subjectId = String(req.params.subject_id || "").trim();
      const experimentId = String(req.params.experiment_id || "").trim();
      const dueDate = req.body?.due_date ? String(req.body.due_date).trim() : null;

      if (!subjectId || !experimentId) {
        return safeErrorResponse(res, 400, "subject_id and experiment_id are required", "Missing params");
      }

      const supabase = getSupabaseClient();
      if (!supabase) {
        return safeErrorResponse(res, 500, "Supabase client uninitialized");
      }

      // Update experiments table directly
      const { error: expErr } = await supabase
        .from("experiments")
        .update({ due_date: dueDate })
        .eq("id", experimentId);

      // Update manual_experiments if exists
      const meta = await getExperimentMeta(supabase, subjectId, experimentId);
      if (meta?.source?.manual_experiment_id) {
        await supabase
          .from("manual_experiments")
          .update({ due_date: dueDate })
          .eq("id", meta.source.manual_experiment_id);
      }

      if (expErr) {
        console.warn("Direct experiments due_date update warning:", expErr.message);
      }

      return safeSuccessResponse(res, "Deadline updated successfully", {
        experiment_id: experimentId,
        due_date: dueDate,
      });
    } catch (error) {
      return safeErrorResponse(res, 500, "Failed to update deadline", error?.message);
    }
  }
);

router.delete("/experiments/:subject_id", requireAuth, requireFaculty, async (req, res) => {
  try {
    const subjectId = String(req.params.subject_id || "").trim();
    if (!subjectId) {
      return safeErrorResponse(res, 400, "subject_id is required", "Missing subject id");
    }

    const supabase = getSupabaseClient();
    const { data: experimentRows, error: experimentQueryError } = await supabase
      .from("experiments")
      .select("id")
      .eq("subject_id", subjectId);
    if (experimentQueryError) {
      return safeErrorResponse(res, 500, "Failed to read experiments", experimentQueryError.message);
    }
    const experimentIds = (Array.isArray(experimentRows) ? experimentRows : [])
      .map((row) => String(row.id || "").trim())
      .filter(Boolean);

    let deletedSubmissions = 0;
    let deletedStudentExperiments = 0;
    let deletedExperiments = 0;

    // 1) Remove submissions for this subject (also captures submission IDs for ai cleanup).
    const { data: submissionRows } = await supabase
      .from("submissions")
      .select("id")
      .eq("subject_id", subjectId);
    const submissionIds = (Array.isArray(submissionRows) ? submissionRows : [])
      .map((row) => Number(row?.id))
      .filter((id) => Number.isFinite(id));

    if (submissionIds.length > 0) {
      await supabase.from("ai_evaluations").delete().in("submission_id", submissionIds);
      const { error: submissionDeleteError, count } = await supabase
        .from("submissions")
        .delete({ count: "exact" })
        .eq("subject_id", subjectId);
      if (submissionDeleteError) {
        return safeErrorResponse(res, 500, "Failed to clear subject submissions", submissionDeleteError.message);
      }
      deletedSubmissions = Number(count || 0);
    }

    // 2) Remove student_experiments rows linked to this subject's experiments.
    if (experimentIds.length > 0) {
      const { error: seDeleteError, count: seCount } = await supabase
        .from("student_experiments")
        .delete({ count: "exact" })
        .in("experiment_id", experimentIds);
      if (seDeleteError) {
        return safeErrorResponse(res, 500, "Failed to clear student experiments", seDeleteError.message);
      }
      deletedStudentExperiments = Number(seCount || 0);
    }

    // 3) Finally remove experiment master rows for this subject.
    const { error: experimentDeleteError, count: expCount } = await supabase
      .from("experiments")
      .delete({ count: "exact" })
      .eq("subject_id", subjectId);
    if (experimentDeleteError) {
      return safeErrorResponse(res, 500, "Failed to clear experiments", experimentDeleteError.message);
    }
    deletedExperiments = Number(expCount || 0);

    return safeSuccessResponse(res, "Existing subject experiments removed", {
      subject_id: subjectId,
      deleted_experiments: deletedExperiments,
      deleted_student_experiments: deletedStudentExperiments,
      deleted_submissions: deletedSubmissions,
    });
  } catch (err) {
    return safeErrorResponse(res, 500, "Failed to clear experiments", err?.message);
  }
});

router.get("/viva/:subject_id/:experiment_id", requireAuth, async (req, res) => {
  try {
    const subjectId = String(req.params.subject_id || "").trim();
    const experimentId = String(req.params.experiment_id || "").trim();
    const supabase = getSupabaseClient();

    if (!subjectId || !experimentId) {
      return safeErrorResponse(res, 400, "subject_id and experiment_id are required", "Missing params");
    }

    const meta = await getExperimentMeta(supabase, subjectId, experimentId);
    if (!meta) {
      return safeErrorResponse(res, 404, "Experiment not found", "Not found");
    }
    return safeSuccessResponse(res, "Viva questions loaded", {
      experiment_id: meta.experiment_id,
      experiment_title: meta.title,
      questions: meta.template.viva || [],
    });
  } catch (error) {
    return safeErrorResponse(res, 500, "Failed to fetch viva questions", error?.message);
  }
});

router.get("/experiment-meta/:subject_id/:experiment_id", requireAuth, async (req, res) => {
  try {
    const subjectId = String(req.params.subject_id || "").trim();
    const experimentId = String(req.params.experiment_id || "").trim();
    const supabase = getSupabaseClient();

    if (!subjectId || !experimentId) {
      return safeErrorResponse(res, 400, "subject_id and experiment_id are required", "Missing params");
    }

    const meta = await getExperimentMeta(supabase, subjectId, experimentId);
    if (!meta) {
      return safeErrorResponse(res, 404, "Experiment not found", "Not found");
    }

    return safeSuccessResponse(res, "Experiment meta loaded", meta);
  } catch (error) {
    return safeErrorResponse(res, 500, "Failed to fetch experiment meta", error?.message);
  }
});

router.get("/record-text/:subject_id", requireAuth, async (req, res) => {
  try {
    const subjectId = String(req.params.subject_id || "").trim();
    if (!subjectId) {
      return safeErrorResponse(res, 400, "subject_id is required", "Missing subject id");
    }
    const supabase = getSupabaseClient();
    const { data: experiments, error } = await getExperimentsForSubject(supabase, subjectId);
    if (error) {
      return safeErrorResponse(res, 500, "Failed to fetch experiments", error.message);
    }
    const ordered = Array.isArray(experiments) ? experiments : [];
    if (ordered.length === 0) {
      return safeErrorResponse(res, 404, "No experiments found for subject", "Missing experiments");
    }

    const blocks = [];
    for (const experiment of ordered) {
      const meta = await getExperimentMeta(
        supabase,
        subjectId,
        String(experiment?.id || "").trim()
      );
      if (!meta?.template) continue;

      const experimentNo = Number(experiment?.experiment_number || 0) || blocks.length + 1;
      const template = meta.template || {};
      const aim = String(template.aim || "").trim();
      const algorithm = String(template.algorithm || template.procedure || "").trim();
      const program = String(template.program || template.source_code || "").trim();
      const output = String(template.output || "").trim();
      const result = String(template.result || "").trim();
      if (!aim || !algorithm || !program || !output || !result) {
        continue;
      }
      blocks.push(
        [
          `EX NO: ${experimentNo}`,
          `TITLE: ${String(meta.title || "").trim()}`,
          "AIM:",
          aim,
          "ALGORITHM:",
          algorithm,
          "PROGRAM:",
          program,
          "OUTPUT:",
          output,
          "RESULT:",
          result,
        ].join("\n")
      );
    }

    if (blocks.length === 0) {
      return safeErrorResponse(
        res,
        422,
        "Parsed experiment sections unavailable",
        "No complete AIM/ALGORITHM/PROGRAM/OUTPUT/RESULT sections found"
      );
    }

    return safeSuccessResponse(res, "Record text loaded", {
      text: blocks.join("\n\n"),
      experiment_count: blocks.length,
    });
  } catch (error) {
    return safeErrorResponse(res, 500, "Failed to build record text", error?.message);
  }
});

router.get("/:id", async (req, res) => {
  try {
    const manualId = req.params.id;
    if (!manualId) {
      return safeErrorResponse(res, 400, "Manual id is required", "Missing id");
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return safeErrorResponse(
        res,
        500,
        "Unable to initialize manual service",
        "Supabase configuration missing"
      );
    }

    const { data: manual, error: manualError } = await supabase
      .from("manuals")
      .select("id, title, file_url, uploaded_at")
      .eq("id", manualId)
      .maybeSingle();

    if (manualError) {
      return safeErrorResponse(res, 500, "Failed to fetch manual", manualError.message);
    }
    if (!manual) {
      return safeErrorResponse(res, 404, "Manual not found", "Not found");
    }

    const { data: experiments, error: expError } = await supabase
      .from("manual_experiments")
      .select("id, manual_id, experiment_title, content, content_type, image_url")
      .eq("manual_id", manualId)
      .order("id", { ascending: true });

    if (expError) {
      return safeErrorResponse(res, 500, "Failed to fetch experiments", expError.message);
    }

    return safeSuccessResponse(res, "Manual details loaded", {
      manual,
      experiments: experiments || [],
    });
  } catch (error) {
    console.error("GET /api/manual/:id error:", error);
    return safeErrorResponse(res, 500, "Failed to fetch manual details", error?.message);
  }
});

router.post("/submit", requireAuth, maybeUploadStudentPdf, async (req, res) => {
  try {
    const { experiment_id, student_name, student_content, output_image_url } = req.body || {};

    if (!experiment_id || !student_name) {
      return safeErrorResponse(
        res,
        400,
        "experiment_id and student_name are required",
        "Missing required fields"
      );
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return safeErrorResponse(
        res,
        500,
        "Unable to initialize manual service",
        "Supabase configuration missing"
      );
    }

    const { data: experiment, error: expError } = await supabase
      .from("manual_experiments")
      .select("id, content")
      .eq("id", experiment_id)
      .maybeSingle();

    if (expError) {
      return safeErrorResponse(res, 500, "Failed to fetch experiment", expError.message);
    }
    if (!experiment) {
      return safeErrorResponse(res, 404, "Experiment not found", "Not found");
    }

    let parsedPdfText = "";
    let parsedPdfPages = [];
    if (req.file && String(req.file.mimetype || "").toLowerCase().includes("pdf")) {
      try {
        const parsed = await extractPdfTextWithPages(req.file.buffer);
        parsedPdfText = String(parsed?.text || "");
        parsedPdfPages = Array.isArray(parsed?.pages) ? parsed.pages : [];
      } catch (pdfError) {
        parsedPdfText = "";
        parsedPdfPages = [];
      }
    }

    const marksResult = calculateMarks({
      rawText: parsedPdfText || student_content || "",
      referenceText: experiment.content || "",
      outputImage: output_image_url || null,
      pdfPages: parsedPdfPages,
    });

    const { data: inserted, error: insertError } = await supabase
      .from("manual_submissions")
      .insert({
        experiment_id,
        student_name,
        student_content: parsedPdfText || student_content || "",
        output_image_url: output_image_url || null,
        marks: marksResult.total,
      })
      .select("*")
      .single();

    if (insertError) {
      return safeErrorResponse(res, 500, "Failed to save submission", insertError.message);
    }

    // Gamification must never break submission flow.
    try {
      const uid = String(req.user?.id || "").trim();
      if (uid) {
        await rewardSubmission(uid, marksResult.total);
      }
    } catch (gamificationError) {
      console.error("Manual submit gamification error:", gamificationError);
    }

    return safeSuccessResponse(res, "Submission evaluated successfully", {
      submission: inserted,
      marks: marksResult,
      parser: {
        source: parsedPdfText ? "pdf" : "text",
        pages: parsedPdfPages.length,
      },
    });
  } catch (error) {
    console.error("POST /api/manual/submit error:", error);
    return safeErrorResponse(res, 500, "Failed to submit manual experiment", error?.message);
  }
});

router.post("/evaluate-submission-pdf", requireAuth, maybeUploadStudentPdf, async (req, res) => {
  try {
    const subjectId = String(req.body?.subject_id || "").trim();
    const expId = String(req.body?.exp_id || "").trim();
    const studentId = String(req.user?.id || "").trim();

    if (!studentId) {
      return safeErrorResponse(res, 401, "Not authenticated", "Missing user");
    }
    if (!subjectId || !expId) {
      return safeErrorResponse(res, 400, "subject_id and exp_id are required", "Missing required fields");
    }
    if (!req.file) {
      return safeErrorResponse(res, 400, "student_pdf is required", "Missing PDF file");
    }
    if (!String(req.file.mimetype || "").toLowerCase().includes("pdf")) {
      return safeErrorResponse(res, 400, "Uploaded file must be a PDF", "Invalid file type");
    }

    const supabase = getSupabaseClient();
    const parsed = await extractPdfTextWithPages(req.file.buffer);
    const parsedText = String(parsed?.text || "").trim();
    const parsedPages = Array.isArray(parsed?.pages) ? parsed.pages : [];
    const marksResult = calculateMarks({
      rawText: parsedText,
      pdfPages: parsedPages,
    });

    const submissionSelectCandidates = ["id, submission_uuid", "id, uuid", "id"];
    let submission = null;
    for (const selectClause of submissionSelectCandidates) {
      const response = await supabase
        .from("submissions")
        .select(selectClause)
        .eq("student_id", studentId)
        .eq("subject_id", subjectId)
        .eq("exp_id", expId)
        .maybeSingle();
      if (!response.error && response.data) {
        submission = response.data;
        break;
      }
    }

    if (!submission?.id) {
      return safeErrorResponse(
        res,
        404,
        "Submission not found",
        "Save or submit this experiment once before PDF AI evaluation"
      );
    }

    const aiScore = Number((Number(marksResult.total || 0) * 10).toFixed(2));
    const missingCount = Array.isArray(marksResult.missingSections) ? marksResult.missingSections.length : 0;
    const confidence = clamp(
      Math.round(((5 - Math.min(5, missingCount)) / 5) * 60 + (aiScore / 100) * 40),
      0,
      100
    );
    const breakdown = {
      aim: clamp(Math.round((Number(marksResult.breakdown?.aim || 0) / 2) * 100), 0, 100),
      procedure: clamp(Math.round((Number(marksResult.breakdown?.procedure || 0) / 2) * 100), 0, 100),
      algorithm: clamp(Math.round((Number(marksResult.breakdown?.procedure || 0) / 2) * 100), 0, 100),
      program: clamp(Math.round((Number(marksResult.breakdown?.program || 0) / 3) * 100), 0, 100),
      output: clamp(Math.round((Number(marksResult.breakdown?.output || 0) / 2) * 100), 0, 100),
      result: clamp(Math.round((Number(marksResult.breakdown?.result || 0) / 1) * 100), 0, 100),
    };

    let payload = {
      submission_id: submission.id,
      submission_uuid: String(submission?.submission_uuid || submission?.uuid || "").trim() || null,
      ai_score: aiScore,
      predicted_score: aiScore,
      confidence,
      status: String(marksResult.status || ""),
      breakdown,
      updated_at: new Date().toISOString(),
    };

    let persisted = false;
    const conflictTargets = payload.submission_uuid ? ["submission_id", "submission_uuid"] : ["submission_id"];
    for (const conflictTarget of conflictTargets) {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const upsertResponse = await supabase
          .from("ai_evaluations")
          .upsert(payload, { onConflict: conflictTarget });
        if (!upsertResponse.error) {
          persisted = true;
          break;
        }
        if (Object.prototype.hasOwnProperty.call(payload, "submission_id") && isMissingColumnError(upsertResponse.error, "submission_id")) {
          delete payload.submission_id;
          continue;
        }
        if (Object.prototype.hasOwnProperty.call(payload, "submission_uuid") && isMissingColumnError(upsertResponse.error, "submission_uuid")) {
          delete payload.submission_uuid;
          continue;
        }
        if (Object.prototype.hasOwnProperty.call(payload, "predicted_score") && isMissingColumnError(upsertResponse.error, "predicted_score")) {
          delete payload.predicted_score;
          continue;
        }
        if (Object.prototype.hasOwnProperty.call(payload, "confidence") && isMissingColumnError(upsertResponse.error, "confidence")) {
          delete payload.confidence;
          continue;
        }
        if (Object.prototype.hasOwnProperty.call(payload, "status") && isMissingColumnError(upsertResponse.error, "status")) {
          delete payload.status;
          continue;
        }
        if (Object.prototype.hasOwnProperty.call(payload, "breakdown") && isMissingColumnError(upsertResponse.error, "breakdown")) {
          delete payload.breakdown;
          continue;
        }
        if (Object.prototype.hasOwnProperty.call(payload, "updated_at") && isMissingColumnError(upsertResponse.error, "updated_at")) {
          delete payload.updated_at;
          continue;
        }
        if (isOnConflictUnsupportedError(upsertResponse.error)) {
          const updatePayload = { ...payload };
          delete updatePayload.submission_id;
          delete updatePayload.submission_uuid;
          const updateBy = conflictTarget === "submission_uuid" ? "submission_uuid" : "submission_id";
          const updateValue =
            updateBy === "submission_uuid"
              ? String(submission?.submission_uuid || submission?.uuid || "").trim()
              : submission.id;
          if (updateValue) {
            const updateResponse = await supabase
              .from("ai_evaluations")
              .update(updatePayload)
              .eq(updateBy, updateValue);
            if (!updateResponse.error) {
              persisted = true;
            }
          }
        }
        break;
      }
      if (persisted) break;
    }

    return safeSuccessResponse(res, "PDF evaluated successfully", {
      persisted,
      parser: {
        source: "pdf",
        pages: parsedPages.length,
        text_length: parsedText.length,
      },
      evaluation: {
        aiScore,
        marksOutOf10: marksResult.total,
        confidence,
        status: String(marksResult.status || ""),
        breakdown,
        sectionMarks: marksResult.breakdown,
        manualReviewRequired: Boolean(marksResult.manualReviewRequired),
        missingSections: marksResult.missingSections || [],
      },
    });
  } catch (error) {
    console.error("POST /api/manual/evaluate-submission-pdf error:", error);
    return safeErrorResponse(res, 500, "Failed to evaluate PDF", error?.message);
  }
});

// NEW ROUTE: Fetch exam data (submissions, activity logs, sessions) bypassing RLS
router.get("/exam-data/:examId", async (req, res) => {
  try {
    const { examId } = req.params;
    if (!examId) {
      return safeErrorResponse(res, 400, "Missing examId");
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      return safeErrorResponse(res, 500, "Supabase client not initialized");
    }

    const [submissionsRes, activityLogsRes, sessionsRes] = await Promise.all([
      supabase.from("exam_submissions").select("*").eq("exam_id", examId),
      supabase.from("exam_activity_logs").select("*").eq("exam_id", examId),
      supabase.from("exam_sessions").select("*").eq("exam_id", examId)
    ]);

    return safeSuccessResponse(res, "Fetched exam data successfully", {
      submissions: submissionsRes.data || [],
      activity_logs: activityLogsRes.data || [],
      sessions: sessionsRes.data || []
    });
  } catch (error) {
    console.error("GET /api/manual/exam-data/:examId error:", error);
    return safeErrorResponse(res, 500, "Failed to fetch exam data", error?.message);
  }
});

// AI TUTOR ROUTE & DAILY LIMIT TRACKER
const AI_TUTOR_DAILY_LIMIT = 3;
const aiTutorUsageMap = new Map();

function getTodayDateString() {
  return new Date().toISOString().split("T")[0];
}

function getStudentAiUsage(studentId) {
  const today = getTodayDateString();
  const key = `${studentId}:${today}`;
  return aiTutorUsageMap.get(key) || 0;
}

function incrementStudentAiUsage(studentId) {
  const today = getTodayDateString();
  const key = `${studentId}:${today}`;
  const current = aiTutorUsageMap.get(key) || 0;
  aiTutorUsageMap.set(key, current + 1);
  return current + 1;
}

router.post("/ai-tutor", requireAuth, async (req, res) => {
  try {
    const studentId = String(req.user?.id || "").trim();
    if (!studentId) {
      return safeErrorResponse(res, 401, "Not authenticated", "Missing student identity");
    }

    const rawPrompt = String(req.body?.prompt || "").trim();
    const experimentTitle = String(req.body?.experimentTitle || "Experiment Workspace").trim();
    const aim = String(req.body?.aim || "").trim();
    const procedure = String(req.body?.procedure || "").trim();
    const codeLanguage = String(req.body?.codeLanguage || "Python").trim();
    const codeValue = String(req.body?.codeValue || "").trim();
    const output = String(req.body?.output || "").trim();
    const expId = String(req.body?.expId || "").trim();

    if (!rawPrompt) {
      return safeErrorResponse(res, 400, "Prompt is required", "Missing prompt");
    }

    const usedToday = getStudentAiUsage(studentId);
    if (usedToday >= AI_TUTOR_DAILY_LIMIT) {
      return safeSuccessResponse(res, "Daily limit reached", {
        limitReached: true,
        remainingRequests: 0,
        totalLimit: AI_TUTOR_DAILY_LIMIT,
        answer: "⚠️ Daily AI Tutor limit reached (3/3 used today). Please try again tomorrow!",
      });
    }

    // Sanitize prompt against direct answer injection
    const promptLower = rawPrompt.toLowerCase();
    const isDirectAnswerDemand =
      promptLower.includes("give code") ||
      promptLower.includes("write full code") ||
      promptLower.includes("complete code for me") ||
      promptLower.includes("solve experiment");

    let responseText = "";

    if (isDirectAnswerDemand) {
      responseText = `💡 **AI Tutor Educational Guidance**\n\nI can help you understand the concepts, theory, and logic behind **${experimentTitle}**, but I cannot write the full solution code for you!\n\nHere is how you can approach it yourself:\n\n1. **Review Aim & Objective**: Understand what input data you are working with.\n2. **Break Down Logic**: Identify required functions, imports, or preprocessing steps.\n3. **Test Incrementally**: Use the Monaco code editor & execution terminal to test each function step-by-step.\n\nAsk me if you need help explaining specific errors, formulas, or algorithmic concepts!`;
    } else if (promptLower.includes("aim")) {
      responseText = `🎯 **Understanding the Aim of ${experimentTitle}**\n\n**Primary Objective**:\n${aim || "The objective of this lab experiment is to build, execute, and analyze key concepts and algorithms in " + experimentTitle + "."}\n\n**Key Takeaways**:\n- Understand the theoretical foundations and implementation pipeline.\n- Observe output metrics and evaluate system accuracy.\n- Practice debugging and code execution in ${codeLanguage}.`;
    } else if (promptLower.includes("theory")) {
      responseText = `📚 **Theoretical Foundation**\n\n**Experiment**: ${experimentTitle}\n\n**Core Concepts**:\n- **Domain Logic**: Modern computational models use structured pipelines to process input features, transform parameters, and derive predictions.\n- **Language/Framework**: ${codeLanguage} provides specialized libraries and mathematical operations optimized for performance.\n- **Performance Evaluation**: Results are verified by comparing actual execution output against baseline expected behavior.\n\n*Tip: Check the Procedure section to see the step-by-step workflow!*`;
    } else if (promptLower.includes("procedure")) {
      responseText = `⚙️ **Step-by-Step Procedure**\n\n${procedure || "1. Initialize environment and import required libraries.\n2. Prepare input data and define problem parameters.\n3. Implement core model/logic steps.\n4. Execute program and capture console output.\n5. Analyze results and verify correctness."}\n\n**Execution Checklist**:\n- Ensure all syntax is valid before running.\n- Inspect the output panel for any runtime warnings or errors.`;
    } else if (promptLower.includes("algorithm")) {
      responseText = `📝 **Algorithm & Logical Steps**\n\n1. **Initialization**: Set up necessary parameters and data structures.\n2. **Input Processing**: Read and clean incoming data/inputs.\n3. **Core Computation**: Apply formulas, loop transformations, or neural network layers.\n4. **Evaluation**: Compute output metrics and performance loss.\n5. **Return**: Format final results for display.`;
    } else if (promptLower.includes("output")) {
      responseText = `📊 **Output Interpretation**\n\n${output ? "Current Console Output:\n```\n" + output.slice(0, 250) + "\n```\n" : ""}\n**How to Verify Output**:\n- Look for expected values, loss values, or classification metrics.\n- Ensure no exceptions or tracebacks were produced.\n- Verify execution time and memory limits.`;
    } else if (promptLower.includes("error")) {
      responseText = `❌ **Common Errors & Debugging Hints**\n\n1. **SyntaxError / IndentationError**: Double-check colon placement and line indentation in ${codeLanguage}.\n2. **NameError / ImportError**: Verify that all required modules/variables are declared before invocation.\n3. **TypeError / Shape Mismatch**: Ensure array dimensions and variable types match expected parameters.\n4. **Execution Timeout**: Check for infinite loops or heavy computations.`;
    } else if (promptLower.includes("tensorflow") || promptLower.includes("model")) {
      responseText = `🤖 **TensorFlow & Deep Learning Workflow**\n\n- **Model Architecture**: Use Sequential or Functional API to stack Dense / Conv2D / Dropout layers.\n- **Compilation**: Specify optimizer (\`adam\`, \`sgd\`), loss function (\`categorical_crossentropy\`, \`mse\`), and tracking metrics.\n- **Training**: Execute \`model.fit()\` with specified epochs and batch size.\n- **Evaluation**: Use \`model.evaluate()\` or inspect loss curves to detect overfitting.`;
    } else if (promptLower.includes("hint")) {
      responseText = `💡 **Socratic Hint**\n\nFocus on the core logic: what transformation needs to happen to turn your input into the target output? Try printing intermediate values or breaking your code into smaller functions!`;
    } else {
      responseText = `💬 **AI Tutor Response**: ${rawPrompt}\n\n**Context**: ${experimentTitle}\n\nFor **${experimentTitle}**, keep in mind:\n- Ensure your Aim and Procedure match the required experimental workflow.\n- Check loop bounds and data types in ${codeLanguage}.\n- Use the execution terminal to test your logic incrementally.`;
    }

    const newUsageCount = incrementStudentAiUsage(studentId);
    const remaining = Math.max(0, AI_TUTOR_DAILY_LIMIT - newUsageCount);

    // Log request asynchronously if DB table is present
    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        await supabase.from("ai_tutor_logs").insert({
          student_id: studentId,
          experiment_id: expId,
          prompt: rawPrompt,
          created_at: new Date().toISOString(),
        }).catch(() => null);
      }
    } catch (_logErr) {
      /* non-blocking */
    }

    return safeSuccessResponse(res, "AI Tutor response generated", {
      answer: responseText,
      remainingRequests: remaining,
      totalLimit: AI_TUTOR_DAILY_LIMIT,
      limitReached: remaining === 0,
    });
  } catch (error) {
    console.error("POST /api/manual/ai-tutor error:", error);
    return safeErrorResponse(res, 500, "Failed to generate AI Tutor response", error?.message);
  }
});

module.exports = router;
