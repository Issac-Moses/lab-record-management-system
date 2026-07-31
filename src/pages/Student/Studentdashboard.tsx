import type React from "react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { fadeUp } from "@/animations/motion";
import {
  BookOpen,
  ClipboardCheck,
  User,
  LogOut,
  GraduationCap,
  Activity,
  FileText,
  PlusCircle,
  FlaskConical,
  Award,
  Sparkles,
  TrendingUp,
  ExternalLink,
  Zap,
  ClipboardList,
} from "lucide-react";
import { DashboardSkeleton } from "@/components/ui/StudentSkeletons";
import {
  clearSelectedSubjectInStorage,
  getSelectedSubjectFromStorage,
  setSelectedSubjectInStorage,
  useSelectedSubject,
} from "@/context/SubjectContext";
// @ts-ignore – JS file without declaration file
import ProgressCards from "@/components/gamification/ProgressCards";
// @ts-ignore – JS file without declaration file
import LabProgressBar from "@/components/gamification/LabProgressBar";
// @ts-ignore – JS file without declaration file
import LeaderboardWidget from "@/components/gamification/LeaderboardWidget";
// @ts-ignore – JS file without declaration file
import AchievementsPanel from "@/components/gamification/AchievementsPanel";
// @ts-ignore – JS file without declaration file
import ContributionHeatmap from "@/components/gamification/ContributionHeatmap";
// @ts-ignore – JS file without declaration file
import StudentQuestPanel from "@/components/gamification/StudentQuestPanel";
import {
  getUserProgress,
  mergeProgressWithExperimentActivity,
  trySyncStudentProgress,
} from "@/services/studentGamificationService";
// @ts-ignore – JS file without declaration file
import { formatDateTime } from "@/utils/dateFormat";
// @ts-ignore – JS file without declaration file
import { getStatusConfig } from "@/utils/statusConfig";
import { getStudentExperimentData } from "@/utils/unifiedStudentData";
const STUDENT_DATA_UPDATED_EVENT = "student-data-updated";

interface DashboardStats {
  totalExperiments: number;
  completed: number;
  pending: number;
  draft: number;
}

export default function StudentDashboard() {
  const STUDENT_DASHBOARD_ERROR =
    "Unable to load your dashboard right now. Please try again.";
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [studentName, setStudentName] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [stats, setStats] = useState<DashboardStats>({
    totalExperiments: 0,
    completed: 0,
    pending: 0,
    draft: 0,
  });
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([]);
  const [allSubmissions, setAllSubmissions] = useState<any[]>([]);
  const [progressRows, setProgressRows] = useState<Array<{ studentName: string; progressPercentage: number }>>([]);
  const [currentProgress, setCurrentProgress] = useState<number>(0);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [gamificationLoading, setGamificationLoading] = useState(true);
  const [gamificationProgress, setGamificationProgress] = useState({
    xp_points: 0,
    level: 1,
    labs_completed: 0,
    current_streak: 0,
  });
  const [currentUserId, setCurrentUserId] = useState("");
  const [department, setDepartment] = useState("");
  const [activeRecentId, setActiveRecentId] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [questTick, setQuestTick] = useState(0);
  /** Latest completed-lab count for gamification merge (quest callback closure). */
  const completedLabsRef = useRef(0);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { selectedSubjectId, selectedSubjectName } = useSelectedSubject();
  const querySubjectId = searchParams.get("subject");
  const querySubjectName = searchParams.get("subjectName");
  const subjectFilterId = selectedSubjectId || querySubjectId || localStorage.getItem("student_subject_id");
  const effectiveSubjectName =
    selectedSubjectName || querySubjectName || localStorage.getItem("student_subject_name") || "";

  const navigateToExamMarks = () => {
    const q = new URLSearchParams();
    if (subjectFilterId) q.set("subject", String(subjectFilterId));
    if (effectiveSubjectName) q.set("subjectName", effectiveSubjectName);
    navigate(`/student/exam-marks${q.toString() ? `?${q.toString()}` : ""}`);
  };

  const navigateToExperiments = () => {
    const q = new URLSearchParams();
    if (subjectFilterId) q.set("subject", String(subjectFilterId));
    if (effectiveSubjectName) q.set("subjectName", effectiveSubjectName);
    navigate(`/student/experiments${q.toString() ? `?${q}` : ""}`);
  };

  useEffect(() => {
    let active = true;

    const syncSubjectFromQuery = async () => {
      if (!querySubjectId) return;

      const stored = getSelectedSubjectFromStorage();
      if (stored.subjectId === querySubjectId && stored.subjectName) return;

      const { data, error } = await supabase
        .from("subjects")
        .select("name")
        .eq("id", querySubjectId)
        .maybeSingle();

      if (!active) return;
      if (error) {
        setSelectedSubjectInStorage(querySubjectId, "");
        return;
      }

      setSelectedSubjectInStorage(querySubjectId, String(data?.name || ""));
    };

    void syncSubjectFromQuery();
    return () => {
      active = false;
    };
  }, [querySubjectId]);

  useEffect(() => {
    if (!subjectFilterId) {
      setLoading(false);
      return;
    }
    setDashboardError(null);
    setSubjectName(selectedSubjectName || querySubjectName || localStorage.getItem("student_subject_name") || "");

    const checkStudent = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          navigate("/login");
          return;
        }

        const { data: profile, error } = await supabase
          .from("profiles")
          .select("role, department, name, register_no")
          .eq("id", data.session.user.id)
          .single();

        if (error || profile?.role !== "student") {
          navigate("/login");
          return;
        }

        if (data.session.user.email) {
          setEmail(data.session.user.email);
        }
        setCurrentUserId(data.session.user.id);
        setDepartment(profile?.department || "");
        setStudentName(String(profile?.name || "").trim());
        const unified = await getStudentExperimentData({
          subjectId: subjectFilterId,
          subjectName:
            selectedSubjectName || querySubjectName || localStorage.getItem("student_subject_name") || "",
          searchParams,
        });
        let experiments = unified.experiments;
        if (experiments.length === 0) {
          const subjectNameCandidate =
            selectedSubjectName || querySubjectName || localStorage.getItem("student_subject_name") || "";
          let subjectIdsToTry = [String(subjectFilterId || "").trim()].filter(Boolean);
          if (subjectNameCandidate) {
            const subjectLookup = await supabase.from("subjects").select("id").eq("name", subjectNameCandidate);
            const lookupIds = (Array.isArray(subjectLookup.data) ? subjectLookup.data : [])
              .map((row) => String((row as Record<string, unknown>)?.id || "").trim())
              .filter(Boolean);
            subjectIdsToTry = [...new Set([...subjectIdsToTry, ...lookupIds])];
          }
          for (const candidateSubjectId of subjectIdsToTry) {
            const experimentsRes = await supabase
              .from("experiments")
              .select("id,title,experiment_no")
              .eq("subject_id", candidateSubjectId)
              .order("experiment_no", { ascending: true });
            if (!experimentsRes.error && Array.isArray(experimentsRes.data) && experimentsRes.data.length > 0) {
              experiments = (experimentsRes.data as Record<string, unknown>[]).map((row, index) => ({
                id: String(row?.id || `exp-${index + 1}`),
                experimentId: String(row?.id || `exp-${index + 1}`),
                experimentNo: Number(row?.experiment_no || 0),
                title: String(row?.title || `Experiment ${index + 1}`),
                status: "pending",
                marks: 0,
                finalMarks: 0,
                isCompleted: false,
                updatedAt: null,
              })) as typeof unified.experiments;
              if (candidateSubjectId !== String(subjectFilterId)) {
                localStorage.setItem("student_subject_id", candidateSubjectId);
                if (subjectNameCandidate) localStorage.setItem("student_subject_name", subjectNameCandidate);
              }
              break;
            }
          }
        }
        const total = experiments.length;
        const completed = experiments.filter((exp) => exp.isCompleted).length;
        completedLabsRef.current = completed;
        const draft = experiments.filter(
          (exp) => Number(exp.marks || 0) <= 0 && String(exp.status || "").toLowerCase() === "draft"
        ).length;
        const pending = Math.max(total - completed - draft, 0);
        setStats({
          totalExperiments: total,
          completed,
          pending,
          draft,
        });
        const submittedOrUpdatedExps = [...experiments]
          .filter((exp) => exp.updatedAt || exp.status === "submitted" || exp.status === "evaluated" || exp.status === "approved" || exp.isCompleted)
          .sort((a, b) => {
            const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            return timeB - timeA;
          });

        setRecentSubmissions(
          (submittedOrUpdatedExps.length > 0 ? submittedOrUpdatedExps : experiments)
            .slice(0, 5)
            .map((exp) => ({
              id: exp.id,
              status: exp.status,
              marks: exp.marks,
              updated_at: exp.updatedAt,
              experiments: {
                experiment_no: String(exp.experimentNo),
                title: exp.title,
              },
            }))
        );
        setAllSubmissions(
          experiments
            .filter((exp) => exp.updatedAt || exp.isCompleted || exp.status === "submitted" || exp.status === "evaluated")
            .map((exp) => ({ updated_at: exp.updatedAt || new Date().toISOString() }))
        );
        const percent = total ? Math.round((completed / total) * 100) : 0;
        setCurrentProgress(percent);
        setProgressRows([
          {
            studentName: String(profile?.name || "You"),
            progressPercentage: percent,
          },
        ]);

        try {
          await trySyncStudentProgress(data.session.user.id);
        } catch (e) {
          console.warn("Failed to sync progress:", e);
        }

        try {
          const progress = await getUserProgress(data.session.user.id);
          setGamificationProgress(mergeProgressWithExperimentActivity(progress, completed));
        } catch (gamificationError) {
          setGamificationProgress(
            mergeProgressWithExperimentActivity(
              {
                xp_points: 0,
                level: 1,
                labs_completed: 0,
                current_streak: 0,
              },
              completed
            )
          );
        } finally {
          setGamificationLoading(false);
        }

        setLoading(false);
      } catch (error) {
        setDashboardError(STUDENT_DASHBOARD_ERROR);
        setGamificationLoading(false);
        setLoading(false);
      }
    };

    checkStudent();
  }, [navigate, querySubjectName, subjectFilterId, selectedSubjectName, searchParams, refreshTick]);

  useEffect(() => {
    if (!subjectFilterId) return;
    const onDataUpdated = () => {
      setRefreshTick((prev) => prev + 1);
    };
    const onFocus = () => {
      setRefreshTick((prev) => prev + 1);
    };
    window.addEventListener(STUDENT_DATA_UPDATED_EVENT, onDataUpdated);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener(STUDENT_DATA_UPDATED_EVENT, onDataUpdated);
      window.removeEventListener("focus", onFocus);
    };
  }, [subjectFilterId]);

  async function logout() {
    await supabase.auth.signOut();
    clearSelectedSubjectInStorage();
    localStorage.removeItem("faculty_subject_id");
    localStorage.removeItem("faculty_subject_name");
    localStorage.removeItem("dept");
    localStorage.removeItem("year");
    localStorage.removeItem("semester");
    localStorage.removeItem("role_setup_done");
    navigate("/login");
  }

  if (!subjectFilterId) {
    return (
      <div className="faculty-bg-vibrant min-h-screen px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto w-full max-w-[1380px]">
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

  if (loading) {
    return <DashboardSkeleton />;
  }

  const computedProgressPercentage =
    stats.totalExperiments > 0
      ? Math.round((stats.completed / stats.totalExperiments) * 100)
      : 0;
  const progressPercentage = currentProgress || computedProgressPercentage;

  const greetingText = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const formattedDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="student-page-enter faculty-bg-vibrant min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto w-full max-w-[1380px]">
      {/* HEADER */}
      <motion.div
        {...fadeUp}
        className="faculty-glass faculty-gradient-ring relative mb-10 overflow-hidden rounded-3xl p-6 md:p-8"
      >
        <div className="pointer-events-none absolute -top-16 -right-16 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.24)_0%,rgba(59,130,246,0.12)_38%,rgba(59,130,246,0.04)_58%,transparent_74%)] blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.2)_0%,rgba(99,102,241,0.1)_42%,rgba(99,102,241,0.03)_62%,transparent_76%)] blur-2xl" />
        <div className="pointer-events-none absolute right-24 top-10 h-24 w-24 rounded-full bg-blue-400/10 blur-2xl" />
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="mb-1 text-sm text-slate-500"
            >
              {formattedDate}
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 }}
              className="bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-3xl font-bold text-transparent md:text-4xl"
            >
              {greetingText}{studentName ? `, ${studentName}` : ""}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
              className="mt-2 flex items-center gap-2 text-sm text-slate-600"
            >
              <GraduationCap className="h-4 w-4 text-blue-600" />
              {subjectName || "No subject selected"}
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Active
          </motion.div>
        </div>
      </motion.div>

      {/* QUICK ACTIONS */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.04, duration: 0.2, ease: "easeOut" }}
        className="mb-10 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5"
      >
        <motion.button
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => navigate(`/student/experiments?subject=${subjectFilterId || ""}`)}
          className="student-btn-primary inline-flex min-h-[44px] w-full items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.2)] transition-all duration-150 hover:shadow-[0_16px_30px_rgba(37,99,235,0.25)]"
        >
          <PlusCircle className="w-4 h-4" />
          Open Experiments
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => navigate(`/student/experiments?subject=${subjectFilterId || ""}`)}
          className="student-btn-primary inline-flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-5 py-2.5 text-sm text-slate-700 transition-all duration-150 hover:bg-slate-200/80"
        >
          <FlaskConical className="h-4 w-4 text-blue-600" />
          My Experiments
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => navigate("/student/results")}
          className="student-btn-primary inline-flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-5 py-2.5 text-sm text-slate-700 transition-all duration-150 hover:bg-slate-200/80"
        >
          <Award className="h-4 w-4 text-amber-600" />
          View Marks
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => navigate("/exam/login")}
          className="student-btn-primary inline-flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-5 py-2.5 text-sm text-slate-700 transition-all duration-150 hover:bg-slate-200/80"
        >
          <Zap className="h-4 w-4 text-indigo-600" />
          Exam Portal
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={navigateToExamMarks}
          className="student-btn-primary inline-flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-5 py-2.5 text-sm text-slate-700 transition-all duration-150 hover:bg-slate-200/80"
        >
          <ClipboardList className="h-4 w-4 text-blue-600" />
          Exam results
        </motion.button>
      </motion.div>

      {/* STATS */}
      {dashboardError ? (
        <div className="faculty-surface mb-6 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          {dashboardError}
        </div>
      ) : null}
      <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-5">
        <StatCard 
          icon={<BookOpen />} 
          title="Total Experiments" 
          value={stats.totalExperiments.toString()} 
          accent="indigo"
        />
        <StatCard 
          icon={<ClipboardCheck />} 
          title="Completed" 
          value={stats.completed.toString()} 
          accent="emerald"
        />
        <StatCard 
          icon={<Activity />} 
          title="Pending" 
          value={stats.pending.toString()} 
          accent="amber"
        />
        <StatCard
          icon={<FileText />}
          title="Draft"
          value={stats.draft.toString()}
          accent="blue"
        />
        <StatCard 
          icon={<TrendingUp />} 
          title="Progress" 
          value={`${progressPercentage}%`} 
          accent="indigo"
          progress={progressPercentage}
        />
      </div>

      {/* CONTENT */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent Submissions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.2, ease: "easeOut" }}
          className="faculty-surface rounded-2xl p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="rounded-lg bg-blue-50 p-2">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">Recent Submissions</h3>
          </div>
          {recentSubmissions.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
              <p className="mb-3 text-sm text-slate-500">No submissions yet.</p>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigateToExperiments()}
                className="text-sm font-semibold text-blue-700 hover:underline"
              >
                Open experiments →
              </motion.button>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {recentSubmissions.map((sub, idx) => {
                const statusBorder =
                  sub.status === "evaluated" || sub.status === "completed"
                    ? "hover:border-emerald-200"
                    : sub.status === "draft"
                    ? "hover:border-slate-300"
                    : "hover:border-amber-200";
                return (
                  <motion.li
                    key={sub.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.12 + idx * 0.06, duration: 0.2, ease: "easeOut" }}
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.995 }}
                    onClick={() => setActiveRecentId(String(sub.id))}
                    className={`student-row flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-blue-200 hover:bg-blue-50/60 ${statusBorder} ${activeRecentId === String(sub.id) ? "student-row-active border-indigo-300" : ""}`}
                  >
                    <span className="max-w-[50%] truncate text-sm font-medium text-slate-700">
                      {subjectName || "Subject"} · Exp{" "}
                      {sub.experiments?.experiment_no || "?"} - {sub.experiments?.title || "Untitled"}
                    </span>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <StatusBadge status={sub.status} />
                      <span className="hidden text-xs text-slate-500 sm:inline">
                        {formatDateTime(sub.updated_at)}
                      </span>
                      <span className="text-xs text-slate-500">Marks: {sub.marks ?? "-"}</span>
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </motion.div>

        {/* Purposeful Quick Links */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.2, ease: "easeOut" }}
          className="faculty-surface rounded-2xl p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Quick Workspace Links</h3>
              <p className="text-xs text-slate-500">Fast access to your core lab tools</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <motion.button
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigateToExperiments()}
              className="group flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-4 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <FlaskConical className="h-5 w-5" />
                </div>
                <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
              </div>
              <div>
                <span className="font-bold text-slate-900 text-sm block">Lab Experiments</span>
                <span className="text-xs text-slate-500 line-clamp-1 mt-0.5">Start coding & perform practicals</span>
              </div>
            </motion.button>

            <motion.button
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate("/student/submissions")}
              className="group flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-4 text-left shadow-sm transition-all hover:border-indigo-300 hover:shadow-md"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <FileText className="h-5 w-5" />
                </div>
                <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
              </div>
              <div>
                <span className="font-bold text-slate-900 text-sm block">My Submissions</span>
                <span className="text-xs text-slate-500 line-clamp-1 mt-0.5">Review status & faculty reviews</span>
              </div>
            </motion.button>

            <motion.button
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate("/student/results")}
              className="group flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-4 text-left shadow-sm transition-all hover:border-emerald-300 hover:shadow-md"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
              </div>
              <div>
                <span className="font-bold text-slate-900 text-sm block">Marks & Grades</span>
                <span className="text-xs text-slate-500 line-clamp-1 mt-0.5">Internal marks breakdown</span>
              </div>
            </motion.button>

            <motion.button
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate("/student/profile")}
              className="group flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-4 text-left shadow-sm transition-all hover:border-amber-300 hover:shadow-md"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                  <User className="h-5 w-5" />
                </div>
                <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-amber-600 transition-colors" />
              </div>
              <div>
                <span className="font-bold text-slate-900 text-sm block">Profile & Settings</span>
                <span className="text-xs text-slate-500 line-clamp-1 mt-0.5">Account & personal details</span>
              </div>
            </motion.button>
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="student-scroll-reveal chart-card mt-10"
      >
        <div className="chart-card-header">
          <div>
            <p className="chart-card-title">Student Progress</p>
            <p className="chart-card-sub">Completion percentage by student</p>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
            <TrendingUp className="h-3.5 w-3.5" />
            Live
          </div>
        </div>
        {progressRows.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
            No progress data available.
          </div>
        ) : (
          <div className="space-y-4">
            {progressRows.map((row, idx) => (
              <motion.div
                key={`${row.studentName}-${idx}`}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.06 }}
              >
                <div className="mb-1.5 flex items-center justify-between text-sm text-slate-700">
                  <span className="font-medium">{row.studentName}</span>
                  <span className="text-xs text-slate-500">{row.progressPercentage}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: `${Math.max(0, Math.min(100, row.progressPercentage))}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8, delay: 0.2 + idx * 0.06, ease: "easeOut" }}
                    className="h-full rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500"
                  />
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* ================= GAMIFICATION ================= */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="student-scroll-reveal mt-10"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100">
            <Zap className="h-5 w-5 text-indigo-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-slate-900">Gamification</h2>
            <p className="text-xs text-slate-500">Track your progress, earn XP, and climb the ranks</p>
          </div>
          {!gamificationLoading && (
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
                Level {gamificationProgress.level || 1}
              </span>
              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                {Number(gamificationProgress.xp_points || 0).toLocaleString()} XP
              </span>
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                {gamificationProgress.current_streak || 0} day streak
              </span>
            </div>
          )}
        </div>

        {gamificationLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="faculty-shimmer h-32 rounded-2xl border border-slate-200 bg-white" />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            <StudentQuestPanel
              onProgressUpdated={async () => {
                const {
                  data: { session },
                } = await supabase.auth.getSession();
                if (!session?.user?.id) return;
                try {
                  const progress = await getUserProgress(session.user.id);
                  setGamificationProgress(
                    mergeProgressWithExperimentActivity(progress, completedLabsRef.current)
                  );
                  setQuestTick((t) => t + 1);
                  window.dispatchEvent(new CustomEvent(STUDENT_DATA_UPDATED_EVENT));
                } catch {
                  /* ignore */
                }
              }}
            />
            <ProgressCards progress={gamificationProgress} totalLabs={stats.totalExperiments || 0} />
            <LabProgressBar
              labs_completed={gamificationProgress?.labs_completed || 0}
              total_labs={stats.totalExperiments || 0}
            />
            <ContributionHeatmap submissions={allSubmissions} weeks={12} />
            <div className="grid md:grid-cols-2 gap-6">
              <LeaderboardWidget
                key={`lb-${questTick}`}
                department={department}
                currentUserId={currentUserId}
              />
              <AchievementsPanel userId={currentUserId} refreshKey={questTick} />
            </div>
          </div>
        )}
      </motion.div>
      </div>
    </div>
  );
}

/* ================= COMPONENTS ================= */

function StatCard({
  icon,
  title,
  value,
  progress,
  accent = "indigo",
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  progress?: number;
  accent?: "indigo" | "blue" | "emerald" | "amber";
}) {
  const accentMap: Record<string, { iconBg: string; iconText: string; valueText: string; barGrad: string }> = {
    indigo:  { iconBg: "bg-indigo-50",  iconText: "text-indigo-600",  valueText: "text-slate-900",   barGrad: "from-blue-600 to-indigo-600" },
    blue:    { iconBg: "bg-blue-50",    iconText: "text-blue-600",    valueText: "text-blue-700",    barGrad: "from-blue-500 to-blue-600" },
    emerald: { iconBg: "bg-emerald-50", iconText: "text-emerald-600", valueText: "text-emerald-700", barGrad: "from-emerald-500 to-emerald-600" },
    amber:   { iconBg: "bg-amber-50",   iconText: "text-amber-600",   valueText: "text-amber-700",   barGrad: "from-amber-500 to-amber-600" },
  };
  const a = accentMap[accent || "indigo"] || accentMap.indigo;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -3, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="student-card-interactive chart-card relative p-5"
    >
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <motion.div
            whileHover={{ rotate: [0, -10, 10, -10, 0] }}
            transition={{ duration: 0.2 }}
            className={`p-2.5 rounded-xl ${a?.iconBg || "bg-indigo-50"}`}
          >
            <div className={a?.iconText || "text-indigo-600"}>{icon}</div>
          </motion.div>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className={`text-2xl font-bold ${a?.valueText || "text-slate-900"} mb-0.5`}
        >
          {value}
        </motion.div>
        <span className="text-xs text-slate-500">{title}</span>
        {progress !== undefined && (
          <div className="mt-3">
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5, delay: 0.12, ease: "easeOut" }}
                className={`h-full bg-gradient-to-r ${a?.barGrad || "from-blue-600 to-indigo-600"} rounded-full`}
              />
            </div>
            <p className="mt-1.5 text-xs text-slate-500">{progress}% Complete</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = String(status || "").toLowerCase();
  const map: Record<string, string> = {
    completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
    evaluated: "border-emerald-200 bg-emerald-50 text-emerald-700",
    pending: "border-amber-200 bg-amber-50 text-amber-700",
    draft: "border-slate-200 bg-slate-100 text-slate-700",
    submitted: "border-blue-200 bg-blue-50 text-blue-700",
  };
  const display = getStatusConfig(status);
  const badgeClass = map[normalized] || "border-slate-200 bg-slate-100 text-slate-700";

  return (
    <motion.span
      key={normalized}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.03 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={`student-status-badge inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${badgeClass}`}
    >
      <span className="h-2 w-2 rounded-full bg-current opacity-70" />
      {display.label}
    </motion.span>
  );
}
