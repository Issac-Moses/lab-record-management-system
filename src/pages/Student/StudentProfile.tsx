import type React from "react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ProfileSkeleton } from "@/components/ui/StudentSkeletons";
import { clearSelectedSubjectInStorage, getSelectedSubjectFromStorage } from "@/context/SubjectContext";
// @ts-ignore – JS file without declaration file
import { getStatusConfig } from "@/utils/statusConfig";
import { getStudentExperimentData, type UnifiedExperiment } from "@/utils/unifiedStudentData";
import {
  User,
  Mail,
  Shield,
  GraduationCap,
  LogOut,
  Settings,
  Key,
  FlaskConical,
  Clock,
  CheckCircle2,
  Send,
  Lock,
  Sparkles,
  Activity,
  Award,
  Flame,
  Trophy,
  Hash,
  Building2,
  BookOpen,
} from "lucide-react";
import {
  getUserProgress,
  getUserAchievements,
  mergeProgressWithExperimentActivity,
  type GamificationProgress,
} from "@/services/studentGamificationService";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return ((parts[0][0] || "") + (parts[1][0] || "")).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export default function StudentProfile() {
  const STUDENT_PROFILE_ERROR = "Unable to load your profile right now. Please try again.";
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("student");
  const [registerNo, setRegisterNo] = useState("N/A");
  const [department, setDepartment] = useState("N/A");
  const [yearSemester, setYearSemester] = useState("N/A");
  const [activeSubjectName, setActiveSubjectName] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [experiments, setExperiments] = useState<UnifiedExperiment[]>([]);
  const [gamificationProgress, setGamificationProgress] = useState<GamificationProgress | null>(null);
  const [achievements, setAchievements] = useState<
    Array<{ id: string; name: string; description: string; xp_reward: number; earned_at: string | null }>
  >([]);

  const evaluatedCount = experiments.filter((exp) => exp.status === "evaluated" || exp.status === "approved").length;
  const submittedCount = experiments.filter((exp) => exp.status === "submitted").length;
  const pendingCount = experiments.filter((exp) => exp.status === "pending" || exp.status === "draft").length;

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setError(null);
        const { data } = await supabase.auth.getSession();

        if (!data.session) {
          navigate("/login");
          return;
        }

        const userId = data.session.user.id;

        // 1️⃣ Fetch Profile details
        const { data: profile, error: profileErr } = await supabase
          .from("profiles")
          .select("role, name, register_no, department, year, semester")
          .eq("id", userId)
          .single();

        if (profileErr || profile?.role !== "student") {
          navigate("/login");
          return;
        }

        setEmail(data.session.user.email || "");
        setRole(profile.role || "student");
        setName(profile.name || "Student");
        setRegisterNo(profile.register_no || "N/A");
        setDepartment(profile.department || "N/A");

        if (profile.year || profile.semester) {
          setYearSemester(`Year ${profile.year || "-"} · Sem ${profile.semester || "-"}`);
        }

        // 2️⃣ Resolve Subject for Live Experiments Data
        const paramSubjectId = searchParams.get("subject");
        const paramSubjectName = searchParams.get("subjectName");
        const storedSubject = getSelectedSubjectFromStorage();

        const subjectId = paramSubjectId || storedSubject.subjectId || "";
        const subjectName = paramSubjectName || storedSubject.subjectName || "";
        setActiveSubjectName(subjectName);

        let expList: UnifiedExperiment[] = [];
        let completedCount = 0;

        if (subjectId) {
          const unifiedResult = await getStudentExperimentData({ subjectId, subjectName });
          expList = unifiedResult.experiments || [];
          completedCount = expList.filter((e) => e.isCompleted || e.status === "evaluated" || e.status === "submitted").length;

          if (unifiedResult.profile?.registerNo && unifiedResult.profile.registerNo !== "N/A") {
            setRegisterNo(unifiedResult.profile.registerNo);
          }
          if (unifiedResult.profile?.department && unifiedResult.profile.department !== "N/A") {
            setDepartment(unifiedResult.profile.department);
          }
        } else {
          // Fallback: Query submissions directly across all subjects
          const { data: submissionRows } = await supabase
            .from("submissions")
            .select("id, exp_id, experiment_id, status, marks, updated_at, submitted_date")
            .eq("student_id", userId)
            .order("updated_at", { ascending: false });

          if (submissionRows && submissionRows.length > 0) {
            expList = submissionRows.map((sub: any, idx: number) => ({
              id: String(sub.id),
              experimentId: String(sub.exp_id || sub.experiment_id || `exp-${idx + 1}`),
              experimentNo: Number(sub?.experiment_no) || 0,
              title: `Experiment ${idx + 1}`,
              status: String(sub.status || "pending").toLowerCase(),
              marks: Number(sub.marks || 0),
              facultyMarks: Number(sub.marks || 0),
              finalMarks: Number(sub.marks || 0),
              isOverridden: false,
              evaluationSource: "faculty",
              updatedAt: sub.updated_at || null,
              submittedDate: sub.submitted_date || null,
              isCompleted: sub.status === "evaluated" || sub.status === "submitted",
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
            completedCount = expList.filter((e) => e.isCompleted).length;
          }
        }

        setExperiments(expList);

        // 3️⃣ Fetch Gamification & Achievements
        const [progress, userAchievements] = await Promise.all([
          getUserProgress(userId),
          getUserAchievements(userId),
        ]);

        setGamificationProgress(mergeProgressWithExperimentActivity(progress, completedCount));
        setAchievements(userAchievements);
        setLoading(false);
      } catch (loadError) {
        console.error("Profile load error:", loadError);
        setError(STUDENT_PROFILE_ERROR);
        setLoading(false);
      }
    };

    loadProfile();
  }, [navigate, searchParams]);

  async function logout() {
    await supabase.auth.signOut();
    clearSelectedSubjectInStorage();
    localStorage.removeItem("dept");
    localStorage.removeItem("year");
    localStorage.removeItem("semester");
    navigate("/login");
  }

  if (loading) {
    return <ProfileSkeleton />;
  }

  return (
    <div className="faculty-bg-vibrant student-page-enter min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto flex w-full max-w-[1380px] items-start justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="w-full max-w-4xl relative overflow-hidden"
        >
          {/* Decorative background glows */}
          <div className="absolute -top-32 -right-32 h-64 w-64 rounded-full bg-indigo-200/50 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 h-56 w-56 rounded-full bg-blue-200/50 blur-3xl pointer-events-none" />

          {error ? (
            <div className="mb-6 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              <Activity className="w-4 h-4 shrink-0" />
              {error}
            </div>
          ) : null}

          {/* PROFILE HEADER CARD */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04, duration: 0.2, ease: "easeOut" }}
            className="faculty-glass faculty-gradient-ring relative mb-6 rounded-3xl p-6 md:p-8"
          >
            <div className="relative z-10 flex flex-col sm:flex-row items-center gap-6">
              <motion.div
                whileHover={{ scale: 1.06 }}
                transition={{ duration: 0.2 }}
                className="flex h-22 w-22 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 via-blue-600 to-violet-600 shadow-xl shadow-indigo-500/20 ring-4 ring-indigo-100"
              >
                <span className="text-3xl font-extrabold text-white select-none">
                  {getInitials(name || "S")}
                </span>
              </motion.div>
              <div className="text-center sm:text-left min-w-0 flex-1">
                <h1 className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 bg-clip-text text-2xl font-extrabold text-transparent md:text-3xl">
                  {name || "Student"}
                </h1>
                <p className="mt-1 text-sm font-medium text-slate-600">{email}</p>

                <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Student Account Active
                  </span>
                  {activeSubjectName && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                      <BookOpen className="h-3 w-3" /> {activeSubjectName}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </motion.div>

          {/* PERSONAL & ACADEMIC DETAILS GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <InfoCard icon={<User className="w-5 h-5" />} label="Full Name" value={name || "N/A"} accent="indigo" />
            <InfoCard icon={<Hash className="w-5 h-5" />} label="Register Number" value={registerNo} accent="blue" />
            <InfoCard icon={<Mail className="w-5 h-5" />} label="Email Address" value={email} accent="indigo" />
            <InfoCard icon={<Building2 className="w-5 h-5" />} label="Department" value={department} accent="emerald" />
            <InfoCard icon={<GraduationCap className="w-5 h-5" />} label="Year & Semester" value={yearSemester} accent="amber" />
            <InfoCard icon={<Shield className="w-5 h-5" />} label="Portal Access" value="STUDENT" accent="emerald" />
          </div>

          {/* ACADEMIC PROGRESS METRICS */}
          <div className="mb-6 grid gap-4 grid-cols-2 md:grid-cols-4">
            <StatCard icon={<FlaskConical className="w-5 h-5" />} label="Total Tracked" value={experiments.length} accent="indigo" />
            <StatCard icon={<CheckCircle2 className="w-5 h-5" />} label="Evaluated" value={evaluatedCount} accent="emerald" />
            <StatCard icon={<Send className="w-5 h-5" />} label="Submitted" value={submittedCount} accent="blue" />
            <StatCard icon={<Clock className="w-5 h-5" />} label="Pending" value={pendingCount} accent="amber" />
          </div>

          {/* EXPERIMENTS REAL-TIME ACTIVITY LIST */}
          <div className="mb-6 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="flex items-center gap-2.5 text-base font-bold text-slate-900">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <FlaskConical className="h-4.5 w-4.5" />
                </div>
                Experiment Submissions & Live Status
              </h2>
              <span className="text-xs font-semibold text-slate-500">
                {experiments.length} Records
              </span>
            </div>

            <div className="grid gap-2.5 max-h-[420px] overflow-y-auto pr-1">
              {experiments.length === 0 ? (
                <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-6 text-center text-sm font-medium text-slate-500">
                  No experiment records found for this profile
                </div>
              ) : (
                experiments.map((exp) => {
                  const cfg = getStatusConfig(exp.status);
                  const isDone = exp.status === "evaluated" || exp.status === "approved";
                  const isSubmitted = exp.status === "submitted";

                  return (
                    <motion.div
                      key={exp.id}
                      whileHover={{ y: -1 }}
                      className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 transition-all hover:bg-white hover:border-indigo-200 hover:shadow-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono font-bold text-xs ${
                            isDone
                              ? "bg-emerald-100 text-emerald-800"
                              : isSubmitted
                              ? "bg-blue-100 text-blue-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          Exp {exp.experimentNo}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-slate-900 truncate">
                            {exp.title}
                          </p>
                          <p className="text-xs text-slate-500">
                            Marks: <span className="font-semibold text-slate-700">{exp.marks ?? "-"}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 ml-3">
                        <StatusBadge status={exp.status} />
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </div>

          {/* GAMIFICATION & ACHIEVEMENTS */}
          {gamificationProgress && (
            <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Stats Card */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
                <h3 className="mb-4 flex items-center gap-2.5 text-base font-bold text-slate-900">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                    <Trophy className="h-4.5 w-4.5" />
                  </div>
                  Gamification Level & XP
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Current Level</p>
                    <p className="text-2xl font-extrabold text-indigo-600 mt-0.5">Level {gamificationProgress.level}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Experience Points</p>
                    <p className="text-2xl font-extrabold text-amber-600 mt-0.5">{gamificationProgress.xp_points} XP</p>
                  </div>
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Current Streak</p>
                    <p className="text-xl font-bold text-slate-800 mt-0.5">{gamificationProgress.current_streak} Days</p>
                  </div>
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Completed Labs</p>
                    <p className="text-xl font-bold text-emerald-600 mt-0.5">{gamificationProgress.labs_completed}</p>
                  </div>
                </div>
              </div>

              {/* Achievements Card */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="flex items-center gap-2.5 text-base font-bold text-slate-900">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                      <Award className="h-4.5 w-4.5" />
                    </div>
                    Unlocked Achievements
                  </h3>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                    {achievements.length} Unlocked
                  </span>
                </div>

                {achievements.length === 0 ? (
                  <p className="text-sm font-medium text-slate-500 text-center py-6">No achievements unlocked yet</p>
                ) : (
                  <div className="space-y-2.5 max-h-[160px] overflow-y-auto">
                    {achievements.map((ach) => (
                      <div
                        key={ach.id}
                        className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/60 px-3.5 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-slate-900">{ach.name}</p>
                          <p className="text-[11px] text-slate-500 truncate">{ach.description || "Milestone completed"}</p>
                        </div>
                        <span className="text-xs font-extrabold text-amber-600 shrink-0 ml-2">+{ach.xp_reward} XP</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ACTIONS & LOGOUT */}
          <div className="grid md:grid-cols-3 gap-4">
            <ActionCard icon={<Settings className="w-5 h-5" />} title="Account Settings" desc="Manage profile preferences" disabled />
            <ActionCard icon={<Key className="w-5 h-5" />} title="Change Password" desc="Update security credentials" disabled />

            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={logout}
              className="flex min-h-[44px] items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/90 p-4 text-left font-bold text-amber-800 transition-all hover:bg-amber-100 shadow-xs"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <LogOut className="w-5 h-5" />
              </div>
              <div>
                <span className="text-sm block">Sign Out Account</span>
                <span className="text-xs font-normal text-amber-600">End current session</span>
              </div>
            </motion.button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

/* ================= COMPONENTS ================= */

const ACCENT_STYLES = {
  indigo: {
    iconBg: "bg-indigo-50",
    iconText: "text-indigo-600",
    hover: "hover:border-indigo-200",
    ring: "from-indigo-100/40 to-blue-100/40",
  },
  blue: {
    iconBg: "bg-blue-50",
    iconText: "text-blue-600",
    hover: "hover:border-blue-200",
    ring: "from-blue-100/40 to-indigo-100/40",
  },
  emerald: {
    iconBg: "bg-emerald-50",
    iconText: "text-emerald-600",
    hover: "hover:border-emerald-200",
    ring: "from-emerald-100/40 to-emerald-200/40",
  },
  amber: {
    iconBg: "bg-amber-50",
    iconText: "text-amber-600",
    hover: "hover:border-amber-200",
    ring: "from-amber-100/40 to-yellow-100/40",
  },
} as const;

type AccentKey = keyof typeof ACCENT_STYLES;

function InfoCard({
  icon,
  label,
  value,
  accent = "indigo",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: AccentKey;
}) {
  const s = ACCENT_STYLES[accent];
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={`rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm ${s.hover} flex items-center gap-3.5 transition-all`}
    >
      <div className={`p-2.5 ${s.iconBg} rounded-lg shrink-0`}>
        <div className={s.iconText}>{icon}</div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
        <p className="mt-0.5 truncate text-sm font-bold text-slate-900">{value}</p>
      </div>
    </motion.div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent = "indigo",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: AccentKey;
}) {
  const s = ACCENT_STYLES[accent];
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={`rounded-xl border border-slate-200/80 bg-white p-4 text-center shadow-sm ${s.hover} transition-all`}
    >
      <div className={`mx-auto w-9 h-9 rounded-full flex items-center justify-center ${s.iconBg} mb-1.5`}>
        <div className={s.iconText}>{icon}</div>
      </div>
      <p className="text-2xl font-extrabold text-slate-900">{value}</p>
      <p className="mt-0.5 text-xs font-semibold text-slate-500">{label}</p>
    </motion.div>
  );
}

function ActionCard({
  icon,
  title,
  desc,
  disabled = false,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  disabled?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-left transition-all ${
        disabled ? "opacity-75 cursor-not-allowed" : ""
      }`}
    >
      <div className="flex items-center gap-3 mb-1.5">
        <div className="rounded-lg bg-slate-100 p-2 text-slate-600">{icon}</div>
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-sm text-slate-700">{title}</h3>
          {disabled && <Lock className="w-3.5 h-3.5 text-slate-400" />}
        </div>
      </div>
      <p className="text-xs text-slate-500">{desc}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = String(status || "").toLowerCase();
  const map: Record<string, string> = {
    completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
    evaluated: "border-emerald-200 bg-emerald-50 text-emerald-700",
    approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
    pending: "border-amber-200 bg-amber-50 text-amber-700",
    draft: "border-slate-200 bg-slate-100 text-slate-700",
    submitted: "border-blue-200 bg-blue-50 text-blue-700",
    resubmit: "border-slate-300 bg-slate-100 text-slate-700",
  };
  const display = getStatusConfig(status);
  const badgeClass = map[normalized] || "border-slate-200 bg-slate-100 text-slate-700";
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${badgeClass}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {display.label}
    </div>
  );
}
