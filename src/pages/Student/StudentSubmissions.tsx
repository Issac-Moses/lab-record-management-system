import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { fadeUp, staggerContainer } from "@/animations/motion";
import { SubmissionsSkeleton } from "@/components/ui/StudentSkeletons";
import EmptyState from "@/components/ui/EmptyState";
import ErrorScreen from "@/components/ui/ErrorScreen";
import {
  getSelectedSubjectFromStorage,
  useSelectedSubject,
} from "@/context/SubjectContext";
// @ts-ignore – JS file without declaration file
import { getStatusConfig } from "@/utils/statusConfig";
// @ts-ignore – JS file without declaration file
import { formatDateTime } from "@/utils/dateFormat";
import { getStudentExperimentData, type UnifiedExperiment } from "@/utils/unifiedStudentData";
import { sortByExperimentNo } from "@/utils/experimentOrder";
import { applyOoseExperimentOrderIfNeeded } from "@/utils/ooseExperimentOrder";
import { repairLeadingTitle } from "@/utils/titleRepair";
import {
  FileCheck2,
  ArrowLeft,
  Download,
  Award,
  Eye,
  RefreshCw,
  Lock,
  Pencil,
} from "lucide-react";

type Submission = UnifiedExperiment;
const STUDENT_DATA_UPDATED_EVENT = "student-data-updated";
const REALTIME_DISABLED_KEY = "realtime_disabled_student_submissions";

export default function StudentSubmissions() {
  const STUDENT_SUBMISSIONS_ERROR =
    "Unable to load submissions right now. Please try again.";
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { selectedSubjectId, selectedSubjectName } = useSelectedSubject();
  const querySubjectId = searchParams.get("subject");
  const querySubjectName = searchParams.get("subjectName");
  const subjectFilterId = selectedSubjectId || querySubjectId || localStorage.getItem("student_subject_id");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileRegNo, setProfileRegNo] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [demoModeActive, setDemoModeActive] = useState(false);
  const [downloadingRecord, setDownloadingRecord] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [activeSubmissionId, setActiveSubmissionId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!subjectFilterId) return;
    try {
      setError(null);
      setPdfError(null);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        navigate("/login");
        return;
      }
      setCurrentUserId(user.id);

      const unified = await getStudentExperimentData({
        subjectId: subjectFilterId,
        subjectName:
          selectedSubjectName ||
          querySubjectName ||
          getSelectedSubjectFromStorage().subjectName ||
          "",
        searchParams,
      });
      setProfileName(unified.profile.studentName);
      setProfileRegNo(unified.profile.registerNo);
      setDemoModeActive(unified.demoModeActive);
      const unifiedRows = sortByExperimentNo(unified.experiments, (row) => row.experimentNo);
      if (unifiedRows.length > 0) {
        setSubmissions(unifiedRows);
      } else {
        const subjectNameCandidate =
          selectedSubjectName ||
          querySubjectName ||
          getSelectedSubjectFromStorage().subjectName ||
          "";
        let subjectIdsToTry = [String(subjectFilterId || "").trim()].filter(Boolean);
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

        if (resolvedSubjectId && resolvedSubjectId !== String(subjectFilterId)) {
          localStorage.setItem("student_subject_id", resolvedSubjectId);
          if (subjectNameCandidate) localStorage.setItem("student_subject_name", subjectNameCandidate);
        }

        const rawFallback = experimentRows.map((row, index) => ({
          id: String(row?.id || `exp-${index + 1}`),
          experimentId: String(row?.id || `exp-${index + 1}`),
          experimentNo: Number(row?.experiment_no) || 0,
          title: repairLeadingTitle(String(row?.title || `Experiment ${index + 1}`)),
          status: "pending",
          marks: 0,
          facultyMarks: null,
          finalMarks: 0,
          aiScore: null,
          updatedAt: null,
        })) as Submission[];
        let fallbackRows = sortByExperimentNo(rawFallback, (row) => row.experimentNo);
        fallbackRows = applyOoseExperimentOrderIfNeeded(
          String(resolvedSubjectId || subjectFilterId),
          subjectNameCandidate,
          fallbackRows,
          (row) => row.title
        ).map((row, index) => ({
          ...row,
          experimentNo: Number(row?.experimentNo) || 0,
        })) as Submission[];
        setSubmissions(fallbackRows);
      }
    } catch (err) {
      console.error("Student submissions load failed:", err);
      setError(STUDENT_SUBMISSIONS_ERROR);
    } finally {
      setLoading(false);
    }
  }, [navigate, querySubjectName, subjectFilterId, searchParams, selectedSubjectName]);

  const handleRefresh = () => {
    void fetchData();
  };

  useEffect(() => {
    if (!subjectFilterId) {
      setLoading(false);
      return;
    }
    fetchData();
  }, [subjectFilterId, fetchData]);

  useEffect(() => {
    if (!subjectFilterId) return;
    if (sessionStorage.getItem(REALTIME_DISABLED_KEY) === "1") return;
    const channel = supabase
      .channel("submissions-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "submissions",
          filter: `subject_id=eq.${subjectFilterId}`,
        },
        (payload) => {
          const row = (payload.new || payload.old) as { subject_id?: string; student_id?: string };
          if (String(row?.subject_id || "") !== String(subjectFilterId || "")) return;
          if (currentUserId && String(row?.student_id || "") !== String(currentUserId)) return;
          fetchData();
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          sessionStorage.setItem(REALTIME_DISABLED_KEY, "1");
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [subjectFilterId, currentUserId, fetchData]);

  useEffect(() => {
    if (!subjectFilterId) return;
    const onFocus = () => fetchData();
    const onDataUpdated = () => fetchData();
    window.addEventListener("focus", onFocus);
    window.addEventListener(STUDENT_DATA_UPDATED_EVENT, onDataUpdated);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(STUDENT_DATA_UPDATED_EVENT, onDataUpdated);
    };
  }, [subjectFilterId, fetchData]);

  const handleGeneratePdf = async () => {
    if (!subjectFilterId) return;
    setDownloadingRecord(true);
    setPdfError(null);
    try {
      const storedSubject = getSelectedSubjectFromStorage();
      const resolvedSubjectName =
        selectedSubjectName || querySubjectName || storedSubject.subjectName || "LAB SUBJECT";
      const unified = await getStudentExperimentData({
        subjectId: subjectFilterId,
        subjectName: resolvedSubjectName,
        searchParams,
      });
      const { generateRecordPdf } = await import("@/pdf/recordPdfGenerator");
      await generateRecordPdf({
        collegeName: "ST. PETER'S COLLEGE OF ENGINEERING AND TECHNOLOGY",
        subjectName: resolvedSubjectName,
        studentName: unified.profile.studentName || profileName || "Student",
        registerNo: unified.profile.registerNo || profileRegNo || "N/A",
        yearSemester: unified.profile.yearSemester,
        branch: unified.profile.department || "INFORMATION TECHNOLOGY",
        departmentName: `DEPARTMENT OF ${String(unified.profile.department || "INFORMATION TECHNOLOGY").toUpperCase()}`,
        data: unified,
      });
    } catch (error) {
      console.error("Record PDF generation failed:", error);
      const detail = error instanceof Error ? error.message : "Unknown error";
      setPdfError(`Unable to generate record PDF right now. ${detail}`);
    } finally {
      setDownloadingRecord(false);
    }
  };

  const displayStatuses = useMemo(() => {
    let canUnlockNext = true;
    const map = new Map<string, string>();
    submissions.forEach((sub) => {
      const normalized = String(sub.status || "").trim().toLowerCase();
      const isCompleted =
        normalized === "submitted" || normalized === "evaluated" || normalized === "completed";
      const isDraft = normalized === "draft" || normalized === "in_progress";

      if (isCompleted) {
        map.set(String(sub.id), normalized);
        canUnlockNext = true;
        return;
      }
      if (isDraft) {
        map.set(String(sub.id), "draft");
        canUnlockNext = false;
        return;
      }
      if (canUnlockNext) {
        map.set(
          String(sub.id),
          normalized === "pending" || !normalized || normalized === "locked"
            ? "unlocked"
            : normalized
        );
        canUnlockNext = false;
        return;
      }
      map.set(String(sub.id), "locked");
    });
    return map;
  }, [submissions]);

  if (loading) {
    return <SubmissionsSkeleton />;
  }

  if (!subjectFilterId) {
    return (
      <div className="faculty-bg-vibrant min-h-screen px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto w-full max-w-[1380px] faculty-surface p-6">
          <button
            onClick={() => navigate("/student/subjects")}
            className="min-h-[44px] rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100"
          >
            Select subject first
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="faculty-bg-vibrant min-h-screen px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto w-full max-w-[1380px]">
        <ErrorScreen message={error || STUDENT_SUBMISSIONS_ERROR} onRetry={handleRefresh} />
        </div>
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="faculty-bg-vibrant min-h-screen px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto w-full max-w-[1380px] faculty-surface p-8">
        <EmptyState
          icon={<FileCheck2 className="w-12 h-12" />}
          title="No Submissions Yet"
          description="Complete experiments to see them here."
          action={{
            label: "Go to Experiments",
            onClick: () => navigate("/student/experiments"),
          }}
        />
        </div>
      </div>
    );
  }

  const statusBadgeMap: Record<string, string> = {
    evaluated: "border-emerald-200 bg-emerald-50 text-emerald-700",
    completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
    submitted: "border-indigo-200 bg-indigo-50 text-indigo-700",
    unlocked: "border-blue-200 bg-blue-50 text-blue-700",
    locked: "border-slate-200 bg-slate-100 text-slate-500",
    draft: "border-amber-200 bg-amber-50 text-amber-800",
    resubmit: "border-indigo-200 bg-indigo-50 text-indigo-700",
    pending: "border-blue-200 bg-blue-50 text-blue-700",
  };

  const statusLegend = [
    { key: "evaluated", label: "Evaluated", dot: "bg-emerald-500" },
    { key: "submitted", label: "Submitted", dot: "bg-indigo-500" },
    { key: "draft", label: "Draft", dot: "bg-amber-500" },
    { key: "unlocked", label: "Available", dot: "bg-blue-500" },
    { key: "locked", label: "Locked", dot: "bg-slate-400" },
  ];

  const expBadgeColorMap: Record<string, string> = {
    evaluated: "border-emerald-200 bg-emerald-50 text-emerald-700",
    completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
    submitted: "border-indigo-200 bg-indigo-50 text-indigo-700",
    unlocked: "border-blue-200 bg-blue-50 text-blue-700",
    locked: "border-slate-200 bg-slate-100 text-slate-500",
    draft: "border-amber-200 bg-amber-50 text-amber-800",
    resubmit: "border-indigo-200 bg-indigo-50 text-indigo-700",
    pending: "border-blue-200 bg-blue-50 text-blue-700",
  };

  return (
    <div className="student-page-enter faculty-bg-vibrant min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto w-full max-w-[1380px]">
      {pdfError && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {pdfError}
        </div>
      )}
      {/* HEADER */}
      <motion.div
        {...fadeUp}
        className="faculty-glass faculty-gradient-ring relative mb-6 rounded-3xl p-6"
      >
        <div className="absolute -top-6 -left-6 h-72 w-72 rounded-full bg-blue-200/50 blur-3xl pointer-events-none" />
        <div className="absolute -top-4 right-12 h-48 w-48 rounded-full bg-indigo-200/50 blur-2xl pointer-events-none" />

        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/student")}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/85 px-3 py-2 text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-3xl font-bold tracking-tight text-transparent">My Submissions</h1>
              <p className="mt-0.5 text-sm text-slate-600">Track your experiment progress and record readiness</p>
            </div>
            {demoModeActive && (
              <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                Demo Mode Active
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-slate-600 transition hover:bg-slate-50 hover:text-blue-700"
              title="Refresh submissions"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-sm font-semibold text-blue-700">
              <FileCheck2 className="w-4 h-4" />
              {submissions.length} experiment{submissions.length !== 1 ? "s" : ""}
            </span>
            <button
              onClick={handleGeneratePdf}
              disabled={downloadingRecord}
              className="student-btn-primary flex min-h-[44px] items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-all duration-150 hover:shadow-[0_12px_24px_rgba(37,99,235,0.2)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="w-3.5 h-3.5" />
              {downloadingRecord ? "Preparing..." : "Download Full Record PDF"}
            </button>
          </div>
        </div>
      </motion.div>

      <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
        Showing all experiments with submission status and sequential lock/unlock badges.
      </div>

      {/* LIST */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="animate"
        className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3"
      >
        {submissions.map((sub, index) => {
          const normalized = (sub.status || "").trim().toLowerCase();
          const displayStatus = displayStatuses.get(String(sub.id)) || normalized || "pending";
          const statusClass = statusBadgeMap[displayStatus] || statusBadgeMap.pending;
          const badgeColor = expBadgeColorMap[displayStatus] || expBadgeColorMap.pending;
          const cfg = getStatusConfig(sub.status, sub.submittedDate || sub.updatedAt, sub.dueDate || (sub as any).deadline_date || null);
          const statusLabel =
            displayStatus === "locked"
              ? "Locked"
              : displayStatus === "draft"
                ? "Draft"
                : displayStatus === "unlocked"
                  ? "Available"
                  : cfg.label;
          const displayMarks = Math.max(
            Number(sub.finalMarks || 0),
            Number(sub.marks || 0),
            Number(sub.facultyMarks || 0),
            Number(sub.aiScore || 0)
          );
          const isFacultyEvaluated = normalized === "evaluated" || normalized === "completed";
          const hasFacultyVerified = isFacultyEvaluated && displayMarks > 0;

          return (
            <motion.div
              key={sub.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06, duration: 0.2, ease: "easeOut" }}
              whileHover={{ y: -3, scale: 1.01, transition: { duration: 0.18 } }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setActiveSubmissionId(String(sub.id))}
              className={`student-card-interactive student-row faculty-surface relative min-h-[330px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/40 transition-all duration-200 hover:border-blue-200 hover:shadow-[0_10px_24px_rgba(37,99,235,0.12)] ${activeSubmissionId === String(sub.id) ? "student-row-active" : ""}`}
            >
              <div className="p-5">
                <div className="flex items-start gap-3 mb-4">
                  <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border text-sm font-bold ${badgeColor}`}>
                    {sub.experimentNo || "?"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h3 className="truncate text-sm font-semibold leading-snug text-slate-900">
                      {sub.title || "Untitled"}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {sub.updatedAt ? formatDateTime(sub.updatedAt) : "No submission timestamp"}
                    </p>
                  </div>
                  <span
                    className={`student-status-badge inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass}`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                    {statusLabel}
                  </span>
                </div>

                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {hasFacultyVerified && (
                    <span className="student-status-badge inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 font-bold">
                      Faculty Verified
                    </span>
                  )}
                </div>

                {isFacultyEvaluated && displayMarks > 0 ? (
                  <div className="mb-4">
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-700">
                      <Award className="w-3.5 h-3.5 text-emerald-600" />
                      {displayMarks} marks
                    </span>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Evaluated by Faculty
                    </p>
                  </div>
                ) : (
                  <p className="mb-4 text-xs text-slate-500">
                    Marks pending. Faculty evaluation not published yet.
                  </p>
                )}

                <div className="flex gap-2">
                  {displayStatus === "locked" ? (
                    <button
                      type="button"
                      disabled
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100/60 px-3.5 py-1.5 text-xs font-semibold text-slate-400 opacity-75 cursor-not-allowed"
                    >
                      <Lock className="h-3.5 w-3.5" />
                      Locked
                    </button>
                  ) : displayStatus === "unlocked" ? (
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/student/experiments/${sub.experimentId || sub.id}/submit?subject=${subjectFilterId}`)
                      }
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-800 shadow-xs hover:bg-slate-50 transition-all"
                    >
                      <Pencil className="h-3.5 w-3.5 text-slate-600" />
                      Start Experiment
                    </button>
                  ) : displayStatus === "draft" ? (
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/student/experiments/${sub.experimentId || sub.id}/submit?subject=${subjectFilterId}`)
                      }
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-slate-300 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-slate-800 shadow-xs hover:bg-slate-100 transition-all"
                    >
                      <Pencil className="h-3.5 w-3.5 text-slate-600" />
                      Continue Draft
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/student/experiments/${sub.experimentId || sub.id}/submit?subject=${subjectFilterId}&readonly=1`)
                      }
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-800 shadow-xs hover:bg-slate-50 transition-all"
                    >
                      <Eye className="h-3.5 w-3.5 text-slate-600" />
                      View Submission
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* STATUS LEGEND */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.12, duration: 0.2, ease: "easeOut" }}
        className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 rounded-xl border border-slate-200 bg-white/80 p-3"
      >
        {statusLegend.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            <span className={`h-2 w-2 rounded-full ${s.dot}`} />
            {s.label}
          </span>
        ))}
      </motion.div>
      </div>
    </div>
  );
}
