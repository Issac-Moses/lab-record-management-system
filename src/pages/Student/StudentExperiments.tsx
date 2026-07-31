import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
// @ts-ignore – JS file without declaration file
import { getStatusConfig } from "@/utils/statusConfig";
import { getStudentExperimentData } from "@/utils/unifiedStudentData";
import { useSelectedSubject } from "@/context/SubjectContext";
import { sortByExperimentNo } from "@/utils/experimentOrder";
import { applyOoseExperimentOrderIfNeeded } from "@/utils/ooseExperimentOrder";
import { supabase } from "@/lib/supabase";
import { repairLeadingTitle } from "@/utils/titleRepair";
import {
  isNndlSubjectName,
  shouldHideLegacyNndlUnifiedExperiment,
} from "@/utils/nndlExperimentFilter";
import { motion } from "framer-motion";
import { ExperimentsSkeleton } from "@/components/ui/StudentSkeletons";
import EmptyState from "@/components/ui/EmptyState";
import ErrorScreen from "@/components/ui/ErrorScreen";
import { ArrowLeft, Clock, AlertTriangle, Lock, X } from "lucide-react";

const STUDENT_DATA_UPDATED_EVENT = "student-data-updated";
type ExperimentRow = {
  id: string;
  experimentId: string;
  experimentNo: number;
  title: string;
  status: string;
  effectiveStatus: string;
  finalMarks: number;
  dueDate?: string | null;
  submittedDate?: string | null;
};

function getOpenLabel(status: string): string {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "locked") return "Locked";
  if (normalized === "draft" || normalized === "in_progress") return "Continue Draft";
  if (normalized === "submitted") return "View Submission";
  if (normalized === "evaluated" || normalized === "completed") return "Review Experiment";
  return "Start Experiment";
}

function getWorkspaceHint(status: string): string {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "locked") return "Complete previous experiments to unlock this one.";
  if (normalized === "draft") return "Continue editing your saved draft.";
  if (normalized === "submitted") return "View your submitted lab record.";
  if (normalized === "evaluated" || normalized === "completed") {
    return "Reopen to review faculty feedback and evaluated marks.";
  }
  return "Start filling Aim, Procedure, Code, Output and Result.";
}

function applySequentialUnlock(rows: ExperimentRow[]): ExperimentRow[] {
  let canUnlockNext = true;

  return rows.map((row) => {
    const actual = String(row.status || "").trim().toLowerCase();
    const isCompletedStep =
      actual === "submitted" || actual === "evaluated" || actual === "completed";
    const isDraft = actual === "draft" || actual === "in_progress";

    if (isCompletedStep) {
      canUnlockNext = true;
      return { ...row, effectiveStatus: actual };
    }

    if (isDraft) {
      canUnlockNext = false;
      return { ...row, effectiveStatus: "draft" };
    }

    if (canUnlockNext) {
      canUnlockNext = false;
      return { ...row, effectiveStatus: "unlocked" };
    }

    return { ...row, effectiveStatus: "locked" };
  });
}

export default function StudentExperiments() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { selectedSubjectId } = useSelectedSubject();
  const querySubjectId = searchParams.get("subject");
  const querySubjectName = searchParams.get("subjectName");
  const subjectId =
    selectedSubjectId ||
    querySubjectId ||
    localStorage.getItem("student_subject_id");
  const [experiments, setExperiments] = useState<ExperimentRow[]>([]);
  const [activeTab, setActiveTab] = useState<"all" | "pending" | "submitted" | "evaluated" | "draft">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeadlineDismissed, setIsDeadlineDismissed] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      if (!subjectId) {
        setExperiments([]);
        return;
      }
      const unified = await getStudentExperimentData({
        subjectId,
        subjectName:
          querySubjectName ||
          localStorage.getItem("student_subject_name") ||
          "",
        searchParams,
      });
      const mapped = sortByExperimentNo(
        unified.experiments.map((row) => ({
        id: row.id,
        experimentId: row.experimentId,
        experimentNo: row.experimentNo,
        title: row.title,
        status: row.status,
        effectiveStatus: row.status,
        finalMarks: row.finalMarks,
        dueDate: (row as any).dueDate || null,
        submittedDate: row.submittedDate,
        })),
        (row) => row.experimentNo
      );
      if (mapped.length > 0) {
        setExperiments(applySequentialUnlock(mapped));
      } else {
        // Hard fallback: show subject experiment master list even if student rows are missing.
        const subjectNameCandidate =
          querySubjectName ||
          searchParams.get("subjectName") ||
          localStorage.getItem("student_subject_name") ||
          "";
        let subjectIdsToTry = [String(subjectId || "").trim()].filter(Boolean);
        if (subjectNameCandidate) {
          const subjectLookup = await supabase
            .from("subjects")
            .select("id")
            .eq("name", subjectNameCandidate);
          const lookupIds = (Array.isArray(subjectLookup.data) ? subjectLookup.data : [])
            .map((row) => String((row as Record<string, unknown>)?.id || "").trim())
            .filter(Boolean);
          subjectIdsToTry = [...new Set([...subjectIdsToTry, ...lookupIds])];
        }

        let experimentRows: Array<Record<string, unknown>> = [];
        let resolvedSubjectId = "";
        for (const candidateSubjectId of subjectIdsToTry) {
          const experimentsRes = await supabase
            .from("experiments")
            .select("id,title,experiment_no")
            .eq("subject_id", candidateSubjectId)
            .order("experiment_no", { ascending: true });
          if (!experimentsRes.error && Array.isArray(experimentsRes.data) && experimentsRes.data.length > 0) {
            experimentRows = experimentsRes.data as Array<Record<string, unknown>>;
            resolvedSubjectId = candidateSubjectId;
            break;
          }
        }

        if (resolvedSubjectId && resolvedSubjectId !== String(subjectId)) {
          localStorage.setItem("student_subject_id", resolvedSubjectId);
          if (subjectNameCandidate) localStorage.setItem("student_subject_name", subjectNameCandidate);
        }

        const rawFallback = experimentRows.map((row, index) => ({
          id: String(row?.id || `exp-${index + 1}`),
          experimentId: String(row?.id || `exp-${index + 1}`),
          experimentNo: Number(row?.experiment_no) || 0,
          title: repairLeadingTitle(String(row?.title || `Experiment ${index + 1}`)),
          status: "pending",
          effectiveStatus: "locked",
          finalMarks: 0,
        }));
        let fallbackMapped = sortByExperimentNo(rawFallback, (row) => row.experimentNo);
        fallbackMapped = applyOoseExperimentOrderIfNeeded(
          String(resolvedSubjectId || subjectId),
          subjectNameCandidate,
          fallbackMapped,
          (row) => row.title
        );
        if (isNndlSubjectName(subjectNameCandidate)) {
          fallbackMapped = fallbackMapped.filter(
            (row) =>
              !shouldHideLegacyNndlUnifiedExperiment(subjectNameCandidate, row.experimentNo, row.title)
          );
        }
        fallbackMapped = fallbackMapped.map((row, index) => ({
          ...row,
          experimentNo: Number(row?.experimentNo) || 0,
        }));
        setExperiments(applySequentialUnlock(fallbackMapped));
      }
    } catch (fetchErr) {
      setError(fetchErr instanceof Error ? fetchErr.message : "Unable to load experiments.");
    } finally {
      setLoading(false);
    }
  }, [querySubjectName, searchParams, subjectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredExperiments = useMemo(() => {
    if (activeTab === "all") return experiments;
    return experiments.filter((exp) => {
      const normalized = String(exp.effectiveStatus || exp.status || "").trim().toLowerCase();
      if (activeTab === "evaluated") return normalized === "evaluated" || normalized === "completed";
      if (activeTab === "pending") return normalized === "unlocked";
      if (activeTab === "draft") return normalized === "draft";
      if (activeTab === "submitted") return normalized === "submitted";
      if (activeTab === "locked") return normalized === "locked";
      return normalized === activeTab;
    });
  }, [activeTab, experiments]);

  useEffect(() => {
    const onDataUpdated = () => {
      void fetchData();
    };
    window.addEventListener(STUDENT_DATA_UPDATED_EVENT, onDataUpdated);
    return () => {
      window.removeEventListener(STUDENT_DATA_UPDATED_EVENT, onDataUpdated);
    };
  }, [fetchData]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchData();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="student-page-enter faculty-bg-vibrant min-h-screen px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-[1280px]">
          <ExperimentsSkeleton />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="student-page-enter faculty-bg-vibrant min-h-screen px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-[1280px] rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <ErrorScreen message={error} onRetry={() => void fetchData()} />
        </div>
      </div>
    );
  }

  if (!subjectId) {
    return (
      <div className="student-page-enter faculty-bg-vibrant min-h-screen px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-[1280px] rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <EmptyState
            title="Select a subject first"
            description="Choose a subject from your list to view and start experiments."
            action={{
              label: "Go to subjects",
              onClick: () => navigate("/student/subjects"),
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="student-page-enter faculty-bg-vibrant min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-[1280px]">
        <div className="mb-6 flex items-start gap-4">
          <button
            onClick={() => navigate(-1)}
            className="mt-1 flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-sm transition-colors cursor-pointer shrink-0"
            title="Go Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold text-slate-900">Student Experiments</h1>
            <p className="mt-1 text-xs text-slate-500">
              Use this page to start or continue experiments. Submission review and mark history are in Submissions.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0 self-center">
            <button
              type="button"
              onClick={() => void fetchData()}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs transition"
            >
              Refresh
            </button>
            <span className="text-sm text-slate-500">{experiments.length} experiments</span>
          </div>
        </div>

        {(() => {
          if (isDeadlineDismissed) return null;
          const urgentDeadlines = experiments.filter((e) => {
            if (!e.dueDate) return false;
            const st = String(e.effectiveStatus || "").toLowerCase();
            if (st === "submitted" || st === "evaluated" || st === "completed") return false;
            const due = new Date(e.dueDate);
            if (isNaN(due.getTime())) return false;
            const diffHours = (due.getTime() - Date.now()) / (1000 * 60 * 60);
            return diffHours <= 48;
          });
          if (urgentDeadlines.length === 0) return null;

          const expNames = urgentDeadlines.map(e => `Exp ${e.experimentNo || "-"}`).join(", ");

          return (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 relative flex items-start sm:items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-sm"
            >
              <div className="flex items-start sm:items-center gap-3 pr-6">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                  <Clock className="h-5 w-5 text-amber-600 animate-pulse" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-amber-900">Deadline Notice</h4>
                  <p className="text-xs text-amber-800/90 mt-0.5">
                    You have {urgentDeadlines.length} experiment{urgentDeadlines.length > 1 ? "s" : ""} due soon ({expNames}). Complete and submit before the faculty deadline to avoid late flags.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDeadlineDismissed(true)}
                className="absolute right-3 top-3 sm:top-1/2 sm:-translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full text-amber-700 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                aria-label="Dismiss notice"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          );
        })()}

        <div className="mb-5 flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white/80 p-1 backdrop-blur-sm">
          {[
            { key: "all", label: "All" },
            { key: "pending", label: "Available" },
            { key: "draft", label: "Drafts" },
            { key: "submitted", label: "Submitted" },
            { key: "evaluated", label: "Completed" },
            { key: "locked", label: "Locked" },
          ].map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className={`min-h-[44px] rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  active
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {filteredExperiments.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <EmptyState
              title="No experiments here"
              description={
                activeTab === "all"
                  ? "No experiments are available for this subject yet."
                  : `No experiments match the "${activeTab}" filter. Try another tab or refresh.`
              }
              action={{
                label: activeTab === "all" ? "Refresh" : "Show all",
                onClick: () => (activeTab === "all" ? void fetchData() : setActiveTab("all")),
              }}
            />
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filteredExperiments.map((experiment, index) => {
              const normalizedStatus = String(experiment.effectiveStatus || "").toLowerCase();
              const statusLabel =
                normalizedStatus === "completed" || normalizedStatus === "evaluated"
                  ? "Completed"
                  : normalizedStatus === "submitted"
                    ? "Submitted"
                    : normalizedStatus === "draft"
                      ? "Draft"
                      : normalizedStatus === "locked"
                        ? "Locked"
                        : "Available";

              const showMarks =
                (normalizedStatus === "evaluated" || normalizedStatus === "completed") &&
                Number(experiment.finalMarks || 0) > 0;
              const isLocked = normalizedStatus === "locked";
              const toneClass =
                normalizedStatus === "completed" || normalizedStatus === "evaluated"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : normalizedStatus === "submitted"
                    ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                    : normalizedStatus === "draft"
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : normalizedStatus === "locked"
                        ? "border-slate-200 bg-slate-100 text-slate-500"
                        : "border-blue-200 bg-blue-50 text-blue-700";
              return (
                <motion.div
                  key={experiment.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03, duration: 0.18, ease: "easeOut" }}
                  whileHover={{ y: -3, scale: 1.01 }}
                  className="student-card-interactive student-row faculty-surface relative min-h-[330px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/40 transition-all duration-200 hover:border-blue-200 hover:shadow-[0_10px_24px_rgba(37,99,235,0.12)]"
                >
                  <div className="p-5">
                    <div className="mb-4 flex items-start gap-3">
                      <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border text-sm font-bold ${toneClass}`}>
                        {experiment.experimentNo}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="line-clamp-2 text-base font-semibold text-slate-900">{experiment.title}</h3>
                        <p className="mt-1 text-xs text-slate-500">{getWorkspaceHint(experiment.effectiveStatus)}</p>
                      </div>
                    </div>

                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <span className={`student-status-badge inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass}`}>
                        {statusLabel}
                      </span>
                      {showMarks && (
                        <span className="student-status-badge inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 font-bold">
                          {experiment.finalMarks}/10
                        </span>
                      )}
                      {showMarks && (
                        <span className="student-status-badge inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                          Faculty Verified
                        </span>
                      )}
                      {experiment.dueDate && !isLocked && (() => {
                        const due = new Date(experiment.dueDate);
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
                        const isCompleted = normalizedStatus === "submitted" || normalizedStatus === "evaluated" || normalizedStatus === "completed";
                        const isLateSubmission = isCompleted && experiment.submittedDate && new Date(experiment.submittedDate).getTime() > due.getTime();
                        const isOverduePending = !isCompleted && diffMs < 0;
                        const isUrgent = !isCompleted && diffHours > 0 && diffHours <= 48;

                        if (isLateSubmission) {
                          return (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                              <Clock className="h-3 w-3" /> Late Submission
                            </span>
                          );
                        }
                        if (isOverduePending) {
                          return (
                            <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
                              <Clock className="h-3 w-3" /> Overdue ({formattedDate})
                            </span>
                          );
                        }
                        if (isUrgent) {
                          return (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 animate-pulse">
                              <Clock className="h-3 w-3 text-amber-600" /> Due in {Math.max(1, Math.round(diffHours))}h
                            </span>
                          );
                        }
                        return (
                          <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50/80 px-2.5 py-1 text-xs font-semibold text-blue-700">
                            <Clock className="h-3 w-3" /> Due: {formattedDate}
                          </span>
                        );
                      })()}
                    </div>

                    <div className="mt-auto">
                      <button
                        type="button"
                        onClick={() => {
                          if (isLocked) return;
                          const subjectQuery = subjectId ? `?subject=${encodeURIComponent(subjectId)}` : "";
                          navigate(`/student/experiments/${experiment.experimentId}/submit${subjectQuery}`);
                        }}
                        disabled={isLocked}
                        className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold shadow-xs transition ${
                          isLocked
                            ? "cursor-not-allowed border-slate-200 bg-slate-100/60 text-slate-400 opacity-75"
                            : normalizedStatus === "completed" || normalizedStatus === "evaluated"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold"
                              : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                        }`}
                      >
                        {isLocked ? (
                          <>
                            <Lock className="h-3.5 w-3.5 text-slate-400" />
                            <span>Locked</span>
                          </>
                        ) : (
                          getOpenLabel(experiment.effectiveStatus)
                        )}
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
