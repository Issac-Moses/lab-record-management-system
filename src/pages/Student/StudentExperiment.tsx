import { lazy, Suspense, useEffect, useState, useRef, FormEvent, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  FlaskConical,
  Save,
  ImagePlus,
  ArrowLeft,
  Code2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Lock,
  Check,
  Pencil,
  Paperclip,
  X,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import OutputPanel from "@/components/OutputPanel";
import { executeCode, ExecutionResult } from "@/services/dockerService";
import EmptyState from "@/components/ui/EmptyState";
import {
  getSelectedSubjectFromStorage,
  setSelectedSubjectInStorage,
  useSelectedSubject,
} from "@/context/SubjectContext";
// @ts-ignore – JS file without declaration file
import { getStatusConfig } from "@/utils/statusConfig";
import { useToast } from "@/components/ui/ToastProvider";
import useExperimentProgress from "@/hooks/useExperimentProgress";
import type { SectionKey } from "@/hooks/useExperimentProgress";
import ProgressRing from "@/components/experiment/ProgressRing";
import { evaluateSubmissionContent } from "@/utils/evaluationEngine";

const CodeEditor = lazy(() => import("@/components/CodeEditor"));
const AiTutorPanel = lazy(() => import("@/components/student/AiTutorPanel"));

const CODE_TEMPLATES: Record<string, string> = {
  python: "# Write your code here\nprint('Hello, World!')",
  javascript: "// Write your code here\nconsole.log('Hello, World!');",
  java: "public class Main {\n  public static void main(String[] args) {\n    System.out.println(\"Hello, World!\");\n  }\n}",
  go: "package main\n\nimport \"fmt\"\n\nfunc main() {\n\tfmt.Println(\"Hello, World!\")\n}",
  ruby: "# Write your code here\nputs \"Hello, World!\"",
  php: "<?php\n// Write your code here\necho \"Hello, World!\";\n",
  sql: "-- Write your SQL query here\nSELECT 'Hello, World!' AS message;",
  cpp: "#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << \"Hello, World!\" << endl;\n    return 0;\n}",
  c: "#include <stdio.h>\n\nint main() {\n    printf(\"Hello, World!\\n\");\n    return 0;\n}",
};
const DEFAULT_CODE_TEMPLATE = "# Write your code here\nprint('Hello, World!')";

const RUNNER_SUPPORTED_LANGUAGES = new Set([
  "python",
  "javascript",
  "java",
  "go",
  "ruby",
  "php",
  "sql",
  "c",
  "cpp",
]);
const SUBMISSIONS_LANGUAGE_COLUMN_CACHE_KEY = "submissions_has_language_column";
const VIVA_DRAFT_CACHE_PREFIX = "student_viva_draft";
const MANUAL_API_BASE_URL = import.meta.env.VITE_MANUAL_API_URL || "http://localhost:7001";
const MANUAL_API_AVAILABLE_CACHE_KEY = "manual_api_available_v1";
type ContentMode = "code" | "text" | "image" | "mixed" | "unknown";
const STUDENT_DATA_UPDATED_EVENT = "student-data-updated";

function getTemplate(language: string): string {
  return CODE_TEMPLATES[language] ?? DEFAULT_CODE_TEMPLATE;
}

function isMissingLanguageColumnError(error: unknown): boolean {
  const errorBlob = JSON.stringify(error || {}).toLowerCase();
  const message = (error as { message?: string } | null)?.message?.toLowerCase() || "";
  const combined = `${message} ${errorBlob}`;
  return (
    combined.includes("language") &&
    combined.includes("submissions") &&
    (combined.includes("column") || combined.includes("schema cache") || combined.includes("pgrst204"))
  );
}

function isMissingColumnError(error: unknown, columnName: string): boolean {
  const errorBlob = JSON.stringify(error || {}).toLowerCase();
  return errorBlob.includes(columnName.toLowerCase()) && errorBlob.includes("column");
}

function isOnConflictUnsupportedError(error: unknown): boolean {
  const errorBlob = JSON.stringify(error || {}).toLowerCase();
  return (
    errorBlob.includes("on_conflict") ||
    errorBlob.includes("no unique or exclusion constraint") ||
    errorBlob.includes("42p10")
  );
}

function isDuplicateKeyError(error: unknown): boolean {
  const errorBlob = JSON.stringify(error || {}).toLowerCase();
  return (
    errorBlob.includes("duplicate key") ||
    errorBlob.includes("23505") ||
    errorBlob.includes("unique constraint")
  );
}

function isNetworkRefusedError(error: unknown): boolean {
  const text = JSON.stringify(error || {}).toLowerCase();
  return text.includes("failed to fetch") || text.includes("err_connection_refused");
}

function mentionsFieldError(error: unknown, field: string): boolean {
  return JSON.stringify(error || {}).toLowerCase().includes(field.toLowerCase());
}

/** Only true when the browser cannot reach the API at all — not for HTTP 4xx/5xx or Docker errors. */
function isRunnerUnreachableError(errorMessage: string): boolean {
  const text = String(errorMessage || "").toLowerCase();
  return (
    text.includes("failed to fetch") ||
    text.includes("networkerror") ||
    text.includes("err_connection_refused") ||
    text.includes("load failed") ||
    text.includes("network request failed") ||
    text.includes("not running on localhost:7001")
  );
}

function isUuidLikeValue(value: string): boolean {
  const text = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text);
}

type SubmissionIdentity = {
  id: string | number | null;
  submissionUuid: string | null;
};

async function fetchSubmissionIdentity(
  studentId: string,
  subjectId: string,
  expId: string
): Promise<SubmissionIdentity> {
  const response = await supabase
    .from("submissions")
    .select("id")
    .eq("student_id", studentId)
    .eq("subject_id", subjectId)
    .eq("exp_id", expId)
    .maybeSingle();

  if (!response.error && response.data) {
    return {
      id: (response.data as any).id ?? null,
      submissionUuid: null,
    };
  }

  return { id: null, submissionUuid: null };
}

async function updateStudentExperimentAiAsync(params: {
  studentId: string;
  expId: string;
  aiMarks: number;
  breakdown: Record<string, number>;
}) {
  let payload: Record<string, unknown> = {
    ai_marks: params.aiMarks,
    breakdown: params.breakdown,
    updated_at: new Date().toISOString(),
  };

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await supabase
      .from("student_experiments")
      .update(payload)
      .eq("student_id", params.studentId)
      .eq("experiment_id", params.expId)
      .limit(1);

    if (!response.error) return;
    const responseError = response.error;

    if (
      Object.prototype.hasOwnProperty.call(payload, "ai_marks") &&
      (isMissingColumnError(responseError, "ai_marks") || mentionsFieldError(responseError, "ai_marks"))
    ) {
      delete payload.ai_marks;
      continue;
    }
    if (
      Object.prototype.hasOwnProperty.call(payload, "breakdown") &&
      (isMissingColumnError(responseError, "breakdown") || mentionsFieldError(responseError, "breakdown"))
    ) {
      delete payload.breakdown;
      continue;
    }
    if (
      Object.prototype.hasOwnProperty.call(payload, "updated_at") &&
      (isMissingColumnError(responseError, "updated_at") || mentionsFieldError(responseError, "updated_at"))
    ) {
      delete payload.updated_at;
      continue;
    }
    return;
  }
}

async function syncStudentExperimentStatusAsync(params: {
  studentId: string;
  expId: string;
  status: "draft" | "submitted";
}) {
  const payload: Record<string, unknown> = {
    status: params.status,
    updated_at: new Date().toISOString(),
  };
  if (params.status === "submitted") {
    payload.submitted_date = new Date().toISOString();
  }
  await supabase
    .from("student_experiments")
    .update(payload)
    .eq("student_id", params.studentId)
    .eq("experiment_id", params.expId);
}

async function persistAiEvaluationAsync(params: {
  studentId: string;
  subjectId: string;
  expId: string;
  submission: {
    aim: string;
    algorithm: string;
    program: string;
    output: string;
    result: string;
  };
  evaluationOverride?: {
    aiScore: number;
    confidence: number;
    status: string;
    breakdown: Record<string, number>;
  } | null;
}) {
  try {
    const identity = await fetchSubmissionIdentity(params.studentId, params.subjectId, params.expId);
    if (!identity.id && !identity.submissionUuid) return;

    const evaluated = params.evaluationOverride
      ? {
          aiScore: Number(params.evaluationOverride.aiScore || 0),
          confidence: Number(params.evaluationOverride.confidence || 0),
          status: String(params.evaluationOverride.status || ""),
          breakdown: params.evaluationOverride.breakdown || {},
        }
      : evaluateSubmissionContent({
          ...params.submission,
          experimentId: params.expId,
          autoGenerateIfEmpty: true,
        });

    await updateStudentExperimentAiAsync({
      studentId: params.studentId,
      expId: params.expId,
      aiMarks: Number((evaluated as any).marksOutOf10 || 0),
      breakdown: evaluated.breakdown,
    });

    let payload: Record<string, unknown> = {
      submission_id: identity.id,
      submission_uuid: identity.submissionUuid,
      ai_score: evaluated.aiScore,
      predicted_score: evaluated.aiScore,
      confidence: evaluated.confidence,
      status: evaluated.status,
      breakdown: evaluated.breakdown,
      updated_at: new Date().toISOString(),
    };

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const updatePayload = { ...payload };
      delete updatePayload.submission_id;
      delete updatePayload.submission_uuid;
      const updateResponse = identity.id
        ? await supabase
            .from("ai_evaluations")
            .update(updatePayload)
            .eq("submission_id", identity.id)
            .select("id")
            .limit(1)
        : identity.submissionUuid
          ? await supabase
              .from("ai_evaluations")
              .update(updatePayload)
              .eq("submission_uuid", identity.submissionUuid)
              .select("id")
              .limit(1)
          : { error: null as any, data: [] as any[] };

      if (!updateResponse.error && Array.isArray(updateResponse.data) && updateResponse.data.length > 0) {
        return;
      }

      const insertResponse = await supabase.from("ai_evaluations").insert(payload);
      if (!insertResponse.error) return;

      const responseError = insertResponse.error;
        if (
          Object.prototype.hasOwnProperty.call(payload, "submission_id") &&
          (isMissingColumnError(responseError, "submission_id") || mentionsFieldError(responseError, "submission_id"))
        ) {
          delete payload.submission_id;
          continue;
        }
        if (
          Object.prototype.hasOwnProperty.call(payload, "submission_uuid") &&
          (isMissingColumnError(responseError, "submission_uuid") || mentionsFieldError(responseError, "submission_uuid"))
        ) {
          delete payload.submission_uuid;
          continue;
        }
        if (
          Object.prototype.hasOwnProperty.call(payload, "predicted_score") &&
          (isMissingColumnError(responseError, "predicted_score") || mentionsFieldError(responseError, "predicted_score"))
        ) {
          delete payload.predicted_score;
          continue;
        }
        if (
          Object.prototype.hasOwnProperty.call(payload, "confidence") &&
          (isMissingColumnError(responseError, "confidence") || mentionsFieldError(responseError, "confidence"))
        ) {
          delete payload.confidence;
          continue;
        }
        if (
          Object.prototype.hasOwnProperty.call(payload, "status") &&
          (isMissingColumnError(responseError, "status") || mentionsFieldError(responseError, "status"))
        ) {
          delete payload.status;
          continue;
        }
        if (
          Object.prototype.hasOwnProperty.call(payload, "breakdown") &&
          (isMissingColumnError(responseError, "breakdown") || mentionsFieldError(responseError, "breakdown"))
        ) {
          delete payload.breakdown;
          continue;
        }
        if (
          Object.prototype.hasOwnProperty.call(payload, "updated_at") &&
          (isMissingColumnError(responseError, "updated_at") || mentionsFieldError(responseError, "updated_at"))
        ) {
          delete payload.updated_at;
          continue;
        }
      if (isDuplicateKeyError(responseError)) return;
      return;
    }
  } catch {
    // Non-blocking by design.
  }
}

function getCachedLanguageColumnAvailability(): boolean {
  return localStorage.getItem(SUBMISSIONS_LANGUAGE_COLUMN_CACHE_KEY) !== "false";
}

function getVivaDraftCacheKey(userId: string, subjectId: string, expId: string): string {
  return `${VIVA_DRAFT_CACHE_PREFIX}:${userId}:${subjectId}:${expId}`;
}

function readVivaDraftCache(userId: string, subjectId: string, expId: string): string[] {
  try {
    const raw = localStorage.getItem(getVivaDraftCacheKey(userId, subjectId, expId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((value) => String(value || ""));
  } catch {
    return [];
  }
}

function writeVivaDraftCache(
  userId: string,
  subjectId: string,
  expId: string,
  answers: string[]
) {
  try {
    localStorage.setItem(
      getVivaDraftCacheKey(userId, subjectId, expId),
      JSON.stringify((answers || []).map((value) => String(value || "")))
    );
  } catch {
    // Ignore quota/storage failures; DB save still proceeds.
  }
}

function clearVivaDraftCache(userId: string, subjectId: string, expId: string) {
  try {
    localStorage.removeItem(getVivaDraftCacheKey(userId, subjectId, expId));
  } catch {
    // Ignore cache cleanup failures.
  }
}

export default function StudentExperiment() {
  const STUDENT_EXPERIMENT_ERROR =
    "Unable to load this experiment right now. Please try again.";
  const STUDENT_SAVE_ERROR =
    "We could not save your work right now. Please try again.";
  const STUDENT_RUN_ERROR =
    "Code run is currently unavailable. Please try again.";
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isReadOnly = searchParams.get("readonly") === "1";
  const toast = useToast();
  const { selectedSubjectId } = useSelectedSubject();
  const querySubjectId = searchParams.get("subject");
  const subjectId =
    selectedSubjectId ||
    querySubjectId ||
    localStorage.getItem("student_subject_id");
  const routeExpId = id ? String(id) : "";
  const [resolvedExpId, setResolvedExpId] = useState(routeExpId);
  const expId = resolvedExpId || routeExpId;

  const [experimentNo, setExperimentNo] = useState("");
  const [experimentTitle, setExperimentTitle] = useState("Untitled Experiment");
  const [aim, setAim] = useState("");
  const [procedure, setProcedure] = useState("");
  const [output, setOutput] = useState("");
  const [result, setResult] = useState("");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [codeLanguage, setCodeLanguage] = useState("python");
  const [codeValue, setCodeValue] = useState(getTemplate("python"));
  const [customInput, setCustomInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [codeOutput, setCodeOutput] = useState("");
  const [codeError, setCodeError] = useState("");
  const [executionTime, setExecutionTime] = useState<number | undefined>();
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [canUseLanguageColumn, setCanUseLanguageColumn] = useState<boolean>(
    getCachedLanguageColumnAvailability
  );
  const [manualApiAvailable, setManualApiAvailable] = useState<boolean>(
    () => localStorage.getItem(MANUAL_API_AVAILABLE_CACHE_KEY) !== "false"
  );

  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState("draft");

  const [outputImages, setOutputImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [attachmentDataUrls, setAttachmentDataUrls] = useState<string[]>([]);
  const [isDropHover, setIsDropHover] = useState(false);
  const [uploadHint, setUploadHint] = useState("");
  const [isAttachmentPanelOpen, setIsAttachmentPanelOpen] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [submittedCard, setSubmittedCard] = useState(false);
  const [vivaQuestions, setVivaQuestions] = useState<string[]>([]);
  const [vivaAnswers, setVivaAnswers] = useState<string[]>([]);
  const [contentMode, setContentMode] = useState<ContentMode>("unknown");
  const [treatTemplateDefaultsAsEmpty, setTreatTemplateDefaultsAsEmpty] = useState(false);
  const [templateDefaults, setTemplateDefaults] = useState({
    aim: "",
    procedure: "",
    result: "",
  });

  const sectionRefs = useRef<Record<SectionKey, HTMLDivElement | null>>({
    aim: null,
    procedure: null,
    code: null,
    output: null,
    result: null,
    viva: null,
  });
  const userScrollingRef = useRef(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!querySubjectId) return;
    const name = getSelectedSubjectFromStorage().subjectName || "";
    setSelectedSubjectInStorage(querySubjectId, name);
  }, [querySubjectId]);

  const markLanguageColumnUnavailable = useCallback(() => {
    setCanUseLanguageColumn(false);
    localStorage.setItem(SUBMISSIONS_LANGUAGE_COLUMN_CACHE_KEY, "false");
  }, []);

  // Revoke object URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      imagePreviews.forEach((url) => {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      });
    };
  }, [imagePreviews]);

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read attachment"));
      reader.readAsDataURL(file);
    });

  if (!subjectId) {
    return (
      <div className="faculty-bg-vibrant min-h-screen px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto w-full max-w-[1380px]">
        <EmptyState
          message="Select subject first"
          description="Go back to subjects to pick one."
          action={{ label: "Select Subject", onClick: () => navigate("/student/subjects") }}
        />
        </div>
      </div>
    );
  }

  // Helper function to detect programming language from code
  const detectLanguage = (code: string): string => {
    if (!code) return "";

    const hasInclude = code.includes("#include");
    const hasPrintf = code.includes("printf(");
    const hasCout = code.includes("cout") || code.includes("std::");
    const hasPrint = code.includes("print(");
    const hasConsoleLog = code.includes("console.log");
    const hasRequire = code.includes("require(");
    const hasPublicClass = code.includes("public class");
    const hasSystemOut = code.includes("system.out.println");
    const hasGoPackageMain = code.includes("package main");
    const hasGoFuncMain = code.includes("func main()");
    const hasFmtPrintln = code.includes("fmt.Println");
    const hasRubyPuts = code.includes("puts ");
    const hasRubyEnd = code.includes("\nend") || code.trim().endsWith("end");
    const hasPhpTag = code.includes("<?php");
    const hasPhpEcho = code.includes("echo ");
    const hasSqlKeywords = /\b(select|insert|update|delete|create|alter|drop)\b/i.test(code);
    const hasSqlSemicolon = code.includes(";");

    // Go: Common package/function markers
    if (hasGoPackageMain || hasGoFuncMain || hasFmtPrintln) {
      return "go";
    }

    // PHP: Opening tag / echo usage
    if (hasPhpTag || hasPhpEcho) {
      return "php";
    }

    // C++: Contains #include or printf() AND contains cout or std::
    if ((hasInclude || hasPrintf) && hasCout) {
      return "cpp";
    }

    // C: Contains #include or printf() but NOT cout or std::
    if ((hasInclude || hasPrintf) && !hasCout) {
      return "c";
    }

    // JavaScript: Contains console.log or require(
    if (hasConsoleLog || hasRequire) {
      return "javascript";
    }

    // Python: Contains print( but NOT console.log
    if (hasPrint && !hasConsoleLog) {
      return "python";
    }

    // Java: Contains public class or system.out.println
    if (hasPublicClass || hasSystemOut) {
      return "java";
    }

    // Ruby: Common output + block terminator patterns
    if (hasRubyPuts || hasRubyEnd) {
      return "ruby";
    }

    // SQL: query-heavy content with statement terminator
    if (hasSqlKeywords && hasSqlSemicolon) {
      return "sql";
    }

    // Fallback: return empty string to use current selection
    return "";
  };

  const normalizeContentMode = (value: string): ContentMode => {
    const mode = String(value || "").toLowerCase();
    if (mode === "code" || mode === "text" || mode === "image" || mode === "mixed") {
      return mode;
    }
    return "unknown";
  };

  /* ================= AUTH + LOAD ================= */
  const loadData = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate("/login");
        return;
      }

      if (!expId || !subjectId) return;

      const user = data.session.user;

      let expNoValue = "";
      let expTitleValue = "Untitled Experiment";
      let templatePrefill: {
        aim: string;
        procedure: string;
        source_code: string;
        result: string;
        viva: string[];
      } = {
        aim: "",
        procedure: "",
        source_code: "",
        result: "",
        viva: [],
      };
      let resolvedSubjectId = String(subjectId || "").trim();
      let effectiveExpId = String(routeExpId || "").trim();
      let legacyExperiment:
        | { data: Record<string, unknown> | null; error: unknown }
        | { data: any; error: any } = { data: null, error: null };

      if (isUuidLikeValue(effectiveExpId)) {
        const submissionIdentity = await supabase
          .from("submissions")
          .select("exp_id, subject_id")
          .eq("id", effectiveExpId)
          .eq("student_id", user.id)
          .maybeSingle();

        if (!submissionIdentity.error && submissionIdentity.data?.exp_id) {
          effectiveExpId = String(submissionIdentity.data.exp_id);
          resolvedSubjectId = String(submissionIdentity.data.subject_id || resolvedSubjectId);
        } else {
          const fullRowIdentity = await supabase
            .from("full_student_data")
            .select("experiment_id,exp_id,subject_id")
            .eq("id", effectiveExpId)
            .eq("student_id", user.id)
            .maybeSingle();
          if (!fullRowIdentity.error && fullRowIdentity.data) {
            const maybeExpId = String(
              (fullRowIdentity.data as Record<string, unknown>)?.experiment_id ||
                (fullRowIdentity.data as Record<string, unknown>)?.exp_id ||
                ""
            ).trim();
            if (maybeExpId) effectiveExpId = maybeExpId;
            const maybeSubjectId = String(
              (fullRowIdentity.data as Record<string, unknown>)?.subject_id || resolvedSubjectId
            ).trim();
            if (maybeSubjectId) resolvedSubjectId = maybeSubjectId;
          }
        }
      }

      legacyExperiment = await supabase
        .from("experiments")
        .select("*")
        .eq("id", effectiveExpId)
        .eq("subject_id", resolvedSubjectId || subjectId)
        .maybeSingle();

      if (legacyExperiment.error || !legacyExperiment.data) {
        const byIdOnly = await supabase
          .from("experiments")
          .select("*")
          .eq("id", effectiveExpId)
          .maybeSingle();

        if (!byIdOnly.error && byIdOnly.data) {
          legacyExperiment = {
            ...legacyExperiment,
            error: null,
            data: byIdOnly.data,
          } as typeof legacyExperiment;
          resolvedSubjectId = String((byIdOnly.data as Record<string, unknown>)?.subject_id || subjectId || "");
          localStorage.setItem("student_subject_id", resolvedSubjectId);
        } else {
          // Robust fallback query selecting standard basic columns
          const basicExp = await supabase
            .from("experiments")
            .select("id, title, experiment_no")
            .eq("id", effectiveExpId)
            .maybeSingle();
          if (!basicExp.error && basicExp.data) {
            legacyExperiment = {
              ...legacyExperiment,
              error: null,
              data: basicExp.data,
            } as typeof legacyExperiment;
          }
        }
      }

      if (!legacyExperiment.error && legacyExperiment.data) {
        expNoValue = String(legacyExperiment.data?.experiment_no || legacyExperiment.data?.experiment_number || "");
        expTitleValue = String(legacyExperiment.data?.title || "Untitled Experiment");
        const rawDue = (legacyExperiment.data as any)?.due_date || (legacyExperiment.data as any)?.deadline_date || (legacyExperiment.data as any)?.due_date_time || null;
        setDueDate(rawDue ? String(rawDue) : null);
      } else {
        // Soft fallback: derive experiment details from route/params instead of crashing page
        expNoValue = String(expId || "");
        expTitleValue = "Experiment Workspace";
        setDueDate(null);
      }

      setResolvedExpId(effectiveExpId);
      setExperimentNo(expNoValue);
      setExperimentTitle(expTitleValue);

      try {
        if (manualApiAvailable) {
          const metaResponse = await fetch(
            `${MANUAL_API_BASE_URL}/api/manual/experiment-meta/${resolvedSubjectId || subjectId}/${effectiveExpId}`,
            {
              headers: {
                Authorization: `Bearer ${data.session.access_token}`,
              },
            }
          );

          if (metaResponse.ok) {
            const metaPayload = await metaResponse.json();
            const mode = normalizeContentMode(metaPayload?.data?.content_type || "");
            const template = metaPayload?.data?.template || {};
            const questions = Array.isArray(template?.viva) ? template.viva : [];

            templatePrefill = {
              aim: String(template?.aim || ""),
              procedure: String(template?.procedure || ""),
              source_code: String(template?.source_code || ""),
              result: String(template?.result || ""),
              viva: questions,
            };

            setContentMode(mode);
            setVivaQuestions(questions);
            setVivaAnswers((prev) => questions.map((_: string, index: number) => prev[index] || ""));
          } else {
            const vivaResponse = await fetch(
              `${MANUAL_API_BASE_URL}/api/manual/viva/${resolvedSubjectId || subjectId}/${effectiveExpId}`,
              {
                headers: {
                  Authorization: `Bearer ${data.session.access_token}`,
                },
              }
            );
            if (vivaResponse.ok) {
              const vivaPayload = await vivaResponse.json();
              const questions = Array.isArray(vivaPayload?.data?.questions)
                ? vivaPayload.data.questions
                : [];
              setVivaQuestions(questions);
              setVivaAnswers((prev) => questions.map((_: string, index: number) => prev[index] || ""));
            } else {
              setVivaQuestions([]);
              setVivaAnswers([]);
            }
            setContentMode("unknown");
          }
        } else {
          setContentMode("unknown");
          setVivaQuestions([]);
          setVivaAnswers([]);
        }
      } catch (networkError) {
        if (isNetworkRefusedError(networkError)) {
          setManualApiAvailable(false);
          localStorage.setItem(MANUAL_API_AVAILABLE_CACHE_KEY, "false");
        }
        setVivaQuestions([]);
        setVivaAnswers([]);
        setContentMode("unknown");
      }

      const { data: existing } = await supabase
        .from("submissions")
        .select("id")
        .eq("student_id", user.id)
        .eq("subject_id", resolvedSubjectId || subjectId)
        .eq("exp_id", effectiveExpId)
        .maybeSingle();

      if (!existing) {
        await supabase.from("submissions").insert({
          student_id: user.id,
          subject_id: resolvedSubjectId || subjectId,
          exp_id: effectiveExpId,
          status: "draft",
          updated_at: new Date().toISOString(),
        });
      }

      let submissionData: {
        aim?: string | null;
        procedure?: string | null;
        algorithm?: string | null;
        program?: string | null;
        source_code?: string | null;
        output?: string | null;
        result?: string | null;
        language?: string | null;
        viva_answers?: string[] | null;
        attachments?: string[] | null;
        images?: string[] | null;
        [key: string]: unknown;
      } | null = null;

      const fullSubmissionResponse = await supabase
        .from("submissions")
        .select("*")
        .eq("student_id", user.id)
        .eq("subject_id", resolvedSubjectId || subjectId)
        .eq("exp_id", effectiveExpId)
        .maybeSingle();

      if (fullSubmissionResponse.error) {
        console.warn("fullSubmissionResponse error, using default template:", fullSubmissionResponse.error);
        submissionData = null;
      }
      submissionData = fullSubmissionResponse.data;

      if (submissionData) {
        const savedAim = String(submissionData.aim || "").trim();
        const savedProcedure = String(submissionData.procedure || submissionData.algorithm || "").trim();
        const savedProgram = String(submissionData.program || submissionData.source_code || "").trim();
        const savedOutput = String(submissionData.output || "").trim();
        const savedResult = String(submissionData.result || "").trim();
        const templateAim = String(templatePrefill.aim || "").trim();
        const templateProcedure = String(templatePrefill.procedure || "").trim();
        const templateSourceCode = String(templatePrefill.source_code || "").trim();
        const templateResult = String(templatePrefill.result || "").trim();
        const isAimTemplateDefault =
          savedAim.length > 0 && templateAim.length > 0 && savedAim === templateAim;
        const isProcedureTemplateDefault =
          savedProcedure.length > 0 &&
          templateProcedure.length > 0 &&
          savedProcedure === templateProcedure;
        const isCodeTemplateDefault =
          savedProgram.length > 0 &&
          ((templateSourceCode.length > 0 && savedProgram === templateSourceCode) ||
            Object.values(CODE_TEMPLATES).some((template) => savedProgram === template.trim()));
        const isResultTemplateDefault =
          savedResult.length > 0 && templateResult.length > 0 && savedResult === templateResult;

        const hasSavedContent =
          (savedAim.length > 0 && !isAimTemplateDefault) ||
          (savedProcedure.length > 0 && !isProcedureTemplateDefault) ||
          (savedProgram.length > 0 && !isCodeTemplateDefault) ||
          savedOutput.length > 0 ||
          (savedResult.length > 0 && !isResultTemplateDefault) ||
          (Array.isArray(submissionData.viva_answers) &&
            submissionData.viva_answers.some((value) => String(value || "").trim().length > 0)) ||
          (Array.isArray(submissionData.attachments) &&
            submissionData.attachments.some((value) => String(value || "").trim().length > 0)) ||
          (Array.isArray(submissionData.images) &&
            submissionData.images.some((value) => String(value || "").trim().length > 0));

        setTemplateDefaults({
          aim: String(templatePrefill.aim || ""),
          procedure: String(templatePrefill.procedure || ""),
          result: String(templatePrefill.result || ""),
        });
        setTreatTemplateDefaultsAsEmpty(!hasSavedContent);

        const seededCode = String(
          submissionData.program || submissionData.source_code || templatePrefill.source_code || ""
        );
        const autoDetectedLanguage = detectLanguage(seededCode);
        const savedLanguage = String(
          submissionData.language || autoDetectedLanguage || "python"
        ).toLowerCase();

        setAim(submissionData.aim || templatePrefill.aim || "");
        setProcedure(submissionData.procedure || submissionData.algorithm || templatePrefill.procedure || "");
        setCodeLanguage(savedLanguage);
        setCodeValue(seededCode || getTemplate(savedLanguage));
        setOutput(submissionData.output || "");
        setResult(submissionData.result || templatePrefill.result || "");
        const savedVivaAnswers = Array.isArray(submissionData.viva_answers)
          ? submissionData.viva_answers.map((value) => String(value || ""))
          : [];
        const cachedVivaAnswers = readVivaDraftCache(user.id, resolvedSubjectId || subjectId, effectiveExpId);
        const resolvedVivaAnswers =
          savedVivaAnswers.some((value) => value.trim().length > 0)
            ? savedVivaAnswers
            : cachedVivaAnswers;
        if (resolvedVivaAnswers.length > 0) {
          setVivaAnswers((prev) =>
            Array.from(
              { length: Math.max(vivaQuestions.length, resolvedVivaAnswers.length, prev.length) },
              (_, index) => resolvedVivaAnswers[index] || prev[index] || ""
            )
          );
          writeVivaDraftCache(user.id, resolvedSubjectId || subjectId, effectiveExpId, resolvedVivaAnswers);
        }
        const savedAttachments = Array.isArray(submissionData.attachments)
          ? submissionData.attachments
          : Array.isArray(submissionData.images)
            ? submissionData.images
            : [];
        const normalizedAttachments = savedAttachments
          .map((value) => String(value || "").trim())
          .filter(Boolean);
        setAttachmentDataUrls(normalizedAttachments);
        setCurrentStatus(String((submissionData as any).status || "draft"));

        const savedExecData = (submissionData as any).execution_data || (submissionData as any).execution_log;
        if (savedExecData) {
          try {
            const parsedExec = typeof savedExecData === "string" ? JSON.parse(savedExecData) : savedExecData;
            if (parsedExec && typeof parsedExec === "object") {
              setExecutionResult(parsedExec as ExecutionResult);
            }
          } catch (_e) {
            // Ignore parse errors on legacy submissions
          }
        }
      } else {
        setTemplateDefaults({
          aim: String(templatePrefill.aim || ""),
          procedure: String(templatePrefill.procedure || ""),
          result: String(templatePrefill.result || ""),
        });
        setTreatTemplateDefaultsAsEmpty(true);

        const seededCode = String(templatePrefill.source_code || "");
        const detectedLanguage = detectLanguage(seededCode) || "python";
        setAim(templatePrefill.aim || "");
        setProcedure(templatePrefill.procedure || "");
        setCodeLanguage(detectedLanguage);
        setCodeValue(seededCode || getTemplate(detectedLanguage));
        setOutput("");
        setResult(templatePrefill.result || "");
        setAttachmentDataUrls([]);
        setCurrentStatus("draft");
      }
    } catch (err) {
      setError(STUDENT_EXPERIMENT_ERROR);
    }
  }, [expId, subjectId, navigate, canUseLanguageColumn, manualApiAvailable, markLanguageColumnUnavailable]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const effectiveContentMode = useMemo<ContentMode>(() => {
    // 1. Explicit faculty template format selection has HIGHEST priority
    if (contentMode !== "unknown") return contentMode;

    // 2. Heuristic fallback for unconfigured experiments
    const blob = `${experimentTitle} ${aim} ${procedure}`.toLowerCase();
    const nonCodingPattern =
      /virtuali[sz]ation|virtual\s*lab|vmware|virtualbox|oracle\s*vm|packet\s*tracer|wireshark|nmap|kali|metasploit|burp|forensic|cyber|network\s*security|power\s*bi|tableau|excel|dashboard|uml|staruml|draw\.?io|er\s*diagram|ui\/ux|prototype/;

    if (nonCodingPattern.test(blob)) return "image";
    return "mixed";
  }, [contentMode, experimentTitle, aim, procedure]);

  const showCodeSections =
    effectiveContentMode === "code" || effectiveContentMode === "mixed";

  useEffect(() => {
    if (!subjectId || !expId || submittedCard) return;
    const normalizedAim =
      treatTemplateDefaultsAsEmpty &&
      templateDefaults.aim.trim().length > 0 &&
      aim.trim() === templateDefaults.aim.trim()
        ? ""
        : aim;
    const normalizedProcedure =
      treatTemplateDefaultsAsEmpty &&
      templateDefaults.procedure.trim().length > 0 &&
      procedure.trim() === templateDefaults.procedure.trim()
        ? ""
        : procedure;
    const normalizedResult =
      treatTemplateDefaultsAsEmpty &&
      templateDefaults.result.trim().length > 0 &&
      result.trim() === templateDefaults.result.trim()
        ? ""
        : result;
    const normalizedCode =
      showCodeSections && codeValue.trim() === getTemplate(codeLanguage).trim()
        ? ""
        : codeValue;

    const hasAnyInput =
      normalizedAim.trim().length > 0 ||
      normalizedProcedure.trim().length > 0 ||
      normalizedCode.trim().length > 0 ||
      output.trim().length > 0 ||
      normalizedResult.trim().length > 0 ||
      attachmentDataUrls.length > 0 ||
      imagePreviews.length > 0 ||
      outputImages.length > 0 ||
      vivaAnswers.some((item) => String(item || "").trim().length > 0);
    if (!hasAnyInput) return;

    const timer = window.setInterval(async () => {
      setIsAutoSaving(true);
      await upsertSubmission("draft");
      setIsAutoSaving(false);
    }, 30000);

    return () => window.clearInterval(timer);
  }, [
    subjectId,
    expId,
    submittedCard,
    aim,
    procedure,
    codeValue,
    output,
    result,
    attachmentDataUrls,
    vivaAnswers,
    treatTemplateDefaultsAsEmpty,
    templateDefaults.aim,
    templateDefaults.procedure,
    templateDefaults.result,
    showCodeSections,
    codeLanguage,
  ]);

  /* ================= RUN CODE ================= */
  const handleRunCode = async () => {
    setIsRunning(true);
    setCodeOutput("");
    setCodeError("");
    setExecutionTime(undefined);
    setExecutionResult(null);

    try {
      const languageToUse = codeLanguage;
      if (!RUNNER_SUPPORTED_LANGUAGES.has(languageToUse)) {
        setCodeError("This language cannot be run here.");
        return;
      }

      const startedAt = Date.now();
      const runResult = await executeCode(languageToUse, codeValue, customInput);
      const elapsed = Date.now() - startedAt;
      const minSpinner = 750;
      if (elapsed < minSpinner) {
        await new Promise((resolve) => window.setTimeout(resolve, minSpinner - elapsed));
      }

      setExecutionTime(Math.max(elapsed, minSpinner));
      setExecutionResult(runResult);

      if (runResult.error) {
        if (isRunnerUnreachableError(runResult.error)) {
          setCodeOutput("");
          setCodeError(
            `Cannot reach the code runner at ${MANUAL_API_BASE_URL}. Start the API (npm run backend:start), ensure Docker is running, and check VITE_MANUAL_API_URL.`
          );
        } else {
          setCodeError(runResult.error);
        }
      } else {
        setCodeOutput(runResult.output || "");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : STUDENT_RUN_ERROR;
      if (isRunnerUnreachableError(message)) {
        setCodeOutput("");
        setCodeError(
          `Cannot reach the code runner at ${MANUAL_API_BASE_URL}. Start the API (npm run backend:start), ensure Docker is running, and check VITE_MANUAL_API_URL.`
        );
      } else {
        setCodeError(message || STUDENT_RUN_ERROR);
      }
    } finally {
      setIsRunning(false);
    }
  };

  /* ================= SECURITY ================= */
  /* ================= SECURITY ================= */
  /* ================= IMAGE & ATTACHMENT ================= */
  const MAX_ATTACHMENTS = 23;

  const removeAttachment = useCallback((index: number) => {
    setAttachmentDataUrls((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => {
      const removed = prev[index];
      if (removed && removed.startsWith("blob:")) {
        URL.revokeObjectURL(removed);
      }
      return prev.filter((_, i) => i !== index);
    });
    setOutputImages((prev) => prev.filter((_, i) => i !== index));
    setUploadHint("");
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement> | { target: { files: FileList | File[] } }) => {
    const files = e.target.files;
    if (!files) return;
    const arr = Array.from(files).slice(0, MAX_ATTACHMENTS);
    const imageFiles = arr.filter((file) => String(file.type || "").startsWith("image/"));
    const pdfFiles = arr.filter((file) => {
      const type = String(file.type || "").toLowerCase();
      const name = String(file.name || "").toLowerCase();
      return type === "application/pdf" || name.endsWith(".pdf");
    });

    setOutputImages(imageFiles);
    try {
      const encoded = await Promise.all(arr.map((file) => fileToDataUrl(file)));
      setAttachmentDataUrls(encoded.filter(Boolean));
    } catch {
      setAttachmentDataUrls([]);
      setUploadHint("Unable to encode selected screenshots. Please try again.");
      return;
    }
    setImagePreviews((prev) => {
      prev.forEach((url) => {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      });
      return imageFiles.map((f) => URL.createObjectURL(f));
    });
    if (pdfFiles.length > 0) {
      const { parsePDF } = await import("@/utils/pdfParser");
      const parsedSections = [];
      for (const pdfFile of pdfFiles) {
        try {
          const parsed = await parsePDF(pdfFile);
          parsedSections.push(parsed);
        } catch (_error) {
          // Ignore individual PDF parse failure and continue.
        }
      }
      if (parsedSections.length > 0) {
        const merged = parsedSections.reduce(
          (acc, item) => ({
            aim: acc.aim || String(item.aim || ""),
            procedure: acc.procedure || String(item.procedure || ""),
            program: acc.program || String(item.program || ""),
            output: acc.output || String(item.output || ""),
            result: acc.result || String(item.result || ""),
          }),
          { aim: "", procedure: "", program: "", output: "", result: "" }
        );

        if (merged.aim && !String(aim || "").trim()) setAim(merged.aim);
        if (merged.procedure && !String(procedure || "").trim()) setProcedure(merged.procedure);
        if (merged.program && !String(codeValue || "").trim()) setCodeValue(merged.program);
        if (merged.output && !String(output || "").trim()) setOutput(merged.output);
        if (merged.result && !String(result || "").trim()) setResult(merged.result);
      }
    }

    const summaryParts = [];
    if (imageFiles.length > 0) summaryParts.push(`${imageFiles.length} image(s)`);
    if (pdfFiles.length > 0) summaryParts.push(`${pdfFiles.length} PDF(s) parsed`);
    setUploadHint(summaryParts.length > 0 ? `${summaryParts.join(" + ")} selected.` : "Attachments selected.");
  };

  async function upsertSubmission(status: "draft" | "submitted"): Promise<boolean> {
    setLoading(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Please login again to continue.");
        setLoading(false);
        return false;
      }

      if (!subjectId) {
        setError("Please select a subject first.");
        setLoading(false);
        return false;
      }

      if (!expId) {
        setError("Please select an experiment first.");
        setLoading(false);
        return false;
      }

      const executionPayload = executionResult
        ? {
            success: executionResult.success,
            stdout: executionResult.stdout || executionResult.output || "",
            stderr: executionResult.stderr || executionResult.error || "",
            error: executionResult.error || null,
            executionTime: executionResult.executionTime || 0,
            memory: executionResult.memory || "32 MB",
            exitCode: executionResult.exitCode ?? 0,
            language: executionResult.language || codeLanguage,
            artifacts: executionResult.artifacts || [],
            timestamp: new Date().toISOString(),
          }
        : null;

      const basePayload = {
        student_id: user.id,
        subject_id: subjectId,
        exp_id: expId,
        aim,
        procedure,
        algorithm: procedure,
        program: showCodeSections ? codeValue : "",
        output,
        result,
        status,
        updated_at: new Date().toISOString(),
        viva_answers: vivaAnswers.map((answer) => String(answer || "").trim()),
        attachments: attachmentDataUrls,
        images: attachmentDataUrls,
        execution_data: executionPayload,
        execution_log: executionPayload ? JSON.stringify(executionPayload) : null,
      };
      const normalizedVivaAnswers = vivaAnswers.map((answer) => String(answer || "").trim());
      writeVivaDraftCache(user.id, subjectId, expId, normalizedVivaAnswers);

      let upsertError: { message: string } | null = null;
      let payloadToSave: Record<string, unknown> = canUseLanguageColumn
        ? { ...basePayload, language: codeLanguage }
        : { ...basePayload };

      for (let attempt = 0; attempt < 8; attempt += 1) {
        const updatePayload = { ...payloadToSave };
        delete updatePayload.student_id;
        delete updatePayload.subject_id;
        delete updatePayload.exp_id;
        const updateResponse = await supabase
          .from("submissions")
          .update(updatePayload)
          .eq("student_id", user.id)
          .eq("subject_id", subjectId)
          .eq("exp_id", expId)
          .select("id")
          .limit(1);

        if (!updateResponse.error && Array.isArray(updateResponse.data) && updateResponse.data.length > 0) {
          upsertError = null;
          break;
        }

        const insertResponse = await supabase.from("submissions").insert(payloadToSave);
        if (!insertResponse.error) {
          upsertError = null;
          break;
        }

        upsertError = insertResponse.error;
        if (
          Object.prototype.hasOwnProperty.call(payloadToSave, "language") &&
          (isMissingLanguageColumnError(upsertError) || mentionsFieldError(upsertError, "language"))
        ) {
          markLanguageColumnUnavailable();
          delete payloadToSave.language;
          continue;
        }
        if (
          Object.prototype.hasOwnProperty.call(payloadToSave, "program") &&
          (isMissingColumnError(upsertError, "program") || mentionsFieldError(upsertError, "program"))
        ) {
          payloadToSave.source_code = payloadToSave.program;
          delete payloadToSave.program;
          continue;
        }
        if (
          Object.prototype.hasOwnProperty.call(payloadToSave, "procedure") &&
          (isMissingColumnError(upsertError, "procedure") || mentionsFieldError(upsertError, "procedure"))
        ) {
          payloadToSave.algorithm = payloadToSave.procedure;
          delete payloadToSave.procedure;
          continue;
        }
        if (
          Object.prototype.hasOwnProperty.call(payloadToSave, "algorithm") &&
          (isMissingColumnError(upsertError, "algorithm") || mentionsFieldError(upsertError, "algorithm"))
        ) {
          delete payloadToSave.algorithm;
          continue;
        }
        if (
          Object.prototype.hasOwnProperty.call(payloadToSave, "viva_answers") &&
          (isMissingColumnError(upsertError, "viva_answers") || mentionsFieldError(upsertError, "viva_answers"))
        ) {
          delete payloadToSave.viva_answers;
          continue;
        }
        if (
          Object.prototype.hasOwnProperty.call(payloadToSave, "attachments") &&
          (isMissingColumnError(upsertError, "attachments") || mentionsFieldError(upsertError, "attachments"))
        ) {
          delete payloadToSave.attachments;
          continue;
        }
        if (
          Object.prototype.hasOwnProperty.call(payloadToSave, "execution_data") &&
          (isMissingColumnError(upsertError, "execution_data") || mentionsFieldError(upsertError, "execution_data"))
        ) {
          console.warn("[Submission] DB missing 'execution_data' column. Retrying with execution_log fallback.");
          delete payloadToSave.execution_data;
          continue;
        }
        if (
          Object.prototype.hasOwnProperty.call(payloadToSave, "execution_log") &&
          (isMissingColumnError(upsertError, "execution_log") || mentionsFieldError(upsertError, "execution_log"))
        ) {
          console.warn("[Submission] DB missing 'execution_log' column. Embedding snapshot into attachments payload.");
          if (executionPayload) {
            try {
              const embeddedSnapshot = `data:application/json;base64,${btoa(JSON.stringify(executionPayload))}`;
              if (Array.isArray(payloadToSave.attachments)) {
                payloadToSave.attachments = [...(payloadToSave.attachments as string[]), embeddedSnapshot];
              } else {
                payloadToSave.attachments = [embeddedSnapshot];
              }
            } catch (_err) {
              // ignore encoding error
            }
          }
          delete payloadToSave.execution_log;
          continue;
        }
        if (
          Object.prototype.hasOwnProperty.call(payloadToSave, "images") &&
          (isMissingColumnError(upsertError, "images") || mentionsFieldError(upsertError, "images"))
        ) {
          delete payloadToSave.images;
          continue;
        }
        if (isDuplicateKeyError(upsertError)) {
          upsertError = null;
          break;
        }
        break;
      }

      if (upsertError) {
        setError(STUDENT_SAVE_ERROR);
        setLoading(false);
        return false;
      }

      await syncStudentExperimentStatusAsync({
        studentId: user.id,
        expId,
        status,
      });

      await loadData();
      setCurrentStatus(status);
      setLastSavedAt(new Date().toISOString());
      window.dispatchEvent(new Event(STUDENT_DATA_UPDATED_EVENT));
      if (status === "submitted") {
        clearVivaDraftCache(user.id, subjectId, expId);
      }
      await supabase
        .from("submissions")
        .select("id, subject_id, exp_id, status, updated_at")
        .eq("student_id", user.id)
        .eq("subject_id", subjectId)
        .eq("exp_id", expId)
        .maybeSingle();
      setLoading(false);
      return true;
    } catch (err) {
      setError(STUDENT_SAVE_ERROR);
      setLoading(false);
      return false;
    }
  }

  async function handleSaveDraft() {
    const ok = await upsertSubmission("draft");
    if (ok) {
      setDraftSaved(true);
      window.setTimeout(() => setDraftSaved(false), 2000);
      toast.success("Draft saved");
    }
  }

  /* ================= SUBMIT ================= */
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (missingSubmitFields.length > 0) {
      setError(`Please complete: ${missingSubmitFields.join(", ")}.`);
      toast.error("Please complete required fields before submit.");
      return;
    }
    const ok = await upsertSubmission("submitted");
    if (ok) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user && subjectId && expId) {
        await persistAiEvaluationAsync({
          studentId: user.id,
          subjectId,
          expId,
          submission: {
            aim: String(aim || ""),
            algorithm: String(procedure || ""),
            program: String(showCodeSections ? codeValue : ""),
            output: String(output || ""),
            result: String(result || ""),
          },
          evaluationOverride: null,
        });
      }
      setSubmittedCard(true);
      toast.success("Experiment submitted successfully.");
      const targetSubject = subjectId
        ? `?subject=${subjectId}&refresh=${Date.now()}`
        : `?refresh=${Date.now()}`;
      window.setTimeout(() => navigate(`/student/submissions${targetSubject}`), 900);
    }
  }

  const progressData = useExperimentProgress({
    aim:
      treatTemplateDefaultsAsEmpty &&
      templateDefaults.aim.trim().length > 0 &&
      aim.trim() === templateDefaults.aim.trim()
        ? ""
        : aim,
    procedure:
      treatTemplateDefaultsAsEmpty &&
      templateDefaults.procedure.trim().length > 0 &&
      procedure.trim() === templateDefaults.procedure.trim()
        ? ""
        : procedure,
    code: codeValue,
    output,
    result:
      treatTemplateDefaultsAsEmpty &&
      templateDefaults.result.trim().length > 0 &&
      result.trim() === templateDefaults.result.trim()
        ? ""
        : result,
    vivaAnswers,
    vivaTotal: vivaQuestions.length,
    attachmentCount: attachmentDataUrls.length,
    showCode: showCodeSections,
  });

  useEffect(() => {
    if (reducedMotion || userScrollingRef.current) return;
    const justCompleted = progressData.getNewlyCompleted();
    if (!justCompleted) return;

    const order: SectionKey[] = ["aim", "procedure", "code", "output", "result", "viva"];
    const idx = order.indexOf(justCompleted);
    const nextKey = idx < order.length - 1 ? order[idx + 1] : null;
    if (!nextKey) return;

    const nextEl = sectionRefs.current[nextKey];
    if (nextEl) {
      window.setTimeout(() => {
        nextEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 120);
    }
  }, [progressData.progress, progressData.getNewlyCompleted, reducedMotion]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      userScrollingRef.current = true;
      clearTimeout(timeout);
      timeout = setTimeout(() => { userScrollingRef.current = false; }, 2000);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(timeout);
    };
  }, []);

  const handleSectionClick = useCallback((key: string) => {
    const el = sectionRefs.current[key as SectionKey];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  const showPhotoUpload = true;
  const effectiveAttachmentCount = useMemo(
    () => Math.max(attachmentDataUrls.length, imagePreviews.length, outputImages.length),
    [attachmentDataUrls.length, imagePreviews.length, outputImages.length]
  );
  const attachmentPreviewSources = useMemo(
    () => (imagePreviews.length > 0 ? imagePreviews : attachmentDataUrls),
    [imagePreviews, attachmentDataUrls]
  );
  const showingSavedAttachments = imagePreviews.length === 0 && attachmentDataUrls.length > 0;
  const status = getStatusConfig(currentStatus);
  const modeLabel =
    effectiveContentMode === "mixed"
        ? "Code + Upload"
        : effectiveContentMode === "code"
          ? "Coding"
          : "Upload";

  const [expandedSections, setExpandedSections] = useState<Set<SectionKey>>(new Set());
  const toggleExpand = useCallback((key: SectionKey) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  useEffect(() => {
    setResolvedExpId(routeExpId);
  }, [routeExpId]);

  const softSectionReady = useMemo<Record<SectionKey, boolean>>(
    () => ({
      aim: aim.trim().length > 0,
      procedure: procedure.trim().length > 0,
      code:
        !showCodeSections ||
        codeValue.trim().length > 0 ||
        codeOutput.trim().length > 0,
      output:
        output.trim().length > 0 ||
        effectiveAttachmentCount > 0,
      result: result.trim().length > 0,
      viva:
        vivaQuestions.length === 0 ||
        vivaAnswers.some((answer) => String(answer || "").trim().length > 0),
    }),
    [
      aim,
      procedure,
      showCodeSections,
      codeValue,
      codeOutput,
      output,
      effectiveAttachmentCount,
      result,
      vivaQuestions.length,
      vivaAnswers,
    ]
  );

  const missingSubmitFields = useMemo<string[]>(() => {
    const normalizedAim =
      treatTemplateDefaultsAsEmpty &&
      templateDefaults.aim.trim().length > 0 &&
      aim.trim() === templateDefaults.aim.trim()
        ? ""
        : aim;
    const normalizedProcedure =
      treatTemplateDefaultsAsEmpty &&
      templateDefaults.procedure.trim().length > 0 &&
      procedure.trim() === templateDefaults.procedure.trim()
        ? ""
        : procedure;
    const normalizedResult =
      treatTemplateDefaultsAsEmpty &&
      templateDefaults.result.trim().length > 0 &&
      result.trim() === templateDefaults.result.trim()
        ? ""
        : result;
    const normalizedCode =
      showCodeSections && codeValue.trim() === getTemplate(codeLanguage).trim()
        ? ""
        : codeValue;

    const missing: string[] = [];
    if (!normalizedAim.trim()) missing.push("Aim");
    if (!normalizedProcedure.trim()) missing.push("Procedure");
    if (showCodeSections && !normalizedCode.trim()) missing.push("Code");
    if (!output.trim() && effectiveAttachmentCount === 0) missing.push("Output/Attachment");
    if (!normalizedResult.trim()) missing.push("Result");
    return missing;
  }, [
    aim,
    procedure,
    result,
    codeValue,
    codeLanguage,
    showCodeSections,
    output,
    effectiveAttachmentCount,
    treatTemplateDefaultsAsEmpty,
    templateDefaults.aim,
    templateDefaults.procedure,
    templateDefaults.result,
  ]);

  const isSectionUnlocked = useCallback((key: SectionKey): boolean => {
    const order: SectionKey[] = ["aim", "procedure", "code", "output", "result", "viva"];
    const idx = order.indexOf(key);
    if (idx === 0) return true;
    const prevKey = order[idx - 1];
    return prevKey ? Boolean(softSectionReady[prevKey]) : true;
  }, [softSectionReady]);

  const getSectionPreview = useCallback((key: SectionKey): string => {
    switch (key) {
      case "aim": return aim.trim().slice(0, 80) + (aim.trim().length > 80 ? "…" : "");
      case "procedure": return procedure.trim().split("\n").slice(0, 2).join(" ").slice(0, 80) + "…";
      case "code": return `${codeLanguage} · ${codeValue.split("\n").filter((l) => l.trim()).length} lines`;
      case "output": return output.trim().slice(0, 60) || `${effectiveAttachmentCount} attachment(s)`;
      case "result": return result.trim().slice(0, 80) + (result.trim().length > 80 ? "…" : "");
      case "viva": {
        const answered = vivaAnswers.filter((a) => a.trim()).length;
        return `${answered}/${vivaQuestions.length} answered`;
      }
      default: return "";
    }
  }, [aim, procedure, codeLanguage, codeValue, output, result, vivaAnswers, vivaQuestions, effectiveAttachmentCount]);

  const STEP_LABELS: Record<SectionKey, string> = { aim: "Aim", procedure: "Procedure", code: "Code", output: "Output", result: "Result", viva: "Viva" };
  const STEP_ORDER: SectionKey[] = ["aim", "procedure", "code", "output", "result", "viva"];

  const goToNextSection = useCallback((currentKey: SectionKey) => {
    const idx = STEP_ORDER.indexOf(currentKey);
    if (idx < STEP_ORDER.length - 1) {
      const nextKey = STEP_ORDER[idx + 1];
      if (nextKey) {
        const el = sectionRefs.current[nextKey];
        if (el) {
          window.setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
        }
      }
    }
  }, []);

  const renderAttachmentUpload = () => {
    const hasFiles = attachmentPreviewSources.length > 0;
    const isOpen = isAttachmentPanelOpen || hasFiles;

    return (
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-blue-600" />
            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Attachments ({attachmentPreviewSources.length})
            </span>
          </div>
          {!hasFiles && !isReadOnly && (
            <button
              type="button"
              onClick={() => setIsAttachmentPanelOpen(!isAttachmentPanelOpen)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-blue-600 transition"
            >
              <ImagePlus className="h-3.5 w-3.5 text-blue-600" />
              <span>{isAttachmentPanelOpen ? "Hide Upload Panel" : "+ Add Attachments"}</span>
            </button>
          )}
        </div>

        {!isOpen && !hasFiles ? (
          <p className="text-xs text-slate-400 italic">No attachments uploaded.</p>
        ) : (
          <div className="space-y-3 pt-2 border-t border-slate-100">
            {!isReadOnly && (
              <div
                className={`rounded-xl border-2 border-dashed p-3 transition-all ${
                  isDropHover ? "border-blue-500 bg-blue-50/50" : "border-slate-200 bg-slate-50/50 hover:border-slate-300"
                }`}
                onDragOver={(ev) => {
                  ev.preventDefault();
                  setIsDropHover(true);
                }}
                onDragLeave={(ev) => {
                  ev.preventDefault();
                  setIsDropHover(false);
                }}
                onDrop={(ev) => {
                  ev.preventDefault();
                  setIsDropHover(false);
                  if (ev.dataTransfer.files && ev.dataTransfer.files.length > 0) {
                    setIsAttachmentPanelOpen(true);
                    void handleImageUpload({ target: { files: ev.dataTransfer.files } } as any);
                  }
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 shadow-xs transition hover:bg-slate-50 hover:text-blue-600">
                    <ImagePlus className="h-3.5 w-3.5 text-blue-600" />
                    <span>Upload Images / PDF</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      multiple
                      hidden
                      onChange={(e) => {
                        setIsAttachmentPanelOpen(true);
                        void handleImageUpload(e);
                      }}
                      disabled={isReadOnly}
                    />
                  </label>
                  <span className="text-[11px] text-slate-400 font-medium">
                    {hasFiles
                      ? `${attachmentPreviewSources.length} / ${MAX_ATTACHMENTS} attached`
                      : `Max ${MAX_ATTACHMENTS} files (PNG, JPG, PDF)`}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">PNG, JPG, PDF — or drag & drop files here</p>
              </div>
            )}

            {uploadHint && <p className="text-xs font-medium text-blue-700">{uploadHint}</p>}

            {hasFiles && (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
                {attachmentPreviewSources.map((src, i) => (
                  <div
                    key={`${src.slice(0, 32)}-${i}`}
                    className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs transition hover:border-slate-300"
                  >
                    <img
                      src={src}
                      alt={`Attachment ${i + 1}`}
                      className="h-20 w-full object-cover transition group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-slate-900/60 px-2 py-1 backdrop-blur-xs flex items-center justify-between">
                      <span className="text-[10px] font-medium text-white truncate">File {i + 1}</span>
                      {!isReadOnly && (
                        <button
                          type="button"
                          onClick={() => removeAttachment(i)}
                          className="rounded bg-red-600/80 p-0.5 text-white hover:bg-red-600 transition"
                          title="Remove attachment"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  /* ================= UI ================= */
  return (
    <div className="student-page-enter faculty-bg-vibrant min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-[1380px]">
      {/* ERROR */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="faculty-surface mb-4 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-amber-500 hover:text-amber-700">✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      {submittedCard && (
        <div className="faculty-surface mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Submission successful — awaiting faculty evaluation.
        </div>
      )}

      {/* HEADER — single row: back + title + status */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="faculty-glass faculty-gradient-ring mb-6 flex flex-col gap-4 rounded-3xl p-6 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate(`/student/experiments${subjectId ? `?subject=${subjectId}` : ""}`)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white/90 text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 shrink-0 text-blue-600" />
              <h1 className="truncate bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-lg font-bold text-transparent">
                Experiment {experimentNo}{experimentNo && experimentTitle !== "Untitled Experiment" ? " • " : ""}{experimentTitle !== "Untitled Experiment" ? experimentTitle : ""}
              </h1>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={`student-status-badge inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${status.background} ${status.color}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
          {dueDate && (() => {
            const due = new Date(dueDate);
            if (isNaN(due.getTime())) return null;
            const now = new Date();
            const diffMs = due.getTime() - now.getTime();
            const diffHours = diffMs / (1000 * 60 * 60);
            const formattedDate = due.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });
            const isLate = diffMs < 0;
            const isUrgent = diffHours <= 48 && !isLate;

            return (
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                isLate
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : isUrgent
                    ? "border-amber-200 bg-amber-50 text-amber-800 animate-pulse"
                    : "border-blue-200 bg-blue-50 text-blue-700"
              }`}>
                <Clock className="h-3.5 w-3.5" />
                {isLate
                  ? `Deadline Passed (${formattedDate})`
                  : isUrgent
                    ? `⏰ Due in ${Math.max(1, Math.round(diffHours))}h (${formattedDate})`
                    : `⏰ Due: ${formattedDate}`
                }
              </span>
            );
          })()}
          {isAutoSaving && <span className="text-xs text-amber-700">Saving...</span>}
          {lastSavedAt && !isAutoSaving && (
            <span className="text-[11px] text-slate-500">
              Saved {new Date(lastSavedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
            </span>
          )}
        </div>
      </motion.div>

      {/* PROGRESS BAR */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.05, duration: 0.2, ease: "easeOut" }}
        className="faculty-surface mb-6 rounded-2xl p-4"
      >
        <div className="flex items-center gap-4">
          <ProgressRing progress={progressData.progress} size={56} strokeWidth={5} />
          <div className="flex-1 min-w-0">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Experiment Progress</p>
              <p className="text-xs text-slate-500">{progressData.completedCount}/{progressData.totalSections} sections</p>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-600"
                initial={{ width: "0%" }}
                animate={{ width: `${progressData.progress}%` }}
                transition={{ type: "spring", stiffness: 60, damping: 15 }}
              />
            </div>
            <div className="mt-2 flex gap-1">
              {STEP_ORDER.map((key) => {
                const sec = progressData.sections.find((s) => s.key === key);
                const isComplete = sec?.state === "completed";
                const isActive = sec?.state === "active";
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleSectionClick(key)}
                    className={`flex-1 rounded-md py-1 text-[10px] font-medium transition-all ${
                      isComplete
                        ? "bg-emerald-50 text-emerald-700"
                        : isActive
                          ? "bg-blue-50 text-blue-700"
                          : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {isComplete ? "✓" : ""} {STEP_LABELS[key]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>

      {/* STEP CARDS */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {STEP_ORDER.map((key, stepIdx) => {
          const sec = progressData.sections.find((s) => s.key === key)!;
          const unlocked = isSectionUnlocked(key);
          const isComplete = sec.state === "completed";
          const isActive = sec.state === "active";
          const isCollapsed = isComplete && !expandedSections.has(key);
          const nextStepKey = STEP_ORDER[stepIdx + 1];

          return (
            <motion.div
              key={key}
              ref={(el) => { sectionRefs.current[key] = el; }}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: stepIdx * 0.06, duration: 0.2, ease: "easeOut" }}
              className={`rounded-2xl border transition-all duration-200 ${
                !unlocked
                  ? "border-slate-200 bg-slate-100/70 opacity-70"
                  : isActive
                    ? "border-blue-200 bg-gradient-to-b from-blue-50 to-indigo-50 shadow-sm"
                    : isComplete
                      ? "border-emerald-200 bg-emerald-50/40"
                      : "border-slate-200 bg-white"
              }`}
            >
              {/* Step header */}
              <button
                type="button"
                onClick={() => {
                  if (!unlocked) return;
                  if (isComplete) toggleExpand(key);
                  else handleSectionClick(key);
                }}
                disabled={!unlocked}
                className="flex w-full items-center gap-3 px-5 py-4 text-left"
              >
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all ${
                  isComplete
                    ? "bg-emerald-50 ring-1 ring-emerald-200"
                    : isActive
                      ? "bg-blue-50 ring-1 ring-blue-200"
                      : !unlocked
                        ? "bg-slate-100 ring-1 ring-slate-200"
                        : "bg-slate-50 ring-1 ring-slate-200"
                }`}>
                  {isComplete ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : !unlocked ? (
                    <Lock className="h-3.5 w-3.5 text-slate-600" />
                  ) : (
                    <span className="text-xs font-bold text-blue-700">{stepIdx + 1}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${
                    isComplete ? "text-emerald-700" : isActive ? "text-slate-900" : !unlocked ? "text-slate-500" : "text-slate-700"
                  }`}>
                    {STEP_LABELS[key]}
                  </p>
                  {isCollapsed && (
                    <p className="mt-0.5 truncate text-xs text-slate-500">{getSectionPreview(key)}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isComplete && (
                    <span className="text-[11px] text-slate-600">{sec.detail}</span>
                  )}
                  {isComplete && (
                    <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${!isCollapsed ? "rotate-180" : ""}`} />
                  )}
                  {isActive && (
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-60" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
                    </span>
                  )}
                </div>
              </button>

              {/* Step content */}
              <AnimatePresence initial={false}>
                {unlocked && !isCollapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-slate-200 px-5 py-5">
                      {key === "aim" && (
                        <Textarea value={aim} onChange={(e) => setAim(e.target.value)} placeholder="Describe the objective of this experiment..." rows={3} disabled={isReadOnly} />
                      )}
                      {key === "procedure" && (
                        <Textarea value={procedure} onChange={(e) => setProcedure(e.target.value)} placeholder="List the steps (1. First step  2. Second step ...)" rows={6} disabled={isReadOnly} />
                      )}
                      {key === "code" && showCodeSections && (
                        <div className="space-y-4">
                          <div className="min-h-[320px] md:min-h-[400px]">
                            <Suspense
                              fallback={
                                <div className="flex h-full min-h-[320px] items-center justify-center rounded-xl border border-slate-800 bg-slate-950 text-sm text-slate-400 md:min-h-[400px]">
                                  Loading editor...
                                </div>
                              }
                            >
                              <CodeEditor
                                value={codeValue}
                                onChange={isReadOnly ? () => {} : setCodeValue}
                                language={codeLanguage}
                                onLanguageChange={(newLang) => {
                                  const prev = getTemplate(codeLanguage);
                                  setCodeLanguage(newLang);
                                  setCodeValue((old) => (!old.trim() || old === prev) ? getTemplate(newLang) : old);
                                }}
                                onRun={isReadOnly ? undefined : handleRunCode}
                                isRunning={isRunning}
                                customInput={customInput}
                                onCustomInputChange={isReadOnly ? undefined : setCustomInput}
                              />
                            </Suspense>
                          </div>
                          <OutputPanel
                            result={executionResult}
                            output={codeOutput}
                            error={codeError}
                            isLoading={isRunning}
                            executionTime={executionTime}
                            language={codeLanguage}
                          />
                        </div>
                      )}
                      {key === "code" && !showCodeSections && (
                        <p className="text-sm text-slate-500">This experiment is upload-based. Proceed to Output.</p>
                      )}
                      {key === "output" && (
                        <div className="space-y-4">
                          <Textarea value={output} onChange={(e) => setOutput(e.target.value)} placeholder="Paste or describe your output..." rows={4} disabled={isReadOnly} />
                          {showPhotoUpload && renderAttachmentUpload()}
                        </div>
                      )}
                      {key === "result" && (
                        <Textarea value={result} onChange={(e) => setResult(e.target.value)} placeholder="Summarise the result and observations..." rows={3} disabled={isReadOnly} />
                      )}
                      {key === "viva" && (
                        vivaQuestions.length === 0 ? (
                          <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">No viva questions for this experiment.</p>
                        ) : (
                          <div className="space-y-4">
                            {vivaQuestions.map((q, qi) => (
                              <div key={`${q}-${qi}`} className="faculty-surface rounded-xl p-4">
                                <p className="text-sm text-slate-700"><span className="mr-1.5 font-semibold text-blue-700">{qi + 1}.</span>{q}</p>
                                <Textarea
                                  className="mt-2"
                                  value={vivaAnswers[qi] || ""}
                                  onChange={(ev) => setVivaAnswers((prev) => { const n = [...prev]; n[qi] = ev.target.value; return n; })}
                                  placeholder="Write your answer..."
                                  rows={2}
                                  disabled={isReadOnly}
                                />
                              </div>
                            ))}
                          </div>
                        )
                      )}
                      {/* Section footer: Next button or Collapse */}
                      <div className="mt-4 flex items-center justify-between">
                        {isComplete ? (
                          <button type="button" onClick={() => toggleExpand(key)} className="inline-flex items-center gap-1 text-xs text-slate-500 transition hover:text-slate-700">
                            <Pencil className="h-3 w-3" /> Collapse
                          </button>
                        ) : <span />}
                        {stepIdx < STEP_ORDER.length - 1 && (
                          <button
                            type="button"
                            onClick={() => goToNextSection(key)}
                            disabled={!softSectionReady[key]}
                            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
                              softSectionReady[key]
                                ? "border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                                : "cursor-not-allowed bg-slate-100 text-slate-500"
                            }`}
                          >
                            Next: {nextStepKey ? STEP_LABELS[nextStepKey] : ""}
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}

        {/* ACTION BAR */}
        <div className="faculty-surface sticky bottom-0 rounded-2xl border border-slate-200 bg-white/90 px-5 py-4 backdrop-blur-xl">
          {isReadOnly && (
            <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              View mode only. Editing is available from the Experiments page.
            </div>
          )}
          {missingSubmitFields.length > 0 && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Missing required fields: {missingSubmitFields.join(", ")}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Button
              type="button"
              onClick={handleSaveDraft}
              disabled={loading || isReadOnly}
              className="student-btn-primary h-11 w-full gap-2 border border-slate-200 bg-slate-100 text-sm text-slate-700 hover:bg-slate-200"
            >
              <Save className="h-4 w-4" />
              {loading ? "Saving..." : "Save Draft"}
            </Button>
            <Button
              type="submit"
              disabled={loading || isReadOnly}
              className="student-btn-primary h-11 w-full gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(37,99,235,0.2)] hover:from-blue-500 hover:to-indigo-500"
            >
              <Save className="h-4 w-4" />
              {loading ? "Submitting..." : "Submit Experiment"}
            </Button>
          </div>
        </div>
       </form>
      </div>

      <Suspense fallback={null}>
        <AiTutorPanel
          experimentTitle={experimentTitle}
          aim={aim}
          procedure={procedure}
          codeLanguage={codeLanguage}
          codeValue={codeValue}
          output={output}
          expId={expId}
        />
      </Suspense>
    </div>
  );
}
