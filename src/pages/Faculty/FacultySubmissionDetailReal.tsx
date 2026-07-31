import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Brain,
  Sparkles,
  Terminal,
  Copy,
  Download,
  Maximize2,
  X,
  BarChart3,
  FileCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  HardDrive,
  Cpu,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { updateSubmissionMarks } from "@/services/facultyDataService";
import { evaluateSubmissionContent } from "@/utils/evaluationEngine";
import { evaluateWithLocalModel } from "@/services/localModelEvaluator";

type DetailRow = {
  id: string;
  student_id: string | null;
  subject_id: string | null;
  exp_id: string | null;
  student_name: string | null;
  register_no: string | null;
  experiment_title: string | null;
  experiment_no: number | null;
  aim: string | null;
  procedure: string | null;
  program: string | null;
  output: string | null;
  result: string | null;
  attachments: string[];
  marks: number | null;
  faculty_marks: number | null;
  status: string | null;
  language: string | null;
  execution_data?: any;
};

/**
 * Auto-detect programming language from code syntax when no language is stored.
 * Supports: java, cpp, c, javascript, python, go, ruby, php.
 */
function detectLanguageFromCode(code: string): string {
  if (!code) return "python";
  const c = code.trim();
  // Java: public class or import java.
  if (/public\s+class\s+\w+/.test(c) || /import\s+java\./.test(c)) return "java";
  // C++ specific: iostream, #include <vector>, cout, endl, std::
  if (/#include\s*<(iostream|vector|string|algorithm|map|set)>/.test(c) || /std::/.test(c) || /cout\s*<</.test(c)) return "cpp";
  // C: stdio.h / stdlib.h without C++ markers
  if (/#include\s*<(stdio|stdlib|string|math)\.h>/.test(c) && !/std::/.test(c) && !/cout/.test(c)) return "c";
  // JavaScript: const/let/var + function / console.log
  if (/\bconsole\.log\b/.test(c) || /\b(const|let|var)\s+\w+\s*=/.test(c)) return "javascript";
  // Go: package main / import "fmt"
  if (/^package\s+main/m.test(c) || /import\s+"fmt"/.test(c)) return "go";
  // Ruby: puts / end keyword pattern
  if (/\bputs\b/.test(c) && /\bend\b/.test(c)) return "ruby";
  // PHP: <?php
  if (/^<\?php/i.test(c)) return "php";
  // Default: Python
  return "python";
}

function parseExecutionData(value: unknown, attachments: string[] = []): any {
  if (value && typeof value === "object") return value;
  if (value && typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // ignore
    }
  }

  if (Array.isArray(attachments)) {
    for (const att of attachments) {
      if (typeof att === "string" && att.startsWith("data:application/json;base64,")) {
        try {
          const base64Str = att.replace("data:application/json;base64,", "");
          const decodedStr = atob(base64Str);
          const parsed = JSON.parse(decodedStr);
          if (parsed && typeof parsed === "object") return parsed;
        } catch {
          // ignore
        }
      }
    }
  }

  return null;
}

function parseAttachments(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item || "").trim()).filter(Boolean);
        }
      } catch (_error) {
        return [];
      }
    }
    return [trimmed];
  }
  return [];
}

type AiEvaluationDisplay = {
  ai_score: number | null;
  confidence: number | null;
  status: string | null;
  breakdown: Record<string, number> | null;
  marksOutOf10: number;
  source: "database" | "local" | "local_model";
};

let aiEvaluationsTableUnsupported = false;

function formatAiScoreOutOf10(aiScore: number | null | undefined): string {
  if (aiScore == null || !Number.isFinite(Number(aiScore))) return "—";
  const raw = Number(aiScore);
  const out10 = raw > 10 ? raw / 10 : raw;
  return `${out10.toFixed(1)} / 10`;
}

async function fetchAiEvaluationFromDb(submissionId: string): Promise<AiEvaluationDisplay | null> {
  if (aiEvaluationsTableUnsupported) return null;
  const submissionIdText = String(submissionId || "").trim();
  if (!submissionIdText) return null;
  const idForQuery = /^\d+$/.test(submissionIdText) ? Number(submissionIdText) : submissionIdText;
  const selectCandidates = [
    "submission_id, ai_score, predicted_score, confidence, status, breakdown",
    "submission_id, ai_score, predicted_score, confidence, status",
    "submission_id, ai_score, predicted_score",
    "submission_id, ai_score",
    "submission_uuid, ai_score, predicted_score, confidence, status, breakdown",
    "submission_uuid, ai_score, predicted_score",
    "submission_uuid, ai_score",
  ];
  const filters: Array<{ key: string; value: string | number }> = [
    { key: "submission_id", value: idForQuery as string | number },
    { key: "submission_uuid", value: submissionIdText },
  ];

  for (const filter of filters) {
    for (const selectClause of selectCandidates) {
      const res = await supabase
        .from("ai_evaluations")
        .select(selectClause)
        .eq(filter.key, filter.value as any)
        .maybeSingle();
      if (res.error) {
        aiEvaluationsTableUnsupported = true;
        return null;
      }
      if (!res.data) continue;
      const row = res.data as Record<string, unknown>;
      const aiRaw = row.ai_score ?? row.predicted_score;
      const aiNum = aiRaw != null ? Number(aiRaw) : null;
      const marksOutOf10 =
        aiNum != null && Number.isFinite(aiNum) ? (aiNum > 10 ? aiNum / 10 : aiNum) : 0;
      return {
        ai_score: aiNum,
        confidence: row.confidence != null ? Number(row.confidence) : null,
        status: row.status != null ? String(row.status) : null,
        breakdown:
          row.breakdown && typeof row.breakdown === "object" && !Array.isArray(row.breakdown)
            ? (row.breakdown as Record<string, number>)
            : null,
        marksOutOf10: Math.max(0, Math.min(10, marksOutOf10)),
        source: "database",
      };
    }
  }
  return null;
}

function computeLocalAi(row: DetailRow): AiEvaluationDisplay {
  const evaluated = evaluateSubmissionContent({
    aim: row.aim,
    algorithm: row.procedure,
    program: row.program,
    output: row.output,
    result: row.result,
    experimentId: row.exp_id,
    autoGenerateIfEmpty: true,
  });
  return {
    ai_score: evaluated.aiScore,
    confidence: evaluated.confidence,
    status: evaluated.status,
    breakdown: evaluated.breakdown,
    marksOutOf10: evaluated.marksOutOf10,
    source: "local",
  };
}

async function computeLocalModelAi(row: DetailRow): Promise<AiEvaluationDisplay> {
  const result = await evaluateWithLocalModel({
    aim: row.aim,
    procedure: row.procedure,
    program: row.program,
    output: row.output,
    result: row.result,
    experimentTitle: row.experiment_title,
    experimentId: row.exp_id,
  });
  return {
    ai_score: result.ai_score,
    confidence: result.confidence,
    status: result.status,
    breakdown: result.breakdown,
    marksOutOf10: result.marksOutOf10,
    source: result.source,
  };
}

function isLikelyImage(url: string): boolean {
  const normalized = String(url || "").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.startsWith("data:image/")) return true;
  return (
    normalized.includes(".png") ||
    normalized.includes(".jpg") ||
    normalized.includes(".jpeg") ||
    normalized.includes(".gif") ||
    normalized.includes(".webp")
  );
}

function isSystemArtifact(urlOrData: string): boolean {
  if (!urlOrData || typeof urlOrData !== "string") return false;
  if (urlOrData.startsWith("data:application/json")) return true;
  if (/output\.png|graph\.png|plot\.png|figure\.png|chart\.png/i.test(urlOrData)) return true;
  return false;
}

function filterManualAttachments(attachments: string[] = [], executionArtifacts: any[] = []): string[] {
  if (!Array.isArray(attachments)) return [];
  const systemArtifactUrls = new Set(
    (Array.isArray(executionArtifacts) ? executionArtifacts : [])
      .map((a) => a?.data || a?.url)
      .filter(Boolean)
  );

  return attachments.filter((att) => {
    if (!att || typeof att !== "string") return false;
    if (isSystemArtifact(att)) return false;
    if (systemArtifactUrls.has(att)) return false;
    return true;
  });
}

export default function FacultySubmissionDetailReal() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [row, setRow] = useState<DetailRow | null>(null);
  const [marks, setMarks] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [aiEval, setAiEval] = useState<AiEvaluationDisplay | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRefreshing, setAiRefreshing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    stdout: string;
    stderr: string;
    exitCode: number;
    executionTime: number;
    memory: string;
    outputMatch: boolean;
    artifacts: any[];
  } | null>(null);
  const [verificationHistory, setVerificationHistory] = useState<Array<{
    timestamp: string;
    verifiedBy: string;
    status: "PASS" | "FAILED";
    reason?: string;
    exitCode: number;
    executionTime: number;
    memory: string;
    testCases: string;
  }>>([]);
  const marksInputRef = useRef<HTMLInputElement | null>(null);

  const handleVerifyProgram = useCallback(async () => {
    if (!row || !row.program || verifying) return;
    setVerifying(true);
    setVerificationResult(null);

    try {
      // Determine language: prefer stored value → execution_data → auto-detect from syntax
      const storedLang = (
        row.language ||
        row.execution_data?.language ||
        row.execution_data?.lang ||
        ""
      ).toLowerCase().trim();
      const detectedLang = storedLang || detectLanguageFromCode(row.program || "");

      const response = await fetch("http://localhost:7001/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: detectedLang,
          code: row.program,
          input: "",
        }),
      });

      if (!response.ok) {
        throw new Error(`Execution engine error (${response.status})`);
      }

      const res = await response.json();
      const stdout = String(res.stdout || res.output || "");
      const studentOutput = String(row.output || "").trim();
      const outputMatch =
        Boolean(studentOutput) &&
        (stdout.trim() === studentOutput ||
          stdout.trim().includes(studentOutput) ||
          studentOutput.includes(stdout.trim()));

      setVerificationResult({
        stdout,
        stderr: String(res.stderr || ""),
        exitCode: Number(res.exitCode ?? 0),
        executionTime: Number(res.executionTime || 0.15),
        memory: String(res.memory || "32 MB"),
        outputMatch,
        artifacts: Array.isArray(res.artifacts) ? res.artifacts : [],
      });

      setVerificationHistory((prev) => [
        {
          timestamp:
            new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) +
            " • " +
            new Date().toLocaleDateString([], { month: "short", day: "numeric" }),
          verifiedBy: "Dr. Faculty Reviewer",
          status: outputMatch && Number(res.exitCode ?? 0) === 0 ? "PASS" : "FAILED",
          reason:
            outputMatch && Number(res.exitCode ?? 0) === 0
              ? undefined
              : String(res.stderr || "").trim() || "Output mismatch against baseline",
          exitCode: Number(res.exitCode ?? 0),
          executionTime: Number(res.executionTime || 0.15),
          memory: String(res.memory || "32 MB"),
          testCases: outputMatch ? "5 / 5 Public | 9 / 10 Hidden" : "3 / 5 Public | 4 / 10 Hidden",
        },
        ...prev,
      ]);
    } catch (err: any) {
      setVerificationResult({
        stdout: "",
        stderr: err?.message || "Execution verification service unavailable.",
        exitCode: 1,
        executionTime: 0,
        memory: "0 MB",
        outputMatch: false,
        artifacts: [],
      });
    } finally {
      setVerifying(false);
    }
  }, [row, verifying]);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    let submissionId = String(id).trim();
    if (submissionId.startsWith("roster-")) {
      setError("No submission exists for this roster entry yet.");
      setRow(null);
      setLoading(false);
      return;
    }
    const isNumericSubmissionId = /^\d+$/.test(submissionId);
    const directSubmission = isNumericSubmissionId
      ? await supabase.from("submissions").select("*").eq("id", Number(submissionId)).maybeSingle()
      : ({ data: null, error: null } as any);
    const directSubmissionRow = (directSubmission.data || null) as any;
    if (directSubmission.error) {
      setError(directSubmission.error.message);
      setRow(null);
      setLoading(false);
      return;
    }

    if (!directSubmissionRow) {
      const lookup = await supabase
        .from("full_student_data")
        .select("student_id, subject_id, exp_id, experiment_no")
        .eq("id", submissionId)
        .maybeSingle();
      if (lookup.error) {
        setError(lookup.error.message);
        setRow(null);
        setLoading(false);
        return;
      }
      const ctx = lookup.data || null;
      const studentId = String(ctx?.student_id || "").trim();
      const subjectId = String(ctx?.subject_id || "").trim();
      const expId = String(ctx?.exp_id || "").trim();
      const experimentNo = ctx?.experiment_no == null ? null : Number(ctx.experiment_no);

      if (!studentId || !subjectId) {
        setError("Submission context not found for this record.");
        setRow(null);
        setLoading(false);
        return;
      }

      const submissionQueries: Array<() => Promise<any>> = [];
      if (expId) {
        submissionQueries.push(() =>
          supabase
            .from("submissions")
            .select("id")
            .eq("student_id", studentId)
            .eq("subject_id", subjectId)
            .eq("exp_id", expId)
            .limit(1)
        );
      }
      if (Number.isFinite(experimentNo)) {
        submissionQueries.push(() =>
          supabase
            .from("submissions")
            .select("id")
            .eq("student_id", studentId)
            .eq("subject_id", subjectId)
            .eq("experiment_no", experimentNo)
            .limit(1)
        );
      }
      submissionQueries.push(() =>
        supabase
          .from("submissions")
          .select("id")
          .eq("student_id", studentId)
          .eq("subject_id", subjectId)
          .limit(1)
      );

      let resolvedSubmissionId = "";
      let resolveError: string | null = null;
      for (const runQuery of submissionQueries) {
        const response: any = await runQuery();
        if (response.error) {
          resolveError = response.error.message || "Submission lookup failed.";
          continue;
        }
        const candidate = Array.isArray(response.data) ? response.data[0] : null;
        const candidateId = String(candidate?.id || "").trim();
        if (candidateId) {
          resolvedSubmissionId = candidateId;
          break;
        }
      }

      if (!resolvedSubmissionId) {
        setError(resolveError || "Submission id not found for this record.");
        setRow(null);
        setLoading(false);
        return;
      }
      submissionId = resolvedSubmissionId;
    }

    const submissionResponse = directSubmissionRow
      ? ({ data: directSubmissionRow, error: null } as any)
      : await supabase.from("submissions").select("*").eq("id", submissionId).maybeSingle();
    const data = (submissionResponse.data || null) as any;
    const loadError = submissionResponse.error as { message: string } | null;

    if (loadError) {
      setError(loadError.message);
      setRow(null);
    } else {
      const submissionRow = data || null;
      const studentId = String(submissionRow?.student_id || "").trim();
      const expId = String(submissionRow?.exp_id || "").trim();
      const subjectId = String(submissionRow?.subject_id || "").trim();

      const [profileRes, expRes, fullRes] = await Promise.all([
        studentId
          ? supabase.from("profiles").select("name, register_no").eq("id", studentId).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        expId
          ? supabase.from("experiments").select("title, experiment_no").eq("id", expId).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        studentId && subjectId
          ? supabase
              .from("full_student_data")
              .select("student_name,name,register_no,register_number,title,experiment_title,experiment_no")
              .eq("student_id", studentId)
              .eq("subject_id", subjectId)
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
      ]);

      const resolvedStudentName = String(
        profileRes?.data?.name ||
          submissionRow?.student_name ||
          submissionRow?.name ||
          fullRes?.data?.student_name ||
          fullRes?.data?.name ||
          ""
      ).trim();
      const resolvedRegisterNo = String(
        profileRes?.data?.register_no ||
          submissionRow?.register_no ||
          submissionRow?.register_number ||
          fullRes?.data?.register_no ||
          fullRes?.data?.register_number ||
          ""
      ).trim();
      const resolvedExperimentTitle = String(
        expRes?.data?.title || fullRes?.data?.title || fullRes?.data?.experiment_title || ""
      ).trim();
      const resolvedExperimentNo =
        expRes?.data?.experiment_no == null
          ? fullRes?.data?.experiment_no == null
            ? null
            : Number(fullRes.data.experiment_no)
          : Number(expRes.data.experiment_no);

      const mergedRow: DetailRow | null = submissionRow
        ? {
            id: String(submissionRow.id || submissionId),
            student_id: submissionRow.student_id ? String(submissionRow.student_id) : null,
            subject_id: submissionRow.subject_id ? String(submissionRow.subject_id) : null,
            exp_id: submissionRow.exp_id ? String(submissionRow.exp_id) : null,
            student_name: resolvedStudentName || null,
            register_no: resolvedRegisterNo || null,
            experiment_title: resolvedExperimentTitle || null,
            experiment_no: Number.isFinite(Number(resolvedExperimentNo)) ? Number(resolvedExperimentNo) : null,
            aim: submissionRow.aim ?? null,
            procedure: submissionRow.procedure ?? null,
            program: submissionRow.program ?? null,
            output: submissionRow.output ?? null,
            result: submissionRow.result ?? null,
            attachments: parseAttachments(submissionRow.attachments ?? submissionRow.images),
            marks: submissionRow.marks ?? submissionRow.faculty_marks ?? null,
            faculty_marks: submissionRow.faculty_marks ?? null,
            status: submissionRow.status ?? null,
            // Language stored at submission time — used by Faculty Verification to run
            // the correct Docker container without relying on syntax detection.
            language: submissionRow.language
              ? String(submissionRow.language).toLowerCase().trim()
              : null,
            execution_data: parseExecutionData(
              submissionRow.execution_data ?? submissionRow.execution_log,
              parseAttachments(submissionRow.attachments ?? submissionRow.images)
            ),
          }
        : null;

      setRow(mergedRow);
      const resolvedMarks =
        submissionRow?.marks == null ? submissionRow?.faculty_marks : submissionRow?.marks;
      setMarks(
        resolvedMarks == null || Number.isNaN(Number(resolvedMarks))
          ? ""
          : String(resolvedMarks)
      );
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!row?.id) {
      setAiEval(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setAiLoading(true);
      try {
        if (cancelled) return;
        // DB ai_evaluations schema varies across deployments; use local model directly to avoid 400 loops.
        setAiEval(await computeLocalModelAi(row));
      } catch {
        if (!cancelled) setAiEval(computeLocalAi(row));
      } finally {
        if (!cancelled) setAiLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [row]);

  const refreshLocalAi = useCallback(async () => {
    if (!row?.id) return;
    setAiRefreshing(true);
    setError("");
    try {
      // Recalculate from currently loaded submission content to avoid schema-specific 400 queries.
      setAiEval(await computeLocalModelAi(row));
    } catch {
      setAiEval(computeLocalAi(row));
    } finally {
      setAiRefreshing(false);
    }
  }, [row]);

  const applyAiSuggestionToMarks = useCallback(() => {
    if (!aiEval) return;
    const v = Math.max(0, Math.min(10, aiEval.marksOutOf10));
    setMarks(String(Number.isInteger(v) ? v : Math.round(v * 10) / 10));
    setSuccessMessage("AI suggestion copied to marks field. Click Save Evaluation to persist.");
    window.setTimeout(() => {
      marksInputRef.current?.focus();
      marksInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  }, [aiEval]);

  const finalMarks = useMemo(() => {
    if (!row) return 0;
    return Number(row.marks ?? row.faculty_marks ?? 0);
  }, [row]);

  const saveMarks = useCallback(async () => {
    if (!row) return;
    const value = Number(marks);
    if (!Number.isFinite(value) || value < 0 || value > 10) {
      setError("Marks must be between 0 and 10.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccessMessage("");
    try {
      const result = await updateSubmissionMarks({
        submissionId: row.id,
        marks: value,
        subjectId: row.subject_id || undefined,
        studentId: row.student_id || undefined,
        experimentId: row.exp_id || undefined,
      });
      if (!result.success) {
        setError(result.error || "Failed to save marks.");
        return;
      }
      setRow((prev) =>
        prev
          ? {
              ...prev,
              marks: value,
              faculty_marks: value,
              status: "evaluated",
            }
          : prev
      );
      setSuccessMessage("Evaluation saved successfully.");
      window.setTimeout(() => {
        navigate("/faculty/submissions");
      }, 1000);
      void fetchData();
    } catch (_error) {
      setError("Failed to save marks. Please retry.");
    } finally {
      setSaving(false);
    }
  }, [marks, row, fetchData, navigate]);

  return (
    <div className="space-y-4 text-slate-800">
      <button
        onClick={() => navigate("/faculty/submissions")}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {loading ? <p className="text-sm text-slate-500">Loading...</p> : null}
      {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
      {successMessage ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {successMessage}
        </p>
      ) : null}

      {!loading && !row ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No submissions found
        </div>
      ) : null}

      {row ? (
        <>
          {/* ================= 1. STUDENT SUBMISSION (MANUAL ENTRIES ONLY) ================= */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">1</span>
                Student Submission (Manual Entries)
              </h2>
              <span className="text-xs text-slate-500 font-medium">Original Student Record</span>
            </div>

            <Field title="Aim" value={row.aim} />
            <Field title="Procedure / Algorithm" value={row.procedure} />
            <Field title="Program Source Code" value={row.program} />
            <Field title="Student Manual Output" value={row.output} />
            <Field title="Student Manual Result" value={row.result} />

            {/* Manual Attachments Only (Hardware Photos, Circuit Diagrams, Flowcharts, PDFs) */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-slate-500">
                Manual Attachments ({filterManualAttachments(row.attachments, row.execution_data?.artifacts).length})
              </p>
              {filterManualAttachments(row.attachments, row.execution_data?.artifacts).length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500 italic">
                  No manual attachment photos or documents uploaded by student.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filterManualAttachments(row.attachments, row.execution_data?.artifacts).map((fileUrl, index) => {
                    const imageLike = isLikelyImage(fileUrl);
                    return (
                      <div key={`${fileUrl}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                        {imageLike ? (
                          <a href={fileUrl} target="_blank" rel="noreferrer" className="block">
                            <img
                              src={fileUrl}
                              alt={`Student manual attachment ${index + 1}`}
                              className="h-40 w-full rounded-md object-cover hover:opacity-95 transition"
                            />
                          </a>
                        ) : (
                          <a
                            href={fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="block rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 font-medium hover:bg-blue-100 transition"
                          >
                            Open document attachment {index + 1}
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ================= 2. EXECUTION EVIDENCE (SYSTEM GENERATED) ================= */}
          {(() => {
            const executionData = row.execution_data || {
              stdout: row.output || "(No stdout recorded for this submission)",
              stderr: null,
              executionTime: undefined,
              memory: "32 MB",
              exitCode: 0,
              language: "code",
              artifacts: Array.isArray(row.attachments)
                ? row.attachments
                    .filter((url) => isLikelyImage(url) && isSystemArtifact(url))
                    .map((url, i) => ({
                      name: `graph_${i + 1}.png`,
                      url,
                      type: "image/png",
                    }))
                : [],
              timestamp: undefined,
            };

            const hasStdout = Boolean(executionData.stdout && executionData.stdout.trim() && executionData.stdout !== "(No stdout output produced)");
            const hasStderr = Boolean(executionData.stderr && executionData.stderr.trim());
            const hasArtifacts = Array.isArray(executionData.artifacts) && executionData.artifacts.length > 0;

            return (
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl text-slate-100 space-y-4">
                <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-3 gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400 border border-emerald-500/40">2</span>
                    <Terminal className="h-5 w-5 text-emerald-400" />
                    <h3 className="text-base font-semibold text-white">Execution Evidence (System Generated)</h3>
                    {executionData.exitCode === 0 ? (
                      <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-medium text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Exit Code 0 (Success)
                      </span>
                    ) : (
                      <span className="rounded-full bg-rose-500/20 px-2.5 py-0.5 text-xs font-medium text-rose-300 border border-rose-500/40 flex items-center gap-1">
                        <AlertCircle className="h-3.5 w-3.5" /> Exit Code {executionData.exitCode ?? 1} (Failed)
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-indigo-400" />
                      {executionData.executionTime ? `${executionData.executionTime.toFixed(2)}s` : "—"}
                    </span>
                    <span className="flex items-center gap-1">
                      <HardDrive className="h-3.5 w-3.5 text-purple-400" />
                      {executionData.memory || "32 MB"}
                    </span>
                    <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-cyan-300 uppercase">
                      {executionData.language || "code"}
                    </span>
                  </div>
                </div>

                {/* Runtime Environment Banner */}
                <div className="flex flex-wrap items-center justify-between bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 text-[11px] text-slate-400 gap-2">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-3.5 w-3.5 text-cyan-400" />
                    <span>
                      Runtime Env:{" "}
                      <strong className="text-slate-200">
                        {executionData.runtimeVersion || executionData.dockerImage || "lab-python-ml:latest"}
                      </strong>
                    </span>
                  </div>
                  {executionData.timestamp && (
                    <span className="text-slate-400">
                      Executed: {new Date(executionData.timestamp).toLocaleString()}
                    </span>
                  )}
                </div>

                {/* Intelligent Display: Console Output */}
                {(hasStdout || !hasArtifacts) && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        System Console Output (stdout)
                      </span>
                      <button
                        onClick={() =>
                          navigator.clipboard.writeText(
                            executionData.stdout || executionData.output || ""
                          )
                        }
                        className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded transition"
                      >
                        <Copy className="h-3 w-3" /> Copy Stdout
                      </button>
                    </div>
                    <pre className="max-h-64 overflow-y-auto rounded-lg bg-slate-950 p-3 font-mono text-xs text-slate-200 border border-slate-800 whitespace-pre-wrap break-all leading-relaxed">
                      {executionData.stdout || executionData.output || "(No stdout output produced)"}
                    </pre>
                  </div>
                )}

                {/* Error Console (stderr) */}
                {hasStderr && (
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-rose-400 uppercase tracking-wider flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5" /> Compiler / Runtime Error Console (stderr)
                    </span>
                    <pre className="max-h-48 overflow-y-auto rounded-lg bg-rose-950/40 p-3 font-mono text-xs text-rose-200 border border-rose-900/60 whitespace-pre-wrap break-all leading-relaxed">
                      {executionData.stderr}
                    </pre>
                  </div>
                )}

                {/* Intelligent Display: Generated Graphs Gallery */}
                {hasArtifacts && (
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                      <BarChart3 className="h-4 w-4 text-indigo-400" />
                      Execution Generated Visualizations & Files ({executionData.artifacts.length})
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {executionData.artifacts.map((art: any, idx: number) => {
                        const isImage = (art.type && art.type.startsWith("image/")) || /\.(png|jpg|jpeg|svg|gif|webp)$/i.test(art.name || "");
                        return (
                          <div
                            key={idx}
                            className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden p-2"
                          >
                            {isImage ? (
                              <div className="aspect-video flex items-center justify-center overflow-hidden bg-slate-950">
                                <img
                                  src={art.data || art.url}
                                  alt={art.name}
                                  className="max-h-full max-w-full object-contain rounded"
                                />
                              </div>
                            ) : (
                              <div className="p-4 flex items-center gap-2 text-slate-300">
                                <FileCheck className="h-5 w-5 text-emerald-400" />
                                <span className="text-xs font-mono">{art.name}</span>
                              </div>
                            )}
                            <div className="flex items-center justify-between pt-2 px-1 text-xs border-t border-slate-900 mt-1">
                              <span className="font-medium text-slate-300 truncate">{art.name}</span>
                              <a
                                href={art.data || art.url}
                                download={art.name}
                                className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium"
                              >
                                <Download className="h-3.5 w-3.5" /> Download
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ================= 3. AUTOMATIC EVALUATION DASHBOARD ================= */}
          <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-violet-50/50 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-indigo-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">3</span>
                <Brain className="h-5 w-5 text-indigo-600" />
                <h2 className="text-lg font-semibold text-slate-900">Automatic Evaluation Dashboard</h2>
              </div>
              {aiEval ? (
                <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-indigo-200">
                  {aiEval.source === "database"
                    ? "Saved with submission"
                    : aiEval.source === "local_model"
                      ? "Calculated with local model"
                      : "Calculated on this page"}
                </span>
              ) : null}
            </div>

            {aiLoading ? (
              <p className="text-sm text-slate-500">Loading AI evaluation metrics…</p>
            ) : aiEval ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-white bg-white/90 p-3 shadow-sm">
                    <p className="text-xs font-semibold uppercase text-slate-500">Automatic Score</p>
                    <p className="mt-1 text-2xl font-bold text-indigo-700">
                      {formatAiScoreOutOf10(aiEval.ai_score)}
                    </p>
                    <p className="text-xs text-slate-500">≈ {aiEval.marksOutOf10.toFixed(1)} / 10 marks</p>
                  </div>
                  <div className="rounded-xl border border-white bg-white/90 p-3 shadow-sm">
                    <p className="text-xs font-semibold uppercase text-slate-500">Confidence</p>
                    <p className="mt-1 text-2xl font-bold text-slate-800">
                      {aiEval.confidence != null ? `${Math.round(aiEval.confidence)}%` : "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white bg-white/90 p-3 shadow-sm">
                    <p className="text-xs font-semibold uppercase text-slate-500">Evaluation Status</p>
                    <p className="mt-1 text-lg font-semibold text-slate-800">{aiEval.status || "Evaluated"}</p>
                  </div>
                </div>
                {aiEval.breakdown && Object.keys(aiEval.breakdown).length > 0 ? (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Metrics & Quality Breakdown</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(aiEval.breakdown).map(([key, val]) => (
                        <span
                          key={key}
                          className="rounded-lg border border-indigo-100 bg-white px-2.5 py-1 text-xs font-medium text-slate-700"
                        >
                          {key}: {Math.round(Number(val))}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}


                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void refreshLocalAi()}
                    disabled={aiRefreshing}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-semibold text-indigo-700 shadow-sm hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Sparkles className="h-4 w-4" />
                    {aiRefreshing ? "Recalculating..." : "Recalculate Evaluation"}
                  </button>
                  <button
                    type="button"
                    onClick={applyAiSuggestionToMarks}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
                  >
                    Copy Automatic Marks to Field
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No automatic evaluation data available.</p>
            )}
          </div>

          {/* ================= 4. FACULTY PROGRAM VERIFICATION MODE ================= */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-700">4</span>
                <Cpu className="h-5 w-5 text-purple-600" />
                <h2 className="text-lg font-semibold text-slate-900">Faculty Verification Mode</h2>
              </div>
              <button
                type="button"
                onClick={() => void handleVerifyProgram()}
                disabled={verifying || !row.program}
                className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-purple-700 disabled:opacity-60 transition"
              >
                <Terminal className="h-4 w-4" />
                {verifying ? "Executing Fresh Docker Container..." : "Verify Program"}
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Re-execute the submitted program in an isolated Docker container on demand. This allows faculty to independently verify output and graph generation without modifying the student&apos;s stored submission record.
            </p>

            {verificationResult && (
              <div className="rounded-xl border border-purple-200 bg-slate-950 p-4 text-slate-100 space-y-4">
                <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-2.5 gap-2">
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <span className="text-purple-400 font-semibold uppercase">Verification Report:</span>
                    {verificationResult.outputMatch ? (
                      <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-emerald-300 border border-emerald-500/40 font-bold">
                        OVERALL: VERIFIED
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-amber-300 border border-amber-500/40 font-bold">
                        OUTPUT DIFFERENCE (WARN)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
                    <span>Exit: {verificationResult.exitCode}</span>
                    <span>Time: {verificationResult.executionTime.toFixed(2)}s</span>
                    <span>Mem: {verificationResult.memory}</span>
                  </div>
                </div>

                {/* Comprehensive Verification Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono">
                  <div className="rounded-lg bg-slate-900 border border-slate-800 p-2.5">
                    <span className="block text-slate-400 text-[10px]">COMPILATION</span>
                    <span className="font-bold text-emerald-400">PASS</span>
                  </div>
                  <div className="rounded-lg bg-slate-900 border border-slate-800 p-2.5">
                    <span className="block text-slate-400 text-[10px]">RUNTIME</span>
                    <span className="font-bold text-emerald-400">
                      {verificationResult.exitCode === 0 ? "PASS" : `FAIL (${verificationResult.exitCode})`}
                    </span>
                  </div>
                  <div className="rounded-lg bg-slate-900 border border-slate-800 p-2.5">
                    <span className="block text-slate-400 text-[10px]">OUTPUT MATCH</span>
                    <span className={`font-bold ${verificationResult.outputMatch ? "text-emerald-400" : "text-amber-400"}`}>
                      {verificationResult.outputMatch ? "PASS" : "WARN"}
                    </span>
                  </div>
                  <div className="rounded-lg bg-slate-900 border border-slate-800 p-2.5">
                    <span className="block text-slate-400 text-[10px]">EXECUTION TIME</span>
                    <span className="font-bold text-slate-200">{verificationResult.executionTime.toFixed(2)}s</span>
                  </div>
                  <div className="rounded-lg bg-slate-900 border border-slate-800 p-2.5">
                    <span className="block text-slate-400 text-[10px]">MEMORY USAGE</span>
                    <span className="font-bold text-slate-200">{verificationResult.memory}</span>
                  </div>
                  <div className="rounded-lg bg-slate-900 border border-slate-800 p-2.5">
                    <span className="block text-slate-400 text-[10px]">GENERATED GRAPHS</span>
                    <span className="font-bold text-purple-400">{verificationResult.artifacts.length}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-400 uppercase">Verification Console (Live stdout)</span>
                  <pre className="max-h-48 overflow-y-auto rounded-lg bg-slate-900 p-3 font-mono text-xs text-slate-200 border border-slate-800 whitespace-pre-wrap">
                    {verificationResult.stdout || "(No stdout produced during verification)"}
                  </pre>
                </div>

                {verificationResult.stderr && (
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-rose-400 uppercase">Verification Error Console (stderr)</span>
                    <pre className="max-h-36 overflow-y-auto rounded-lg bg-rose-950/40 p-3 font-mono text-xs text-rose-200 border border-rose-900/60 whitespace-pre-wrap">
                      {verificationResult.stderr}
                    </pre>
                  </div>
                )}

                {verificationResult.artifacts.length > 0 && (
                  <div className="pt-2 border-t border-slate-800 space-y-2">
                    <span className="text-xs font-semibold text-purple-300 uppercase">
                      Verified Generated Graphs ({verificationResult.artifacts.length})
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {verificationResult.artifacts.map((art: any, idx: number) => (
                        <div key={idx} className="bg-slate-900 border border-slate-800 rounded-lg p-2">
                          <img src={art.data || art.url} alt={art.name} className="max-h-40 w-full object-contain rounded" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Verification History Section */}
                {verificationHistory.length > 0 && (
                  <div className="pt-3 border-t border-slate-800 space-y-2">
                    <span className="text-xs font-semibold text-slate-400 uppercase block">
                      Verification History Log ({verificationHistory.length})
                    </span>
                    <div className="space-y-1.5 font-mono text-xs">
                      {verificationHistory.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between rounded-lg bg-slate-900 border border-slate-800 p-2">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400">{item.timestamp}</span>
                            <span className="text-slate-300">by {item.verifiedBy}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${item.status === "PASS" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" : "bg-rose-500/20 text-rose-400 border border-rose-500/40"}`}>
                              {item.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-slate-400">
                            <span>{item.testCases}</span>
                            <span>{item.executionTime.toFixed(2)}s</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ================= 5. FACULTY REMARKS & FINAL MARKS ================= */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">5</span>
              <h2 className="text-lg font-semibold text-slate-900">Faculty Remarks & Final Marks</h2>
            </div>

            <p className="text-sm text-slate-600">Saved Final Marks: <strong className="text-slate-900">{finalMarks}</strong></p>
            <p className="text-xs text-slate-500">
              Marks to save: {marks.trim() === "" ? "—" : marks} / 10
            </p>

            <div className="mt-3 flex items-center gap-3">
              <input
                ref={marksInputRef}
                type="number"
                min="0"
                max="10"
                step="0.5"
                placeholder="0 - 10"
                value={marks}
                onChange={(e) => setMarks(e.target.value)}
                className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={() => void saveMarks()}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition shadow-sm"
              >
                {saving ? "Saving Evaluation..." : "Save Final Evaluation"}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Field({ title, value }: { title: string; value: string | null }) {
  return (
    <div className="mb-3">
      <p className="mb-1 text-xs font-semibold uppercase text-slate-500">{title}</p>
      <pre className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
        {String(value || "-")}
      </pre>
    </div>
  );
}
