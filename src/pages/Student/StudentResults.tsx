import { useCallback, useEffect, useMemo, useState } from "react";
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
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft,
  Award,
  BarChart3,
  FileCheck2,
  LayoutGrid,
  RefreshCw,
  Table2,
  TrendingUp,
} from "lucide-react";

const STUDENT_DATA_UPDATED_EVENT = "student-data-updated";
const STUDENT_RESULTS_ERROR = "Unable to load results right now. Please try again.";

export default function StudentResults() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { selectedSubjectId, selectedSubjectName } = useSelectedSubject();
  const querySubjectId = searchParams.get("subject");
  const querySubjectName = searchParams.get("subjectName");
  const subjectFilterId =
    selectedSubjectId || querySubjectId || localStorage.getItem("student_subject_id");
  const [rows, setRows] = useState<UnifiedExperiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profileName, setProfileName] = useState("");
  const [demoModeActive, setDemoModeActive] = useState(false);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  const fetchData = useCallback(async () => {
    if (!subjectFilterId) return;
    try {
      setError(null);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        navigate("/login");
        return;
      }

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
      setDemoModeActive(unified.demoModeActive);

      const unifiedRows = sortByExperimentNo(unified.experiments, (r) => r.experimentNo);
      if (unifiedRows.length > 0) {
        setRows(unifiedRows);
        return;
      }

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
        isOverridden: false,
        evaluationSource: "ai" as const,
        updatedAt: null,
        submittedDate: null,
        isCompleted: false,
        aim: "",
        algorithm: "",
        program: "",
        output: "",
        result: "",
        images: [],
        aiScore: null,
        confidence: null,
        aiStatus: null,
        aiBreakdown: null,
      }));
      let fallbackRows = sortByExperimentNo(rawFallback, (r) => r.experimentNo);
      fallbackRows = applyOoseExperimentOrderIfNeeded(
        String(resolvedSubjectId || subjectFilterId),
        subjectNameCandidate,
        fallbackRows,
        (r) => r.title
      ).map((row) => ({
        ...row,
        experimentNo: Number(row?.experimentNo) || 0,
      }));
      setRows(fallbackRows);
    } catch (fetchErr) {
      console.error("Student results load failed:", fetchErr);
      setError(STUDENT_RESULTS_ERROR);
    } finally {
      setLoading(false);
    }
  }, [navigate, querySubjectName, subjectFilterId, searchParams, selectedSubjectName]);

  useEffect(() => {
    if (!subjectFilterId) {
      setLoading(false);
      return;
    }
    fetchData();
  }, [subjectFilterId, fetchData]);

  useEffect(() => {
    if (!subjectFilterId) return;
    const onDataUpdated = () => void fetchData();
    window.addEventListener(STUDENT_DATA_UPDATED_EVENT, onDataUpdated);
    return () => window.removeEventListener(STUDENT_DATA_UPDATED_EVENT, onDataUpdated);
  }, [subjectFilterId, fetchData]);

  const normalizeToTenScale = (value: number): number => {
    if (!Number.isFinite(value) || value <= 0) return 0;
    const normalized = value > 10 ? value / 10 : value;
    return Math.max(0, Math.min(10, Number(normalized.toFixed(2))));
  };

  const resolvedMark = (exp: UnifiedExperiment) =>
    normalizeToTenScale(
      Math.max(
        Number(exp.finalMarks || 0),
        Number(exp.marks || 0),
        Number(exp.facultyMarks || 0),
        Number(exp.aiScore || 0)
      )
    );

  const stats = useMemo(() => {
    const evaluated = rows.filter((exp) => {
      const s = String(exp.status || "").toLowerCase();
      return (s === "evaluated" || s === "completed") && resolvedMark(exp) > 0;
    });
    const totalMarks = evaluated.reduce((sum, exp) => sum + resolvedMark(exp), 0);
    const maxMarks = Math.max(1, evaluated.length * 10);
    const internalPercent =
      evaluated.length > 0 ? Number(((totalMarks / maxMarks) * 100).toFixed(2)) : 0;
    const avgMarks = evaluated.length > 0 ? totalMarks / evaluated.length : 0;
    const completionPct =
      rows.length > 0 ? Math.round((evaluated.length / rows.length) * 100) : 0;
    return { evaluatedCount: evaluated.length, totalMarks, internalPercent, avgMarks, completionPct };
  }, [rows]);

  const displayStatuses = useMemo(() => {
    let canUnlockNext = true;
    const map = new Map<string, string>();
    rows.forEach((sub) => {
      const normalized = String(sub.status || "").trim().toLowerCase();
      const isCompleted =
        normalized === "submitted" || normalized === "evaluated" || normalized === "completed";
      const isDraft =
        normalized === "draft" || normalized === "in_progress" || Boolean(sub.submittedDate || sub.updatedAt);

      if (isCompleted) {
        map.set(String(sub.id), normalized);
        canUnlockNext = true;
        return;
      }
      if (isDraft) {
        map.set(String(sub.id), "draft");
        canUnlockNext = true;
        return;
      }
      if (canUnlockNext) {
        map.set(String(sub.id), "unlocked");
        canUnlockNext = false;
        return;
      }
      map.set(String(sub.id), "locked");
    });
    return map;
  }, [rows]);

  const statusBadgeMap: Record<string, string> = {
    evaluated: "border-emerald-200 bg-emerald-50 text-emerald-700",
    completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
    submitted: "border-indigo-200 bg-indigo-50 text-indigo-700",
    draft: "border-amber-200 bg-amber-50 text-amber-800",
    unlocked: "border-blue-200 bg-blue-50 text-blue-700",
    locked: "border-slate-200 bg-slate-100 text-slate-500",
    pending: "border-blue-200 bg-blue-50 text-blue-700",
  };

  const expBadgeColorMap: Record<string, string> = {
    evaluated: "border-emerald-200 bg-emerald-50 text-emerald-700",
    completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
    submitted: "border-indigo-200 bg-indigo-50 text-indigo-700",
    draft: "border-amber-200 bg-amber-50 text-amber-800",
    unlocked: "border-blue-200 bg-blue-50 text-blue-700",
    locked: "border-slate-200 bg-slate-100 text-slate-500",
    pending: "border-blue-200 bg-blue-50 text-blue-700",
  };

  const displaySubjectName =
    selectedSubjectName ||
    querySubjectName ||
    getSelectedSubjectFromStorage().subjectName ||
    "Selected subject";

  if (loading) {
    return <SubmissionsSkeleton />;
  }

  if (!subjectFilterId) {
    return (
      <div className="faculty-bg-vibrant min-h-screen px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto w-full max-w-[1380px] faculty-surface p-6">
          <button
            type="button"
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
          <ErrorScreen message={error} onRetry={() => void fetchData()} />
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="faculty-bg-vibrant min-h-screen px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto w-full max-w-[1380px] faculty-surface p-8">
          <EmptyState
            icon={<BarChart3 className="h-12 w-12" />}
            title="No results yet"
            description="When you submit experiments, your status and marks will appear here."
            action={{
              label: "Go to Experiments",
              onClick: () => navigate("/student/experiments"),
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="student-page-enter faculty-bg-vibrant min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto w-full max-w-[1380px]">
        <motion.div
          {...fadeUp}
          className="faculty-glass faculty-gradient-ring relative mb-6 rounded-3xl p-6"
        >
          <div className="absolute -top-6 -left-6 h-72 w-72 rounded-full bg-blue-200/50 blur-3xl pointer-events-none" />
          <div className="absolute -top-4 right-12 h-48 w-48 rounded-full bg-indigo-200/50 blur-2xl pointer-events-none" />

          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => navigate("/student")}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/85 px-3 py-2 text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div>
                <h1 className="bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
                  Lab Results
                </h1>
                <p className="mt-0.5 text-sm text-slate-600">
                  Summary of status and marks per experiment
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500">{displaySubjectName}</p>
              </div>
              {demoModeActive && (
                <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                  Demo Mode
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-xs">
                <button
                  type="button"
                  onClick={() => setViewMode("cards")}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    viewMode === "cards"
                      ? "bg-blue-50 text-blue-700 border border-blue-200 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Cards</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    viewMode === "table"
                      ? "bg-blue-50 text-blue-700 border border-blue-200 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Table2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Table</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => void fetchData()}
                className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-slate-600 transition hover:bg-slate-50 hover:text-blue-700"
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-sm font-semibold text-blue-700">
                <FileCheck2 className="h-4 w-4" />
                {rows.length} experiment{rows.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="animate"
          className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <div className="chart-card">
            <p className="flex items-center gap-1.5 text-sm text-slate-500">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              Evaluated
            </p>
            <p className="mt-1 text-3xl font-bold text-slate-900">{stats.evaluatedCount}</p>
            <p className="mt-1 text-xs text-slate-500">With published marks</p>
          </div>
          <div className="chart-card">
            <p className="flex items-center gap-1.5 text-sm text-slate-500">
              <Award className="h-4 w-4 text-emerald-600" />
              Total marks
            </p>
            <p className="mt-1 text-3xl font-bold text-slate-900">{stats.totalMarks}</p>
            <p className="mt-1 text-xs text-slate-500">Sum of /10 scores</p>
          </div>
          <div className="chart-card">
            <p className="text-sm text-slate-500">Internal %</p>
            <p className="mt-1 text-3xl font-bold text-blue-700">{stats.internalPercent}%</p>
            <p className="mt-1 text-xs text-slate-500">On evaluated set</p>
          </div>
          <div className="chart-card">
            <p className="text-sm text-slate-500">Completion</p>
            <p className="mt-1 text-3xl font-bold text-indigo-700">{stats.completionPct}%</p>
            <p className="mt-1 text-xs text-slate-500">Evaluated vs listed</p>
          </div>
        </motion.div>

        {viewMode === "table" ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="faculty-surface rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3.5">No</th>
                    <th className="px-5 py-3.5">Experiment Title</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5">Marks Obtained</th>
                    <th className="px-5 py-3.5 text-right">Last Activity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((sub) => {
                    const displayStatus = displayStatuses.get(String(sub.id)) || "pending";
                    const statusClass = statusBadgeMap[displayStatus] || statusBadgeMap.pending;
                    const mark = resolvedMark(sub);
                    const hasMarks = (displayStatus === "evaluated" || displayStatus === "completed") && mark > 0;
                    const statusLabel =
                      displayStatus === "locked"
                        ? "Locked"
                        : displayStatus === "draft"
                          ? "Draft"
                          : displayStatus === "unlocked"
                            ? "Available"
                            : displayStatus === "completed" || displayStatus === "evaluated"
                              ? "Completed"
                              : "Submitted";

                    return (
                      <tr key={sub.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-5 py-4 font-bold text-slate-700">{sub.experimentNo || "—"}</td>
                        <td className="px-5 py-4 font-medium text-slate-900">{sub.title || "Untitled"}</td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass}`}>
                            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                            {statusLabel}
                          </span>
                        </td>
                        <td className="px-5 py-4 font-semibold">
                          {hasMarks ? (
                            <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                              <Award className="h-3.5 w-3.5 text-emerald-600" />
                              {mark} / 10
                            </span>
                          ) : displayStatus === "locked" ? (
                            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100/60 px-2.5 py-1 text-xs font-medium text-slate-400">
                              🔒 Locked
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                              Awaiting Evaluation
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right text-xs text-slate-500">
                          {sub.updatedAt ? formatDateTime(sub.updatedAt) : sub.submittedDate ? formatDateTime(sub.submittedDate) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="animate"
            className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3"
          >
            {rows.map((sub, index) => {
              const displayStatus = displayStatuses.get(String(sub.id)) || "pending";
              const statusClass = statusBadgeMap[displayStatus] || statusBadgeMap.pending;
              const badgeColor = expBadgeColorMap[displayStatus] || expBadgeColorMap.pending;
              const mark = resolvedMark(sub);
              const hasMarks =
                (displayStatus === "evaluated" || displayStatus === "completed") && mark > 0;
              const statusLabel =
                displayStatus === "locked"
                  ? "Locked"
                  : displayStatus === "draft"
                    ? "Draft"
                    : displayStatus === "unlocked"
                      ? "Available"
                      : displayStatus === "completed" || displayStatus === "evaluated"
                        ? "Completed"
                        : "Submitted";

              return (
                <motion.div
                  key={sub.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04, duration: 0.2, ease: "easeOut" }}
                  whileHover={{ y: -3, transition: { duration: 0.18 } }}
                  onClick={() => setActiveRowId(String(sub.id))}
                  className={`faculty-surface relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 transition-all duration-200 hover:border-blue-200 hover:shadow-md ${
                    activeRowId === String(sub.id) ? "border-indigo-300 ring-1 ring-indigo-200" : ""
                  }`}
                >
                  <div>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold ${badgeColor}`}
                      >
                        {sub.experimentNo || "?"}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass}`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                        {statusLabel}
                      </span>
                    </div>

                    <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 mb-2">
                      {sub.title || "Untitled Experiment"}
                    </h3>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <div>
                      {hasMarks ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
                          <Award className="h-3.5 w-3.5 text-emerald-600" />
                          {mark} / 10
                        </span>
                      ) : displayStatus === "locked" ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100/60 px-3 py-1.5 text-xs font-medium text-slate-400">
                          🔒 Locked
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700">
                          Awaiting Evaluation
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-400 font-medium truncate">
                      {sub.updatedAt
                        ? formatDateTime(sub.updatedAt)
                        : sub.submittedDate
                          ? formatDateTime(sub.submittedDate)
                          : displayStatus === "locked"
                            ? "Locked"
                            : "No activity"}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {profileName && (
          <p className="mt-6 text-center text-xs text-slate-500">
            Logged in as <span className="font-medium text-slate-700">{profileName}</span>
          </p>
        )}
      </div>
    </div>
  );
}
