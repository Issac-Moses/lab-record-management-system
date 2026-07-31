import { useEffect, useState, useCallback, useMemo } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Area,
  PieChart,
  Pie,
  Cell,
  Sector,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  ClipboardCheck,
  CheckCircle,
  ArrowRight,
  FileText,
  BarChart3,
  Users,
  FlaskConical,
  Clock,
  AlertTriangle,
  TrendingUp,
  FileDown,
  Medal,
  Award,
  Sparkles,
} from "lucide-react";
import {
  getFacultyDashboardAnalytics,
  getFacultyDashboardStats,
  getFacultySuperDashboardRows,
  normalizeChartData,
} from "@/services/facultyDataService";
import { exportFacultySuperDashboardToExcel } from "@/services/exportService";
import { getFacultyAnalyticsFallback } from "@/services/facultyAnalyticsFallback";
import { formatDepartmentName } from "@/utils/departmentLabel";
import { getUserProgress, type GamificationProgress } from "@/services/studentGamificationService";
import FacultyTaskAssignPanel from "@/components/gamification/FacultyTaskAssignPanel";
import { accumulateExamSubmissionRow, createEmptyExamMarksAccumulator } from "@/lib/aggregateSubmissionMarks";
import { computeExamPhase } from "@/lib/examWindow";

type ExamResultSummary = {
  id: string;
  title: string;
  roomId: string;
  status: string;
  submissions: number;
  avgMarks: number | null;
};

type FacultySuperDashboardRow = {
  studentName: string;
  registerNumber: string;
  department: string | null;
  subject: string;
  totalExperiments: number;
  completedExperiments: number;
  progressPercentage: number;
  totalMarks: number | null;
  avgAiScore: number | null;
  leaderboardRank: number;
};

type FacultyDashboardAnalytics = {
  submissionCounts: Array<{ experiment: string; count: number }>;
  averageMarksPerExperiment: Array<{ experiment: string; averageMarks: number }>;
  weeklySubmissions?: Array<{ day: string; submissions: number }>;
  completionSplit?: Array<{ name: string; value: number; color?: string }>;
  leaderboard: Array<{
    leaderboardRank: number;
    registerNumber: string;
    studentName: string;
    progressPercentage: number;
    totalMarks: number | null;
    avgAiScore: number | null;
  }>;
};

function getExamStatusFromWindow(
  startTime?: string | null,
  endTime?: string | null,
  durationMinutes?: number | null
): string {
  return computeExamPhase(Date.now(), {
    start_time: startTime,
    end_time: endTime,
    duration_minutes: durationMinutes,
  });
}

const chartTooltipStyle = {
  backgroundColor: "rgba(15, 23, 42, 0.94)",
  border: "1px solid rgba(148, 163, 184, 0.35)",
  borderRadius: "10px",
  color: "#E2E8F0",
  boxShadow: "0 12px 28px rgba(2, 6, 23, 0.35)",
};

function compactAxisLabel(value: unknown, max = 12) {
  const text = String(value ?? "");
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(max - 1, 1))}…`;
}

function hasMeaningfulCounts(rows: Array<{ count?: number }>, minPeak = 3) {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const counts = rows.map((row) => Number(row?.count || 0));
  const max = Math.max(...counts, 0);
  const total = counts.reduce((sum, value) => sum + value, 0);
  return total > 0 && max >= minPeak;
}

function hasMeaningfulSubmissions(rows: Array<{ submissions?: number }>, minPeak = 3) {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const values = rows.map((row) => Number(row?.submissions || 0));
  const max = Math.max(...values, 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  return total > 0 && max >= minPeak;
}

function formatEvaluationValue(value: number | null | undefined): string {
  const safe = Number(value);
  if (!Number.isFinite(safe) || safe <= 0) return "Not Evaluated";
  return String(Number(safe.toFixed(2)));
}

const chartCardClass = "chart-card";
const DEFAULT_PREVIEW_MIN_PEAK = 3;

export default function FacultyDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const selectedSubjectId = localStorage.getItem("faculty_subject_id");
  const subjectName = localStorage.getItem("faculty_subject_name");

  const [totalStudents, setTotalStudents] = useState(0);
  const [totalExperiments, setTotalExperiments] = useState(0);
  const [defaulters, setDefaulters] = useState(0);
  const [averageProgress, setAverageProgress] = useState(0);
  const [examSummaries, setExamSummaries] = useState<ExamResultSummary[]>([]);
  const [dashboardRows, setDashboardRows] = useState<FacultySuperDashboardRow[]>([]);
  const [analytics, setAnalytics] = useState<FacultyDashboardAnalytics>({
    submissionCounts: [],
    averageMarksPerExperiment: [],
    leaderboard: [],
  });
  const [loading, setLoading] = useState(true);
  const [facultyDisplayName, setFacultyDisplayName] = useState("Faculty");
  const [assignedSubjects, setAssignedSubjects] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [facultyGamification, setFacultyGamification] = useState<GamificationProgress>({
    xp_points: 0,
    level: 1,
    labs_completed: 0,
    current_streak: 0,
  });
  const [activePieIndex, setActivePieIndex] = useState<number | null>(null);
  const previewMinPeak = useMemo(() => {
    const raw = Number(localStorage.getItem("faculty_preview_min_peak") || DEFAULT_PREVIEW_MIN_PEAK);
    return Number.isFinite(raw) ? Math.max(1, Math.round(raw)) : DEFAULT_PREVIEW_MIN_PEAK;
  }, []);

  const resolveFacultyName = useCallback((authUser: any) => {
    const meta = authUser?.user_metadata || {};
    const metaName = String(meta?.name || meta?.full_name || "").trim();
    if (metaName) return metaName;
    const metaJoined = `${String(meta?.first_name || "").trim()} ${String(meta?.last_name || "").trim()}`.trim();
    if (metaJoined) return metaJoined;
    const cachedName = String(localStorage.getItem("faculty_name") || "").trim();
    return "Faculty";
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("faculty_subjects")
      .select("subject_id, subjects(id, name, code)")
      .eq("faculty_id", user.id)
      .then(({ data }) => {
        if (data && Array.isArray(data)) {
          const list = data
            .map((item: any) => ({
              id: String(item?.subjects?.id || item?.subject_id || "").trim(),
              name: String(item?.subjects?.name || "").trim(),
              code: String(item?.subjects?.code || "").trim(),
            }))
            .filter((s) => s.id && s.name);
          setAssignedSubjects(list);
        }
      });
  }, [user?.id]);

  const fetchCounts = useCallback(async () => {
    if (!user || !selectedSubjectId) {
      setLoading(false);
      return;
    }

    try {
      const stats = await getFacultyDashboardStats(selectedSubjectId);
      setTotalStudents(stats.totalStudents ?? 0);
      setTotalExperiments(stats.totalExperiments ?? 0);
      setDefaulters(stats.defaulters ?? 0);
      setAverageProgress(stats.averageProgress ?? 0);
    } catch (error) {
      console.error("Dashboard stats load failed", error);
      setTotalStudents(0);
      setTotalExperiments(0);
      setDefaulters(0);
      setAverageProgress(0);
    } finally {
      // loading is managed by the parent useEffect via Promise.all
    }
  }, [user, selectedSubjectId]);

  const fetchDashboardRows = useCallback(async () => {
    if (!selectedSubjectId) {
      setDashboardRows([]);
      return;
    }

    try {
      const rows = await getFacultySuperDashboardRows(selectedSubjectId);
      const safeRows = Array.isArray(rows) ? rows : [];
      setDashboardRows(safeRows);
    } catch (error) {
      console.error("Faculty dashboard rows load failed", error);
      setDashboardRows([]);
    }
  }, [selectedSubjectId]);

  const fetchAnalytics = useCallback(async () => {
    if (!selectedSubjectId) {
      setAnalytics({
        submissionCounts: [],
        averageMarksPerExperiment: [],
        leaderboard: [],
      });
      return;
    }
    try {
      const data = await getFacultyDashboardAnalytics(selectedSubjectId);
      setAnalytics({
        submissionCounts: Array.isArray(data?.submissionCounts) ? data.submissionCounts : [],
        averageMarksPerExperiment: Array.isArray(data?.averageMarksPerExperiment)
          ? data.averageMarksPerExperiment
          : [],
        leaderboard: Array.isArray(data?.leaderboard) ? data.leaderboard : [],
      });
    } catch (error) {
      console.error("Faculty analytics load failed", error);
      setAnalytics({
        submissionCounts: [],
        averageMarksPerExperiment: [],
        leaderboard: [],
      });
    }
  }, [selectedSubjectId]);

  const fetchExamSummaries = useCallback(async () => {
    if (!user || !selectedSubjectId) {
      setExamSummaries([]);
      return;
    }

    try {
      const { data: examRows, error: examsError } = await supabase
        .from("exams")
        .select("id, title, room_id, start_time, end_time, duration_minutes")
        .eq("faculty_id", user.id)
        .eq("subject_id", selectedSubjectId)
        .order("created_at", { ascending: false });

      if (examsError || !examRows || examRows.length === 0) {
        setExamSummaries([]);
        return;
      }

      const examIds = examRows.map((exam) => exam.id);
      const { data: submissionsRows } = await supabase
        .from("exam_submissions")
        .select("id, exam_id, marks")
        .in("exam_id", examIds);

      const grouped = new Map<string, { submissions: number; marksTotal: number; marksCount: number }>();
      for (const row of submissionsRows || []) {
        const prev = grouped.get(row.exam_id) || createEmptyExamMarksAccumulator();
        grouped.set(row.exam_id, accumulateExamSubmissionRow(prev, row.marks));
      }

      const summaries: ExamResultSummary[] = examRows.map((exam) => {
        const data = grouped.get(exam.id) || { submissions: 0, marksTotal: 0, marksCount: 0 };
        return {
          id: exam.id,
          title: exam.title || "Untitled Exam",
          roomId: exam.room_id || "-",
          status: getExamStatusFromWindow(exam.start_time, exam.end_time, exam.duration_minutes),
          submissions: data.submissions,
          avgMarks: data.marksCount > 0 ? Number((data.marksTotal / data.marksCount).toFixed(2)) : null,
        };
      });

      setExamSummaries(summaries);
    } catch (error) {
      console.error("Exam summary load failed", error);
      setExamSummaries([]);
    }
  }, [user, selectedSubjectId]);

  useEffect(() => {
    if (!selectedSubjectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([fetchCounts(), fetchDashboardRows(), fetchAnalytics()])
      .finally(() => setLoading(false));
  }, [selectedSubjectId, fetchCounts, fetchDashboardRows, fetchAnalytics]);

  useEffect(() => {
    if (!user || !selectedSubjectId) return;

    const interval = window.setInterval(() => {
      if (document.hidden) return;
      fetchCounts();
      fetchDashboardRows();
      fetchAnalytics();
    }, 10000);

    return () => {
      window.clearInterval(interval);
    };
  }, [user, selectedSubjectId, fetchCounts, fetchDashboardRows, fetchAnalytics]);

  useEffect(() => {
    if (!selectedSubjectId) {
      setExamSummaries([]);
      return;
    }
    void fetchExamSummaries();
  }, [selectedSubjectId, fetchExamSummaries, user]);

  useEffect(() => {
    setFacultyDisplayName(resolveFacultyName(user));
  }, [user, resolveFacultyName]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) return;
      try {
        const progress = await getUserProgress(user.id);
        if (!cancelled) setFacultyGamification(progress);
      } catch {
        /* keep defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (!selectedSubjectId) {
    return <Navigate to="/faculty/subjects" replace />;
  }

  const activeExamsCount = examSummaries.filter(
    (exam) => String(exam.status || "").toLowerCase() === "active"
  ).length;
  const examModeLabel = activeExamsCount > 0 ? `Live (${activeExamsCount})` : "Idle";
  const nowHour = new Date().getHours();
  const greeting =
    nowHour < 12 ? "Good Morning" : nowHour < 17 ? "Good Afternoon" : "Good Evening";
  const effectiveSubjectName = subjectName || "Neural Networks and Deep Learning Lab";
  const fallbackAnalytics = useMemo(
    () => getFacultyAnalyticsFallback(effectiveSubjectName),
    [effectiveSubjectName]
  );
  const liveSubmissionStatusData = useMemo(() => {
    const split = Array.isArray(analytics.completionSplit) ? analytics.completionSplit : [];
    if (split.length > 0) {
      return normalizeChartData(split, "submissionStatus");
    }
    const completed = dashboardRows.filter((row) => Number(row.totalMarks || 0) > 0).length;
    const pending = Math.max(dashboardRows.length - completed, 0);
    return normalizeChartData(
      [
        { name: "Completed", value: completed, color: "#059669" },
        { name: "Pending", value: pending, color: "#F59E0B" },
      ],
      "submissionStatus"
    );
  }, [analytics.completionSplit, dashboardRows]);
  const liveSubmissionStatusTotal = useMemo(
    () => liveSubmissionStatusData.reduce((sum, item) => sum + Number(item.value || 0), 0),
    [liveSubmissionStatusData]
  );
  const submissionStatusData = liveSubmissionStatusTotal > 0
    ? liveSubmissionStatusData
    : fallbackAnalytics.submissionStatus;
  const submissionStatusTotal = useMemo(
    () => submissionStatusData.reduce((sum, item) => sum + Number(item.value || 0), 0),
    [submissionStatusData]
  );
  const isSubmissionStatusPreview = liveSubmissionStatusTotal === 0;
  const weeklyTrendData = useMemo(() => {
    const source = Array.isArray(analytics.weeklySubmissions) ? analytics.weeklySubmissions : [];
    return normalizeChartData(source, "weeklyTrend");
  }, [analytics.weeklySubmissions]);
  const isWeeklyTrendPreview = !hasMeaningfulSubmissions(weeklyTrendData, previewMinPeak);
  const effectiveWeeklyTrendData = isWeeklyTrendPreview ? fallbackAnalytics.weeklyTrend : weeklyTrendData;
  const liveExperimentProgressData = useMemo(
    () => normalizeChartData(analytics.submissionCounts, "experimentProgress"),
    [analytics.submissionCounts]
  );
  const isExperimentProgressPreview = !hasMeaningfulCounts(liveExperimentProgressData, previewMinPeak);
  const effectiveExperimentProgressData = isExperimentProgressPreview
    ? fallbackAnalytics.experimentProgress
    : liveExperimentProgressData;
  const effectiveExperimentProgressWithCompletion = useMemo(() => {
    const maxCount = Math.max(
      ...effectiveExperimentProgressData.map((row) => Number(row.count || 0)),
      1
    );
    return effectiveExperimentProgressData.map((row) => {
      const rawCompletion = Number(row.completion || 0);
      return {
        ...row,
        completion:
          rawCompletion > 0 ? Math.min(rawCompletion, 100) : Math.round((Number(row.count || 0) / maxCount) * 100),
      };
    });
  }, [effectiveExperimentProgressData]);
  const liveExperimentStats = useMemo(() => {
    if (dashboardRows.length === 0) {
      return { total: Math.max(Number(totalExperiments || 0), 0), completed: 0, pending: 0 };
    }
    const total = Math.max(
      ...dashboardRows.map((row) => Number(row.totalExperiments || 0)),
      Number(totalExperiments || 0),
      0
    );
    const completed = Math.max(
      ...dashboardRows.map((row) => Number(row.completedExperiments || 0)),
      0
    );
    return {
      total,
      completed,
      pending: Math.max(total - completed, 0),
    };
  }, [dashboardRows, totalExperiments]);
  const effectiveExperimentStats =
    !isExperimentProgressPreview && liveExperimentStats.total > 0
      ? liveExperimentStats
      : { total: 10, completed: 7, pending: 3 };
  const liveLeaderboardRows = useMemo(
    () => analytics.leaderboard.slice(0, 8),
    [analytics.leaderboard]
  );
  const hasLiveCoreData = dashboardRows.length > 0 || liveExperimentProgressData.length > 0 || liveLeaderboardRows.length > 0;
  const leaderboardRows = useMemo(
    () => liveLeaderboardRows,
    [liveLeaderboardRows]
  );
  const maxLeaderboardMarks = useMemo(
    () =>
      Math.max(
        ...leaderboardRows.map((row) =>
          Number.isFinite(Number(row.totalMarks)) ? Number(row.totalMarks) : 0
        ),
        1
      ),
    [leaderboardRows]
  );
  const averageMarksForPrediction = useMemo(() => {
    if (leaderboardRows.length === 0) return 0;
    return leaderboardRows.reduce((sum, row) => sum + Number(row.totalMarks || 0), 0) / leaderboardRows.length;
  }, [leaderboardRows]);
  const performancePrediction = useMemo(() => {
    if (averageMarksForPrediction < 5) return "At Risk";
    if (averageMarksForPrediction < 7) return "Average";
    return "Top Performer";
  }, [averageMarksForPrediction]);
  const liveSummaryCards = useMemo(() => {
    const liveSubmissionsTotal = analytics.submissionCounts.reduce((sum, row) => sum + Number(row.count || 0), 0);
    const liveAvgMarksRaw =
      leaderboardRows.length > 0
        ? leaderboardRows.reduce((sum, row) => sum + Number(row.totalMarks || 0), 0) / leaderboardRows.length
        : 0;
    const liveCompletionRate =
      dashboardRows.length > 0
        ? dashboardRows.reduce((sum, row) => sum + Number(row.progressPercentage || 0), 0) / dashboardRows.length
        : 0;
    return [
      { label: "Total Experiments", value: Math.max(totalExperiments, effectiveExperimentStats.total), accent: "bg-blue-100 text-blue-600" },
      { label: "Total Submissions", value: liveSubmissionsTotal, accent: "bg-indigo-100 text-indigo-600" },
      { label: "Average Marks", value: Math.round((liveAvgMarksRaw / 10) * 100), accent: "bg-emerald-100 text-emerald-600", suffix: "%" },
      { label: "Completion Rate", value: Math.round(liveCompletionRate), accent: "bg-amber-100 text-amber-700", suffix: "%" },
    ];
  }, [analytics.submissionCounts, dashboardRows, leaderboardRows, totalExperiments, effectiveExperimentStats.total]);
  const greetingCards = hasLiveCoreData ? liveSummaryCards : fallbackAnalytics.summaryCards;
  const effectiveDashboardRows = dashboardRows;
  const insights = useMemo(() => {
    if (!hasLiveCoreData) return fallbackAnalytics.insights;
    const lowCompletionCount = effectiveDashboardRows.filter((row) => Number(row.progressPercentage || 0) < 60).length;
    const weakestExperiment = effectiveExperimentProgressWithCompletion.reduce(
      (weakest, row) => (Number(row.count || 0) < Number(weakest.count || 0) ? row : weakest),
      effectiveExperimentProgressWithCompletion[0] || { experiment: "Experiment", count: 0 }
    );
    const peakDay = effectiveWeeklyTrendData.reduce(
      (best, row) => (Number(row.submissions || 0) > Number(best.submissions || 0) ? row : best),
      effectiveWeeklyTrendData[0] || { day: "Friday", submissions: 0 }
    );
    const pendingReviews = Math.max(
      effectiveDashboardRows.reduce(
        (sum, row) => sum + Math.max(Number(row.totalExperiments || 0) - Number(row.completedExperiments || 0), 0),
        0
      ),
      0
    );
    return [
      `${lowCompletionCount} students below 60% completion`,
      `${weakestExperiment.experiment} has lowest performance`,
      `Peak submissions on ${peakDay.day}`,
      `${pendingReviews} submissions pending review`,
    ];
  }, [
    hasLiveCoreData,
    fallbackAnalytics.insights,
    effectiveDashboardRows,
    effectiveExperimentProgressWithCompletion,
    effectiveWeeklyTrendData,
  ]);
  const workflowSteps = [
    {
      key: "student",
      icon: <Users className="h-5 w-5 text-blue-600" />,
      title: "Student Activity",
      description: "Students write and update digital lab submissions.",
      accent: "from-blue-50 to-indigo-50",
    },
    {
      key: "submission",
      icon: <FileText className="h-5 w-5 text-indigo-600" />,
      title: "Submission",
      description: "Records are submitted into your subject workspace.",
      accent: "from-indigo-50 to-blue-50",
    },
    {
      key: "review",
      icon: <ClipboardCheck className="h-5 w-5 text-blue-600" />,
      title: "Faculty Review",
      description: "Evaluate program, output, and result quality.",
      accent: "from-blue-50 to-indigo-50",
    },
    {
      key: "marks",
      icon: <Award className="h-5 w-5 text-amber-500" />,
      title: "Marks Assignment",
      description: "Marks are assigned with transparent review status.",
      accent: "from-amber-50 to-blue-50",
    },
    {
      key: "completion",
      icon: <CheckCircle className="h-5 w-5 text-emerald-600" />,
      title: "Completion",
      description: "Evaluated records feed analytics and leaderboard.",
      accent: "from-emerald-50 to-blue-50",
    },
  ];
  const submissionActivity = useMemo(() => {
    if (dashboardRows.length > 0) {
      return dashboardRows.slice(0, 6).map((row, index) => {
        const marks = Number(row.totalMarks || 0);
        const progress = Number(row.progressPercentage || 0);
        const status = marks > 0 ? "Evaluated" : progress > 0 ? "Submitted" : "Pending";
        const statusClass =
          status === "Evaluated"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : status === "Submitted"
              ? "border-blue-200 bg-blue-50 text-blue-700"
              : "border-amber-200 bg-amber-50 text-amber-700";
        return {
          id: `${row.registerNumber}-${index}`,
          student: row.studentName || row.registerNumber || "Student",
          label: row.subject || subjectName || "Subject",
          status,
          statusClass,
          time: `Updated ${index + 1}h ago`,
        };
      });
    }

    return [{
      id: "no-activity",
      student: "No recent student activity",
      label: subjectName || effectiveSubjectName,
      status: "Pending",
      statusClass: "border-slate-200 bg-slate-100 text-slate-600",
      time: "Waiting for new submissions",
    }];
  }, [dashboardRows, subjectName, effectiveSubjectName]);
  const liveActivityCards = submissionActivity.slice(0, 5).map((item) => ({
    ...item,
    event: item.id === "no-activity" ? "Awaiting activity" : "Student submitted experiment",
    accent: "border-blue-200 bg-blue-50/80 text-blue-700",
  }));
  const fallbackExamSummaries = useMemo(
    () =>
      fallbackAnalytics.experimentProgress.slice(0, 5).map((row, index) => ({
        id: `preview-exam-${index}`,
        title: row.experiment,
        roomId: `LAB-${index + 1}`,
        status: "completed",
        submissions: Number(row.count || 0),
        avgMarks: Number((Math.max(Math.min((Number(row.completion || 0) / 10), 10), 0)).toFixed(1)),
      })),
    [fallbackAnalytics.experimentProgress]
  );
  const effectiveExamSummaries = examSummaries.length > 0 ? examSummaries : fallbackExamSummaries;

  if (loading) {
    return <DashboardLoadingSkeleton />;
  }

  return (
    <div className="text-slate-800">
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="faculty-glass faculty-gradient-ring mb-10 rounded-3xl p-6 md:p-8"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-slate-900 md:text-2xl">{greeting}, {facultyDisplayName}</h2>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live activity
            </span>
            <span className="rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-xs text-slate-600">
              Exam Mode: {examModeLabel}
            </span>
          </div>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Here is the current activity across your laboratory subjects.
        </p>
        {user?.id ? (
          <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-violet-200 bg-violet-50/90 px-4 py-3 text-sm text-violet-950">
            <div className="flex items-center gap-2 font-medium">
              <Sparkles className="h-4 w-4 shrink-0 text-violet-600" />
              Your gamification (reviews &amp; XP)
            </div>
            <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-violet-800 shadow-sm">
              {Number(facultyGamification.xp_points || 0).toLocaleString()} XP
            </span>
            <span className="text-xs text-violet-800/90">
              Level {facultyGamification.level || 1} · +15 XP per evaluation (when you submit marks)
            </span>
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {assignedSubjects.length > 1 ? (
            <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/90 px-3 py-1.5 shadow-2xs">
              <BookOpen className="h-4 w-4 text-blue-600 shrink-0" />
              <span className="text-xs font-semibold text-blue-900">Active Subject:</span>
              <select
                value={selectedSubjectId || ""}
                onChange={(e) => {
                  const newId = e.target.value;
                  const found = assignedSubjects.find((s) => s.id === newId);
                  if (found) {
                    localStorage.setItem("faculty_subject_id", found.id);
                    localStorage.setItem("faculty_subject_name", found.name);
                    window.location.reload();
                  }
                }}
                className="bg-transparent text-xs font-bold text-blue-700 outline-none cursor-pointer"
              >
                {assignedSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.code ? `(${s.code})` : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : subjectName ? (
            <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-medium text-slate-600">
              {subjectName}
            </span>
          ) : null}

          <button
            type="button"
            onClick={() => navigate("/faculty/subjects")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-blue-700"
          >
            <BookOpen className="h-3.5 w-3.5 text-blue-600" />
            Switch Subject ({assignedSubjects.length > 0 ? assignedSubjects.length : "Select"})
          </button>
          <button
            type="button"
            onClick={() => exportFacultySuperDashboardToExcel(effectiveDashboardRows, "lab_report")}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition duration-200 hover:from-blue-700 hover:to-indigo-700"
          >
            <FileDown className="h-3.5 w-3.5" />
            Export Excel
          </button>
          <button
            type="button"
            onClick={() => navigate("/faculty/exams")}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white/90 px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition duration-200 hover:border-blue-200 hover:text-blue-700"
          >
            Open Exam Console
          </button>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {greetingCards.map((card) => (
            <motion.div
              key={card.label}
              whileHover={{ y: -4, scale: 1.01 }}
              transition={{ duration: 0.12 }}
              className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-[0_10px_22px_rgba(37,99,235,0.1)] backdrop-blur-md transition-shadow hover:shadow-[0_14px_30px_rgba(79,70,229,0.15)]"
            >
              <div className={`mb-2 inline-flex rounded-lg px-2 py-1 text-xs font-semibold ${card.accent}`}>
                {card.label}
              </div>
              <p className="text-2xl font-bold text-slate-900">
                {loading ? "…" : <><CountUpNumber value={card.value} />{"suffix" in card && card.suffix ? card.suffix : ""}</>}
              </p>
            </motion.div>
          ))}
        </div>
        <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700">
          Predicted Cohort Performance: {performancePrediction}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06 }}
        className="mb-10"
      >
        <FacultyTaskAssignPanel />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="mb-10"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Real-Time Academic Activity</h3>
          <span className="text-xs text-slate-500">Auto refreshing every 10 seconds</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {liveActivityCards.map((item, idx) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * idx, duration: 0.2 }}
              className="faculty-surface rounded-2xl px-4 py-3"
            >
              <p className="text-sm font-semibold text-slate-900">{item.event}</p>
              <p className="mt-1 truncate text-xs text-slate-500">
                {item.student} • {item.label}
              </p>
              <div className="mt-2 flex items-center justify-between">
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${item.statusClass}`}>
                  {item.status}
                </span>
                <span className="text-[11px] text-slate-500">{item.time}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.14 }}
        className="mb-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Insights</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {insights.map((insight, index) => (
            <div
              key={`insight-${index}`}
              className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-700"
            >
              {insight}
            </div>
          ))}
        </div>
      </motion.div>

      {/* QUICK NAV */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28 }}
        className="mb-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Faculty Super Dashboard</h2>
        <>
          <div className="hidden overflow-x-auto rounded-lg border border-slate-200 md:block">
            <table className="w-full text-sm text-left">
              <thead className="sticky top-0 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3">Student Name</th>
                  <th className="px-4 py-3">Register No</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Total Experiments</th>
                  <th className="px-4 py-3">Completed</th>
                  <th className="px-4 py-3">Progress %</th>
                  <th className="px-4 py-3">Total Marks</th>
                  <th className="px-4 py-3">Avg AI Score</th>
                  <th className="px-4 py-3">Rank</th>
                </tr>
              </thead>
              <tbody>
                {effectiveDashboardRows.map((row, idx) => (
                  <tr key={`${row.registerNumber}-${idx}`} className="border-t border-slate-100 text-slate-700 transition-colors odd:bg-white even:bg-slate-50/50 hover:bg-blue-50/60">
                    <td className="px-4 py-3">{row.studentName || "-"}</td>
                    <td className="px-4 py-3">{row.registerNumber || "-"}</td>
                    <td className="px-4 py-3">{formatDepartmentName(row.department, "-")}</td>
                    <td className="px-4 py-3">{row.subject || subjectName || "-"}</td>
                    <td className="px-4 py-3">{row.totalExperiments ?? 0}</td>
                    <td className="px-4 py-3">{row.completedExperiments ?? 0}</td>
                    <td className="px-4 py-3">{row.progressPercentage ?? 0}</td>
                    <td className="px-4 py-3">{formatEvaluationValue(row.totalMarks)}</td>
                    <td className="px-4 py-3">{formatEvaluationValue(row.avgAiScore)}</td>
                    <td className="px-4 py-3">{row.leaderboardRank ?? "-"}</td>
                  </tr>
                ))}
                {effectiveDashboardRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-6 text-center text-sm text-slate-500">
                      No student records available for this subject yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 md:hidden">
            {effectiveDashboardRows.map((row, idx) => (
              <div
                key={`${row.registerNumber}-${idx}-mobile`}
                className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm"
              >
                <p className="font-semibold text-slate-900">{row.studentName || "-"}</p>
                <p className="mt-0.5 text-xs text-slate-500">{row.registerNumber || "-"}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <p>Department: {formatDepartmentName(row.department, "-")}</p>
                  <p>Progress: {row.progressPercentage ?? 0}%</p>
                  <p>Completed: {row.completedExperiments ?? 0}/{row.totalExperiments ?? 0}</p>
                  <p>Marks: {formatEvaluationValue(row.totalMarks)}</p>
                  <p>AI Score: {formatEvaluationValue(row.avgAiScore)}</p>
                  <p>Rank: {row.leaderboardRank ?? "-"}</p>
                </div>
              </div>
            ))}
            {effectiveDashboardRows.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-500 shadow-sm">
                No student records available for this subject yet.
              </div>
            ) : null}
          </div>
        </>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.36 }}
        className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Student Leaderboard</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Completion and marks leaderboard</span>
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left">Rank</th>
                <th className="px-4 py-3 text-left">Student</th>
                <th className="px-4 py-3 text-left">Register No</th>
                <th className="px-4 py-3 text-left">Completed Experiments</th>
                <th className="px-4 py-3 text-left">Average Marks</th>
              </tr>
            </thead>
            <tbody>
              {leaderboardRows.map((row, index) => {
                const medalColor =
                  index === 0 ? "text-emerald-600" : index === 1 ? "text-indigo-600" : index === 2 ? "text-blue-600" : "text-slate-400";
                const totalMarks =
                  Number.isFinite(Number(row.totalMarks)) ? Number(row.totalMarks) : 0;
                const marksProgress = Math.min((totalMarks / maxLeaderboardMarks) * 100, 100);
                const completion = Math.max(Math.min(Number(row.progressPercentage || 0), 100), 0);
                const completionBarClass =
                  completion > 80
                    ? "from-emerald-500 to-green-500"
                    : completion >= 50
                      ? "from-blue-500 to-indigo-500"
                      : "from-rose-500 to-red-500";
                return (
                  <motion.tr
                    key={`${row.registerNumber}-${index}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.03 * index, duration: 0.2 }}
                    className="border-t border-slate-100 odd:bg-white even:bg-slate-50/50 transition-colors hover:bg-blue-50/60"
                  >
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                        <Medal className={`h-4 w-4 ${medalColor}`} />
                        {row.leaderboardRank || index + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{row.studentName || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{row.registerNumber || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <div className="min-w-[160px]">
                        <p className="text-xs font-semibold text-slate-700">{completion}%</p>
                        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r transition-all duration-300 ${completionBarClass}`}
                            style={{ width: `${completion}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="min-w-[160px]">
                        <p className="text-xs font-semibold text-slate-700">{formatEvaluationValue(row.totalMarks)}</p>
                        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-200"
                            style={{ width: `${marksProgress}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
              {leaderboardRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                    No leaderboard data available for this subject yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.37 }}
        className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Faculty Workflow Visualization</h3>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
          {workflowSteps.map((step, index) => (
            <div key={step.key} className="flex items-center gap-3">
              <div className={`w-full rounded-xl border border-slate-200 bg-gradient-to-br ${step.accent} p-4 shadow-sm`}>
                <div className="mb-2 inline-flex rounded-lg bg-white p-2 shadow-sm">
                  {step.icon}
                </div>
                <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                <p className="mt-1 text-xs text-slate-600">{step.description}</p>
              </div>
              {index !== workflowSteps.length - 1 && (
                <ArrowRight className="hidden h-4 w-4 shrink-0 text-slate-300 xl:block" />
              )}
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.38 }}
        className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Submission Activity Feed</h3>
          <span className="text-xs text-slate-500">Live academic workflow updates</span>
        </div>
        <div className="space-y-3">
          {submissionActivity.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 transition duration-150 hover:-translate-y-0.5 hover:bg-blue-50/60"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{item.student}</p>
                <p className="text-xs text-slate-500">{item.label}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${item.statusClass}`}>
                  {item.status}
                </span>
                <span className="text-xs text-slate-500">{item.time}</span>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Quick Actions</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <QuickNavCard
            icon={<CheckCircle className="w-5 h-5 text-emerald-600" />}
            label="View Submissions"
            onClick={() => navigate("/faculty/submissions")}
            delay={0.35}
          />
          <QuickNavCard
            icon={<Clock className="w-5 h-5 text-indigo-600" />}
            label="Set deadlines"
            onClick={() => navigate("/faculty/experiments")}
            delay={0.38}
          />
          <QuickNavCard
            icon={<FlaskConical className="w-5 h-5 text-blue-600" />}
            label="Add experiment"
            onClick={() => navigate("/faculty/add-experiment")}
            delay={0.4}
          />
          <QuickNavCard
            icon={<BarChart3 className="w-5 h-5 text-amber-600" />}
            label="Monitor Exam"
            onClick={() => navigate("/faculty/exams")}
            delay={0.45}
          />
        </div>
      </motion.div>

      <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-slate-900">Recent Submissions</h3>
        <ul className="space-y-3">
          {effectiveDashboardRows.slice(0, 5).map((row, idx) => (
            <li key={`${row.registerNumber}-${idx}`} className="flex items-center justify-between text-sm">
              <div className="truncate mr-3">
                <p className="truncate text-slate-800">{row.studentName}</p>
                <p className="text-xs text-slate-500">{row.registerNumber}</p>
              </div>
              <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                row.progressPercentage === 100 ? "bg-emerald-50 text-emerald-700" :
                row.progressPercentage > 0 ? "bg-blue-50 text-blue-700" :
                "bg-slate-100 text-slate-600"
              }`}>
                {row.progressPercentage === 100 ? "completed" : row.progressPercentage > 0 ? "in progress" : "pending"}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.34 }}
        className="mt-10 mx-auto grid max-w-5xl grid-cols-1 gap-6 min-w-0"
      >
        <div className={chartCardClass}>
          <div className="chart-card-header">
            <div>
              <p className="chart-card-title">Experiment Progress</p>
              <p className="chart-card-sub">
                Experiment vs marks · Total {effectiveExperimentStats.total} · Completed {effectiveExperimentStats.completed} · Pending {effectiveExperimentStats.pending}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                  Marks
              </span>
            </div>
          </div>
          <div className="h-64 min-h-[220px] min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={260} minHeight={220}>
              <BarChart data={effectiveExperimentProgressWithCompletion} barCategoryGap="26%" barGap={6}>
                <defs>
                  <linearGradient id="submissionCountBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity={0.96} />
                    <stop offset="100%" stopColor="#4F46E5" stopOpacity={0.8} />
                  </linearGradient>
                  <filter id="submissionBarShadow" x="-30%" y="-20%" width="170%" height="180%">
                    <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#1D4ED8" floodOpacity="0.22" />
                  </filter>
                </defs>
                <CartesianGrid strokeDasharray="3 5" stroke="rgba(148,163,184,0.32)" vertical={false} />
                <XAxis
                  dataKey="experiment"
                  stroke="#64748B"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  angle={-24}
                  textAnchor="end"
                  height={56}
                  tickMargin={8}
                  tickFormatter={(value) => compactAxisLabel(value, 14)}
                />
                <YAxis stroke="#64748B" tickLine={false} axisLine={false} fontSize={11} width={34} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "rgba(37, 99, 235, 0.08)" }}
                  content={<SaaSTooltip valueSuffix="Marks" showCompletion />}
                  wrapperStyle={{ outline: "none" }}
                />
                <Bar
                  dataKey="count"
                  fill="url(#submissionCountBar)"
                  filter="url(#submissionBarShadow)"
                  radius={[8, 8, 0, 0]}
                  maxBarSize={38}
                  activeBar={{ fill: "#4F46E5", stroke: "#2563EB", strokeWidth: 1 }}
                  isAnimationActive
                  animationDuration={260}
                  animationEasing="ease-out"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={chartCardClass}>
          <div className="chart-card-header">
            <div>
              <p className="chart-card-title">Weekly Submission Trend</p>
              <p className="chart-card-sub">{effectiveSubjectName} · Day-by-day activity</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                Trend
              </span>
            </div>
          </div>
          <div className="h-64 min-h-[220px] min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={260} minHeight={220}>
              <LineChart data={effectiveWeeklyTrendData}>
                <defs>
                  <linearGradient id="weeklyLineArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(79,70,229,0.16)" />
                    <stop offset="100%" stopColor="rgba(79,70,229,0.02)" />
                  </linearGradient>
                  <linearGradient id="weeklyLineStroke" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#2563EB" />
                    <stop offset="100%" stopColor="#4F46E5" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 6" stroke="#E2E8F0" vertical={false} />
                <XAxis
                  dataKey="day"
                  stroke="#64748B"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <YAxis stroke="#64748B" tickLine={false} axisLine={false} fontSize={11} width={34} allowDecimals={false} />
                <Tooltip
                  content={<SaaSTooltip valueSuffix="Submissions" labelPrefix="Day" />}
                  cursor={{ stroke: "rgba(79,70,229,0.22)", strokeWidth: 1 }}
                  wrapperStyle={{ outline: "none" }}
                />
                <Area
                  type="monotone"
                  dataKey="submissions"
                  fill="url(#weeklyLineArea)"
                  stroke="none"
                  isAnimationActive
                  animationDuration={240}
                />
                <Line
                  type="monotone"
                  dataKey="submissions"
                  stroke="url(#weeklyLineStroke)"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#4F46E5", stroke: "#E0E7FF", strokeWidth: 2 }}
                  activeDot={{ r: 7, fill: "#4F46E5", stroke: "#C7D2FE", strokeWidth: 2 }}
                  isAnimationActive
                  animationDuration={260}
                  animationEasing="ease-out"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={chartCardClass}>
          <div className="chart-card-header">
            <div>
              <p className="chart-card-title">Submission Status</p>
              <p className="chart-card-sub">{effectiveSubjectName} · Status split</p>
            </div>
            <div className="flex items-center gap-2">
              {submissionStatusData.map((item) => (
                <span key={`status-legend-${item.name}`} className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.name}
                </span>
              ))}
            </div>
          </div>
          <div className="relative h-64 min-h-[220px] min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={260} minHeight={220}>
              <PieChart>
                <Pie
                  data={submissionStatusData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={98}
                  paddingAngle={3}
                  startAngle={90}
                  endAngle={-270}
                  labelLine={false}
                  label={renderPieSliceLabel}
                  activeIndex={activePieIndex ?? -1}
                  activeShape={renderActiveDonutShape}
                  onMouseEnter={(_, index) => setActivePieIndex(index)}
                  onMouseLeave={() => setActivePieIndex(null)}
                  isAnimationActive
                  animationDuration={260}
                  animationEasing="ease-out"
                >
                  {submissionStatusData.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={entry.color}
                      stroke={activePieIndex === index ? "#0F172A" : "#FFFFFF"}
                      strokeWidth={activePieIndex === index ? 2 : 1}
                      opacity={activePieIndex === null || activePieIndex === index ? 1 : 0.75}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={<DonutTooltip total={submissionStatusTotal} />}
                  wrapperStyle={{ outline: "none" }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="rounded-full bg-white/95 px-4 py-2 text-center shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total</p>
                <p className="text-lg font-bold text-slate-900">{submissionStatusTotal}</p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <BarChart3 className="h-5 w-5 text-blue-600" />
          Exam Results Snapshot
        </h2>
        <div className="space-y-2">
          {effectiveExamSummaries.slice(0, 5).map((exam) => (
            <div
              key={exam.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-slate-900">{exam.title}</p>
                <p className="text-xs text-slate-500">Room: {exam.roomId}</p>
              </div>
              <div className="text-right text-sm">
                <p className="text-slate-600">Submissions: {exam.submissions}</p>
                <p className="text-slate-600">
                  Avg Marks: {exam.avgMarks === null ? "-" : exam.avgMarks}
                </p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function CountUpNumber({ value, duration = 800 }: { value: number; duration?: number }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const safeValue = Number.isFinite(value) ? value : 0;
    const totalFrames = Math.max(Math.floor(duration / 16), 1);
    const increment = safeValue / totalFrames;
    let currentFrame = 0;

    const id = window.setInterval(() => {
      currentFrame += 1;
      if (currentFrame >= totalFrames) {
        setDisplayValue(Math.round(safeValue));
        window.clearInterval(id);
        return;
      }
      setDisplayValue(Math.round(currentFrame * increment));
    }, 16);

    return () => window.clearInterval(id);
  }, [value, duration]);

  return <>{displayValue.toLocaleString()}</>;
}

function DashboardLoadingSkeleton() {
  return (
    <div className="space-y-10 text-slate-800">
      <div className="faculty-glass faculty-gradient-ring rounded-3xl p-6">
        <div className="faculty-shimmer h-6 w-56 rounded bg-slate-200" />
        <div className="faculty-shimmer mt-3 h-4 w-72 rounded bg-slate-100" />
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={`dashboard-top-stat-skeleton-${idx}`}
              className="faculty-shimmer h-24 rounded-2xl border border-slate-200 bg-slate-50"
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div
            key={`dashboard-stat-skeleton-${idx}`}
            className="faculty-shimmer h-28 rounded-2xl border border-slate-200 bg-white shadow-sm"
          />
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="faculty-shimmer mb-4 h-5 w-64 rounded bg-slate-200" />
        <div className="faculty-shimmer h-72 rounded-xl border border-slate-200 bg-slate-50" />
      </div>

      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="faculty-shimmer mb-4 h-4 w-48 rounded bg-slate-200" />
          <div className="flex h-60 items-end gap-3 rounded-xl bg-slate-50 p-4">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div
                key={`chart-bar-skeleton-${idx}`}
                className="faculty-shimmer w-full rounded-t-md bg-slate-200"
                style={{ height: `${35 + (idx % 5) * 10}%` }}
              />
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="faculty-shimmer mb-4 h-4 w-56 rounded bg-slate-200" />
          <div className="faculty-shimmer h-60 rounded-xl bg-slate-100" />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="faculty-shimmer mb-4 h-4 w-52 rounded bg-slate-200" />
          <div className="flex h-60 items-center justify-center rounded-xl bg-slate-50">
            <div className="faculty-shimmer h-36 w-36 rounded-full border-8 border-slate-200 bg-white" />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="faculty-shimmer mb-4 h-5 w-44 rounded bg-slate-200" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div
              key={`dashboard-leaderboard-row-skeleton-${idx}`}
              className="faculty-shimmer h-10 rounded-lg bg-slate-100"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function renderActiveDonutShape(props: any) {
  const {
    cx,
    cy,
    innerRadius,
    outerRadius,
    startAngle,
    endAngle,
    fill,
    payload,
    value,
  } = props;
  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <text x={cx} y={cy - 8} textAnchor="middle" fill="#334155" fontSize={11} fontWeight={600}>
        {payload?.name}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill="#0F172A" fontSize={13} fontWeight={700}>
        {value}
      </text>
    </g>
  );
}

function renderPieSliceLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}: any) {
  if (!Number.isFinite(percent) || percent <= 0) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + radius * Math.cos((-midAngle * Math.PI) / 180);
  const y = cy + radius * Math.sin((-midAngle * Math.PI) / 180);
  return (
    <text x={x} y={y} fill="#FFFFFF" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
      {(percent * 100).toFixed(0)}%
    </text>
  );
}

function SaaSTooltip({
  active,
  payload,
  label,
  valueSuffix,
  labelPrefix,
  showCompletion = false,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; name?: string; payload?: { completion?: number } }>;
  label?: string;
  valueSuffix?: string;
  labelPrefix?: string;
  showCompletion?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const value = Number(item?.value || 0);
  const completion = Number(item?.payload?.completion || 0);
  return (
    <motion.div
      initial={{ opacity: 0, y: 4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      style={{ ...chartTooltipStyle, padding: "8px 12px" }}
    >
      <p className="text-xs font-medium text-slate-300">
        {labelPrefix ? `${labelPrefix}: ` : ""}
        {label}
      </p>
      <p className="text-sm font-semibold text-white">
        {value} {valueSuffix || ""}
      </p>
      {showCompletion ? (
        <p className="text-[11px] text-slate-300">Completion: {completion}%</p>
      ) : null}
    </motion.div>
  );
}

function DonutTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; name?: string }>;
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const value = Number(item?.value || 0);
  const percent = total > 0 ? (value / total) * 100 : 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      style={{ ...chartTooltipStyle, padding: "8px 12px" }}
    >
      <p className="text-xs font-medium text-slate-300">{item?.name}</p>
      <p className="text-sm font-semibold text-white">
        {value} Experiments ({percent.toFixed(0)}%)
      </p>
    </motion.div>
  );
}

function QuickNavCard({
  icon,
  label,
  onClick,
  delay = 0,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  delay?: number;
}) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      whileHover={{ y: -4, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="group flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:border-blue-200 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
    >
      <div className="rounded-lg bg-slate-100 p-2 transition-colors group-hover:bg-blue-50">
        {icon}
      </div>
      <span className="text-sm font-medium text-slate-700 transition-colors group-hover:text-slate-900">
        {label}
      </span>
      <ArrowRight className="ml-auto h-4 w-4 text-slate-400 transition-colors group-hover:text-blue-600" />
    </motion.button>
  );
}
