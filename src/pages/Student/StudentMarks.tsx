import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { fadeUp, staggerContainer } from "@/animations/motion";
import { ArrowLeft, Award, FlaskConical, RefreshCw } from "lucide-react";
import { MarksSkeleton } from "@/components/ui/StudentSkeletons";
import ErrorScreen from "@/components/ui/ErrorScreen";
import {
  getSelectedSubjectFromStorage,
  setSelectedSubjectInStorage,
  useSelectedSubject,
} from "@/context/SubjectContext";
import { supabase } from "@/lib/supabase";
import { getStudentExperimentData, type UnifiedStudentDataResult } from "@/utils/unifiedStudentData";
import { sortByExperimentNo } from "@/utils/experimentOrder";
import { applyOoseExperimentOrderIfNeeded } from "@/utils/ooseExperimentOrder";
import { repairLeadingTitle } from "@/utils/titleRepair";
const STUDENT_DATA_UPDATED_EVENT = "student-data-updated";
const REALTIME_DISABLED_KEY = "realtime_disabled_student_marks";

export default function StudentMarks() {
  const STUDENT_MARKS_ERROR = "Unable to load marks right now. Please try again.";
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { selectedSubjectId, selectedSubjectName } = useSelectedSubject();
  const querySubjectId = searchParams.get("subject");
  const querySubjectName = searchParams.get("subjectName");
  const subjectFilterId = selectedSubjectId || querySubjectId || localStorage.getItem("student_subject_id");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marksData, setMarksData] = useState<UnifiedStudentDataResult | null>(null);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const syncSubjectFromQuery = async () => {
      if (!querySubjectId) return;
      const stored = getSelectedSubjectFromStorage();
      if (stored.subjectId === querySubjectId && stored.subjectName) return;

      const { data } = await supabase
        .from("subjects")
        .select("name")
        .eq("id", querySubjectId)
        .maybeSingle();
      if (!active) return;
      setSelectedSubjectInStorage(querySubjectId, String(data?.name || ""));
    };
    void syncSubjectFromQuery();
    return () => {
      active = false;
    };
  }, [querySubjectId]);

  const fetchMarksData = useCallback(async () => {
    if (!subjectFilterId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getStudentExperimentData({
        subjectId: subjectFilterId,
        subjectName:
          selectedSubjectName || querySubjectName || getSelectedSubjectFromStorage().subjectName || "",
        searchParams,
      });
      if ((data.experiments || []).length > 0) {
        setMarksData(data);
      } else {
        const subjectNameCandidate =
          selectedSubjectName || querySubjectName || getSelectedSubjectFromStorage().subjectName || "";
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
          images: [] as string[],
          aiScore: null,
          confidence: null,
          aiStatus: null,
          aiBreakdown: null,
        }));
        let fallbackExperiments = sortByExperimentNo(rawFallback, (row) => row.experimentNo);
        fallbackExperiments = applyOoseExperimentOrderIfNeeded(
          String(resolvedSubjectId || subjectFilterId),
          subjectNameCandidate,
          fallbackExperiments,
          (row) => row.title
        ).map((row, index) => ({
          ...row,
          experimentNo: Number(row?.experimentNo) || 0,
        }));
        setMarksData({
          ...data,
          experiments: fallbackExperiments,
          totalMarks: 0,
          internalPercent: 0,
        });
      }
    } catch (err) {
      console.error("Student marks load failed:", err);
      setError(STUDENT_MARKS_ERROR);
    } finally {
      setLoading(false);
    }
  }, [querySubjectName, searchParams, selectedSubjectName, subjectFilterId]);

  useEffect(() => {
    fetchMarksData();
    if (!subjectFilterId) return;
    if (sessionStorage.getItem(REALTIME_DISABLED_KEY) === "1") return;
    const channel = supabase
      .channel(`student-marks-${subjectFilterId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "submissions",
          filter: `subject_id=eq.${subjectFilterId}`,
        },
        () => fetchMarksData()
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          sessionStorage.setItem(REALTIME_DISABLED_KEY, "1");
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [subjectFilterId, fetchMarksData]);

  useEffect(() => {
    const onDataUpdated = () => {
      void fetchMarksData();
    };
    window.addEventListener(STUDENT_DATA_UPDATED_EVENT, onDataUpdated);
    return () => {
      window.removeEventListener(STUDENT_DATA_UPDATED_EVENT, onDataUpdated);
    };
  }, [fetchMarksData]);

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

  if (loading) return <MarksSkeleton />;
  if (error) {
    return (
      <div className="faculty-bg-vibrant min-h-screen px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto w-full max-w-[1380px]">
        <ErrorScreen message={error || STUDENT_MARKS_ERROR} onRetry={fetchMarksData} />
        </div>
      </div>
    );
  }

  const experiments = sortByExperimentNo(marksData?.experiments || [], (row) => row.experimentNo);
  const normalizeToTenScale = (value: number): number => {
    if (!Number.isFinite(value) || value <= 0) return 0;
    const normalized = value > 10 ? value / 10 : value;
    return Math.max(0, Math.min(10, Number(normalized.toFixed(2))));
  };
  const resolvedMark = (exp: (typeof experiments)[number]) =>
    normalizeToTenScale(
      Math.max(
      Number(exp.finalMarks || 0),
      Number(exp.marks || 0),
      Number(exp.facultyMarks || 0),
      Number(exp.aiScore || 0)
      )
    );
  const isEvaluatedStatus = (status: string) => {
    const normalized = String(status || "").toLowerCase();
    return normalized === "evaluated" || normalized === "completed";
  };

  /** Badge copy + styles for marks rows — never show "Pending Faculty Review" for locked / draft / not-started. */
  function getMarksRowDisplay(exp: (typeof experiments)[number]) {
    const s = String(exp.status || "").toLowerCase().trim();
    const mark = resolvedMark(exp);
    const verified = isEvaluatedStatus(s) && mark > 0;

    const tone = {
      emerald:
        "border border-emerald-200 bg-emerald-50 text-emerald-700",
      slate:
        "border border-slate-200 bg-slate-100 text-slate-700",
      amber:
        "border border-amber-200 bg-amber-50 text-amber-800",
      blue:
        "border border-blue-200 bg-blue-50 text-blue-700",
      rose:
        "border border-rose-200 bg-rose-50 text-rose-700",
      indigo:
        "border border-indigo-200 bg-indigo-50 text-indigo-800",
    } as const;

    if (verified) {
      return {
        statusLabel: "Faculty verified",
        statusClass: tone.emerald,
        marksLabel: `${mark}/10`,
        marksClass: tone.emerald,
        lineStatus: "Evaluated",
      };
    }

    if (s === "locked") {
      return {
        statusLabel: "Locked",
        statusClass: tone.slate,
        marksLabel: "—",
        marksClass: tone.slate,
        lineStatus: "Locked",
      };
    }
    if (s === "unlocked") {
      return {
        statusLabel: "Unlocked",
        statusClass: tone.blue,
        marksLabel: "Not submitted",
        marksClass: tone.slate,
        lineStatus: "Unlocked",
      };
    }
    if (s === "draft") {
      return {
        statusLabel: "Draft",
        statusClass: tone.amber,
        marksLabel: "—",
        marksClass: tone.slate,
        lineStatus: "Draft",
      };
    }
    if (s === "submitted") {
      return {
        statusLabel: "Submitted",
        statusClass: tone.blue,
        marksLabel: "Awaiting faculty",
        marksClass: tone.indigo,
        lineStatus: "Submitted",
      };
    }
    if (s === "evaluated" || s === "completed") {
      return {
        statusLabel: s === "completed" ? "Completed" : "Evaluated",
        statusClass: tone.emerald,
        marksLabel: mark > 0 ? `${mark}/10` : "—",
        marksClass: tone.slate,
        lineStatus: s === "completed" ? "Completed" : "Evaluated",
      };
    }
    if (s === "resubmit" || s === "rejected") {
      return {
        statusLabel: "Resubmit required",
        statusClass: tone.rose,
        marksLabel: "—",
        marksClass: tone.slate,
        lineStatus: "Resubmit required",
      };
    }
    if (s === "pending" || !s) {
      return {
        statusLabel: "Not started",
        statusClass: tone.slate,
        marksLabel: "—",
        marksClass: tone.slate,
        lineStatus: "Not started",
      };
    }

    const human = s.replace(/_/g, " ");
    return {
      statusLabel: human.charAt(0).toUpperCase() + human.slice(1),
      statusClass: tone.slate,
      marksLabel: "—",
      marksClass: tone.slate,
      lineStatus: human,
    };
  }
  const evaluatedExperiments = experiments.filter((exp) => {
    const status = String(exp.status || "").toLowerCase();
    return (status === "evaluated" || status === "completed") && resolvedMark(exp) > 0;
  });
  const totalMarks = evaluatedExperiments.reduce((sum, d) => sum + resolvedMark(d), 0);
  const maxMarks = Math.max(1, evaluatedExperiments.length * 10);
  const internalPercent = evaluatedExperiments.length > 0 ? Number(((totalMarks / maxMarks) * 100).toFixed(2)) : 0;
  const avgMarks = evaluatedExperiments.length > 0 ? totalMarks / evaluatedExperiments.length : 0;

  return (
    <div className="student-page-enter faculty-bg-vibrant min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto w-full max-w-[1380px]">
      <motion.div
        {...fadeUp}
        className="faculty-glass faculty-gradient-ring relative mb-8 rounded-3xl p-6"
      >
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/student")}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/85 px-3 py-2 text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-3xl font-bold tracking-tight text-transparent">Marks Overview</h1>
              <p className="mt-0.5 text-sm text-slate-600">Track faculty-reviewed marks by experiment</p>
            </div>
          </div>
          <button
            onClick={fetchMarksData}
            className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-2 py-2 text-slate-600 transition hover:bg-slate-50 hover:text-blue-700"
            title="Refresh marks"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </motion.div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="animate"
        className="mb-7 grid gap-4 md:grid-cols-3"
      >
        <div className="chart-card">
          <p className="text-sm text-slate-500">Total Marks</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{totalMarks}</p>
        </div>
        <div className="chart-card">
          <p className="text-sm text-slate-500">Internal %</p>
          <p className="mt-1 text-3xl font-bold text-blue-700">{internalPercent}%</p>
        </div>
        <div className="chart-card">
          <p className="text-sm text-slate-500">Average / Experiment</p>
          <p className="mt-1 text-3xl font-bold text-indigo-700">{avgMarks.toFixed(1)}</p>
        </div>
      </motion.div>

      <div className="faculty-surface rounded-2xl p-5">
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Experiment-wise Marks</h3>
        <div className="space-y-3">
          {experiments.map((exp) => {
            const row = getMarksRowDisplay(exp);
            return (
            <motion.div
              key={exp.id}
              onClick={() => setActiveRowId(String(exp.id))}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.995 }}
              className={`student-row flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 transition-colors hover:bg-blue-50/60 ${activeRowId === String(exp.id) ? "student-row-active border-indigo-300" : ""}`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  <FlaskConical className="mr-1.5 inline h-3.5 w-3.5 text-blue-600" />
                  {exp.experimentNo}. {exp.title}
                </p>
                <p className="text-xs text-slate-500">Status: {row.lineStatus}</p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span
                  className={`student-status-badge inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${row.statusClass}`}
                >
                  {row.statusLabel}
                </span>
                <span
                  className={`student-status-badge inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${row.marksClass}`}
                >
                  <Award className="w-3.5 h-3.5 shrink-0 opacity-80" />
                  {row.marksLabel}
                </span>
              </div>
            </motion.div>
            );
          })}
        </div>
      </div>
      </div>
    </div>
  );
}
