import { Outlet, useNavigate, useLocation, NavLink } from "react-router-dom";
import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  BookOpen,
  Users,
  FileText,
  BarChart3,
  Settings,
  MessageSquare,
  Bell,
  GraduationCap,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  ArrowLeftRight,
  Activity,
  FlaskConical,
  Trophy,
  ClipboardList,
  FilePlus2,
  Building2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
// @ts-ignore – JS file without declaration file
import BackButton from "@/components/BackButton";
import { clearAllUserScope } from "@/lib/clientSession";
import { computeExamPhase } from "@/lib/examWindow";
import { getFacultyInboxNotifications, type StudentNotification } from "@/services/studentNotificationsService";
import { useAuth } from "@/context/AuthContext";

const SIDEBAR_WIDTH = {
  open: 260,
  closed: 80,
};
const FACULTY_NOTIFICATIONS_SEEN_KEY = "faculty_notifications_seen_at_v1";

function toSafeDate(value: unknown): Date | null {
  const parsed = new Date(String(value || ""));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatNotificationTime(value: string | null): string {
  const parsed = toSafeDate(value);
  if (!parsed) return "Just now";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const workspaceNavItems = [
  { icon: LayoutDashboard, label: "DASHBOARD",   path: "/faculty" },
  { icon: BookOpen,        label: "SUBJECTS",    path: "/faculty/subjects" },
  { icon: Users,           label: "STUDENTS",    path: "/faculty/students" },
  { icon: FileText,        label: "SUBMISSIONS", path: "/faculty/submissions" },
  { icon: FlaskConical,    label: "EXPERIMENTS", path: "/faculty/experiments" },
  { icon: ClipboardList,   label: "EXAM CONSOLE", path: "/faculty/exams" },
  { icon: FilePlus2,       label: "TEMPLATES",   path: "/faculty/templates" },
  { icon: BarChart3,       label: "ANALYTICS",       path: "/faculty/reports" },
  { icon: ClipboardList,   label: "INTERNAL MARKS",  path: "/faculty/internal-marks" },
  { icon: Trophy,          label: "LEADERBOARD",     path: "/faculty/leaderboard" },
];

const systemNavItems = [
  { icon: MessageSquare, label: "NOTIFICATIONS", path: "/faculty/notifications" },
  { icon: Settings, label: "SETTINGS", path: "/faculty/settings" },
];

export default function FacultyLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, role } = useAuth();
  const isAdminOrHod = profile?.role === "admin" || role === "admin" || String(profile?.name || "").toUpperCase().includes("HOD");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [hasActiveExam, setHasActiveExam] = useState(false);
  const [activeExamId, setActiveExamId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [notificationItems, setNotificationItems] = useState<StudentNotification[]>([]);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationError, setNotificationError] = useState("");
  const [lastSeenAt, setLastSeenAt] = useState(
    () => localStorage.getItem(FACULTY_NOTIFICATIONS_SEEN_KEY) || ""
  );

  useEffect(() => {
    try {
      const saved = localStorage.getItem("facultySidebarOpen");
      if (saved !== null) {
        setSidebarOpen(JSON.parse(saved));
      }
    } catch {
      localStorage.removeItem("facultySidebarOpen");
    }
  }, []);

  const selectedSubjectId = localStorage.getItem("faculty_subject_id");
  const unreadCount = useMemo(() => {
    if (!notificationItems.length) return 0;
    const seenTime = toSafeDate(lastSeenAt)?.getTime() || 0;
    if (!seenTime) return notificationItems.length;
    return notificationItems.filter((item) => {
      const ts = toSafeDate(item.createdAt)?.getTime() || 0;
      return ts > seenTime;
    }).length;
  }, [notificationItems, lastSeenAt]);

  const loadFacultyNotifications = async () => {
    setNotificationLoading(true);
    setNotificationError("");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setNotificationItems([]);
      setNotificationError("Not authenticated.");
      setNotificationLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("department")
      .eq("id", user.id)
      .maybeSingle();
    const department = String(profile?.department || "").trim() || null;
    const inbox = await getFacultyInboxNotifications(department, 15);
    if (!inbox.success) {
      setNotificationItems([]);
      setNotificationError(inbox.error);
      setNotificationLoading(false);
      return;
    }
    setNotificationItems(inbox.data);
    setNotificationLoading(false);
  };

  useEffect(() => {
    let active = true;
    const validateSelectedSubject = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !active) return;

      const { data: links, error: linksError } = await supabase
        .from("faculty_subjects")
        .select("subject_id, subjects(id, name)")
        .eq("faculty_id", user.id);

      if (linksError || !active) return;

      const assigned = (links || [])
        .map((row: any) => ({
          id: String(row?.subject_id || row?.subjects?.id || "").trim(),
          name: String(row?.subjects?.name || "").trim(),
        }))
        .filter((row) => row.id);

      if (assigned.length === 0) {
        localStorage.removeItem("faculty_subject_id");
        localStorage.removeItem("faculty_subject_name");
        if (!location.pathname.startsWith("/faculty/subjects")) {
          navigate("/faculty/subjects", { replace: true });
        }
        return;
      }

      if (assigned.length === 1 && assigned[0]) {
        const only = assigned[0];
        if (only.id && localStorage.getItem("faculty_subject_id") !== only.id) {
          localStorage.setItem("faculty_subject_id", only.id);
        }
        if (only.name && localStorage.getItem("faculty_subject_name") !== only.name) {
          localStorage.setItem("faculty_subject_name", only.name);
        }
        return;
      }

      const validSelected = assigned.some((row) => row.id === String(selectedSubjectId || "").trim());
      if (!validSelected) {
        localStorage.removeItem("faculty_subject_id");
        localStorage.removeItem("faculty_subject_name");
        if (!location.pathname.startsWith("/faculty/subjects")) {
          navigate("/faculty/subjects", { replace: true });
        }
      }

      if (!active) return;
    };
    void validateSelectedSubject();
    return () => {
      active = false;
    };
  }, [selectedSubjectId, navigate, location.pathname]);

  useEffect(() => {
    let isMounted = true;

    const checkExam = async () => {
      if (!selectedSubjectId) {
        if (isMounted) {
          setHasActiveExam(false);
          setActiveExamId(null);
        }
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (isMounted) {
          setHasActiveExam(false);
          setActiveExamId(null);
        }
        return;
      }

      const nowIso = new Date().toISOString();
      const nowMs = Date.now();
      const { data: candidates, error } = await supabase
        .from("exams")
        .select("id, start_time, end_time, duration_minutes")
        .eq("subject_id", selectedSubjectId)
        .eq("faculty_id", user.id)
        .lte("start_time", nowIso)
        .order("start_time", { ascending: false })
        .limit(25);

      if (error) {
        if (isMounted) {
          setHasActiveExam(false);
          setActiveExamId(null);
        }
        return;
      }

      const activeExam = (candidates || []).find(
        (row) =>
          computeExamPhase(nowMs, {
            start_time: row.start_time,
            end_time: row.end_time,
            duration_minutes: row.duration_minutes,
          }) === "active"
      );

      if (!isMounted) return;
      setHasActiveExam(Boolean(activeExam?.id));
      setActiveExamId(activeExam?.id ?? null);
    };

    checkExam();
    const interval = setInterval(checkExam, 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [selectedSubjectId]);

  const toggleSidebar = () => {
    const newState = !sidebarOpen;
    setSidebarOpen(newState);
    localStorage.setItem("facultySidebarOpen", JSON.stringify(newState));
  };

  async function logout() {
    await supabase.auth.signOut();
    clearAllUserScope();
    navigate("/login");
  }

  const isActive = (path: string) => {
    if (path === "/faculty") {
      return location.pathname === "/faculty";
    }
    const segment = path + "/";
    return location.pathname === path || location.pathname.startsWith(segment);
  };

  const examMonitorPath = activeExamId ? `/faculty/exam-monitor/${activeExamId}` : null;
  const closeMobileMenu = () => setMobileMenuOpen(false);
  const needsSubjectSelection =
    !selectedSubjectId && !location.pathname.startsWith("/faculty/subjects");
  const selectedSubjectName = localStorage.getItem("faculty_subject_name");

  useEffect(() => {
    setMobileMenuOpen(false);
    setNotificationOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    void loadFacultyNotifications();

    const channel = supabase
      .channel("faculty-notifications-live")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "student_notifications",
        },
        () => {
          void loadFacultyNotifications();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!notificationOpen) return;
    const seenAt = new Date().toISOString();
    setLastSeenAt(seenAt);
    localStorage.setItem(FACULTY_NOTIFICATIONS_SEEN_KEY, seenAt);
  }, [notificationOpen]);


  useEffect(() => {
    if (needsSubjectSelection) {
      navigate("/faculty/subjects?auto=1", { replace: true });
    }
  }, [needsSubjectSelection, navigate]);

  const toggleNotifications = () => {
    const next = !notificationOpen;
    setNotificationOpen(next);
    if (next) {
      void loadFacultyNotifications();
      if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
      notificationTimerRef.current = setTimeout(() => setNotificationOpen(false), 8000);
    } else {
      if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
    }
  };

  const pauseNotificationTimer = () => {
    if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
  };

  const resumeNotificationTimer = () => {
    if (notificationOpen) {
      notificationTimerRef.current = setTimeout(() => setNotificationOpen(false), 5000);
    }
  };

  return (
    <div className="faculty-bg-vibrant flex min-h-screen overflow-x-hidden text-slate-900">
      <header className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 md:hidden">
        <p className="text-sm font-semibold text-slate-800">Faculty Panel</p>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 md:hidden"
          >
            <div
              className="absolute inset-0 bg-black/60"
              onClick={closeMobileMenu}
              aria-hidden="true"
            />
            <motion.aside
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className="absolute left-0 top-0 h-full w-[88vw] max-w-[320px] border-r border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4 shadow-xl"
            >
              <div className="mb-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white/90 px-3 py-2">
                <p className="text-sm font-semibold text-slate-700">Faculty Menu</p>
                <button
                  type="button"
                  onClick={closeMobileMenu}
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700"
                  aria-label="Close navigation menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="space-y-1">
                <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Workspace</p>
                {workspaceNavItems.map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => { navigate(item.path); closeMobileMenu(); }}
                    className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                      isActive(item.path)
                        ? "border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-sm"
                        : "border-transparent bg-transparent text-slate-700 hover:bg-[#F1F5F9]"
                    }`}
                  >
                    <item.icon className="h-5 w-5 flex-shrink-0" />
                    <span>{item.label}</span>
                  </button>
                ))}
                {hasActiveExam && examMonitorPath ? (
                  <button
                    type="button"
                    onClick={() => { navigate(examMonitorPath); closeMobileMenu(); }}
                    className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                      isActive(examMonitorPath)
                        ? "border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-sm"
                        : "border-transparent bg-transparent text-slate-700 hover:bg-[#F1F5F9]"
                    }`}
                  >
                    <Activity className="h-5 w-5 flex-shrink-0" />
                    <span>Exam Monitor</span>
                  </button>
                ) : null}
                <p className="px-2 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400">System</p>
                {systemNavItems.map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => { navigate(item.path); closeMobileMenu(); }}
                    className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                      isActive(item.path)
                        ? "border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-sm"
                        : "border-transparent bg-transparent text-slate-700 hover:bg-[#F1F5F9]"
                    }`}
                  >
                    <item.icon className="h-5 w-5 flex-shrink-0" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </nav>
              <div className="mt-5 space-y-2 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem("faculty_subject_id");
                    localStorage.removeItem("faculty_subject_name");
                    navigate("/faculty/subjects");
                    closeMobileMenu();
                  }}
                  className="flex min-h-[44px] w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <ArrowLeftRight className="h-5 w-5" />
                  <span>Change Subject</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    closeMobileMenu();
                    await logout();
                  }}
                  className="flex min-h-[44px] w-full items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-left text-sm text-rose-700 hover:bg-rose-100"
                >
                  <LogOut className="h-5 w-5" />
                  <span>Logout</span>
                </button>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SIDEBAR */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarOpen ? SIDEBAR_WIDTH.open : SIDEBAR_WIDTH.closed }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className="relative z-20 hidden flex-col border-r border-slate-200/80 bg-white/90 shadow-[0_16px_36px_rgba(15,23,42,0.08)] backdrop-blur-xl md:flex"
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-200 p-4">
          <motion.div
            className="rounded-xl bg-gradient-to-br from-blue-600 to-indigo-500 p-2.5 shadow-md ring-1 ring-blue-300/40"
            whileHover={{ scale: 1.1, rotate: [0, -5, 5, 0] }}
            transition={{ duration: 0.3 }}
          >
            <GraduationCap className="w-6 h-6 text-white" />
          </motion.div>
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <h2 className="bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-base font-bold text-transparent">
                  Faculty Panel
                </h2>
                <p className="whitespace-nowrap text-xs text-slate-500">Digital Lab Workspace</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Toggle Button */}
        <button
          type="button"
          onClick={toggleSidebar}
          className="absolute -right-3 top-8 z-30 flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
        >
          {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {/* WORKSPACE section */}
          {sidebarOpen && (
            <p className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Workspace
            </p>
          )}
          {workspaceNavItems.map((item) => {
            const active = isActive(item.path);
            return (
              <motion.div key={item.path} whileHover={{ x: sidebarOpen ? 3 : 0 }} whileTap={{ scale: 0.98 }}>
                <NavLink
                  to={item.path}
                  title={sidebarOpen ? undefined : item.label}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all relative overflow-hidden group
                    focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white
                    ${active
                      ? "bg-[#DBEAFE] text-blue-700"
                      : "text-slate-600 hover:bg-[#F1F5F9] hover:text-slate-900"
                    }
                  `}
                >
                  {active && (
                    <motion.div
                      layoutId="activeRail"
                      className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-[#2563EB]"
                    />
                  )}
                  <item.icon className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${active ? "text-[#2563EB]" : "text-slate-500 group-hover:text-slate-700"}`} />
                  <AnimatePresence>
                    {sidebarOpen && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "auto" }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.18 }}
                        className="relative z-10 overflow-hidden whitespace-nowrap text-[13px] font-medium"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </NavLink>
              </motion.div>
            );
          })}

          {/* Live exam monitor — surfaces only when a live exam exists */}
          {hasActiveExam && examMonitorPath && (
            <motion.div whileHover={{ x: sidebarOpen ? 3 : 0 }} whileTap={{ scale: 0.98 }}>
              <NavLink
                to={examMonitorPath}
                title={sidebarOpen ? undefined : "Exam Monitor"}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all relative overflow-hidden group
                  focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white
                  ${isActive(examMonitorPath)
                    ? "bg-[#DBEAFE] text-blue-700"
                    : "text-slate-600 hover:bg-[#F1F5F9] hover:text-slate-900"
                  }
                `}
              >
                {isActive(examMonitorPath) && (
                  <motion.div
                    layoutId="activeRail"
                    className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-[#2563EB]"
                  />
                )}
                <Activity className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${isActive(examMonitorPath) ? "text-[#2563EB]" : "text-slate-500 group-hover:text-slate-700"}`} />
                <AnimatePresence>
                  {sidebarOpen && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: "auto" }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.18 }}
                      className="relative z-10 overflow-hidden whitespace-nowrap text-[13px] font-medium"
                    >
                      Exam Monitor
                      <span className="ml-2 inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </NavLink>
            </motion.div>
          )}

          {/* SYSTEM section */}
          <div className={sidebarOpen ? "pt-5" : "pt-4"}>
            {sidebarOpen && (
              <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                System
              </p>
            )}
            {systemNavItems.map((item) => {
              const active = isActive(item.path);
              return (
                <motion.div key={item.path} whileHover={{ x: sidebarOpen ? 3 : 0 }} whileTap={{ scale: 0.98 }}>
                  <NavLink
                    to={item.path}
                    title={sidebarOpen ? undefined : item.label}
                    className={`
                      flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all relative overflow-hidden group
                      focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white
                      ${active
                        ? "bg-[#DBEAFE] text-blue-700"
                        : "text-slate-600 hover:bg-[#F1F5F9] hover:text-slate-900"
                      }
                    `}
                  >
                    {active && (
                      <motion.div
                        layoutId="activeRailSystem"
                        className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-[#2563EB]"
                      />
                    )}
                    <item.icon className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${active ? "text-[#2563EB]" : "text-slate-500 group-hover:text-slate-700"}`} />
                    <AnimatePresence>
                      {sidebarOpen && (
                        <motion.span
                          initial={{ opacity: 0, width: 0 }}
                          animate={{ opacity: 1, width: "auto" }}
                          exit={{ opacity: 0, width: 0 }}
                          transition={{ duration: 0.18 }}
                          className="relative z-10 overflow-hidden whitespace-nowrap text-[13px] font-medium"
                        >
                          {item.label}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </NavLink>
                </motion.div>
              );
            })}
          </div>
        </nav>

        {/* Change Subject + Logout */}
        <div className="space-y-1 border-t border-slate-200 p-3">
          {sidebarOpen ? (
            <div className="mb-1 rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
              <p className="text-xs font-semibold text-slate-700">Faculty Workspace</p>
              <p className="text-[11px] text-slate-500">Subject scoped controls</p>
            </div>
          ) : null}
          <motion.button
            type="button"
            whileHover={{ x: 4 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              localStorage.removeItem("faculty_subject_id");
              localStorage.removeItem("faculty_subject_name");
              navigate("/faculty/subjects");
            }}
            className="group flex w-full cursor-pointer items-center gap-3 rounded-xl p-3 text-slate-600 transition-all hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          >
            <ArrowLeftRight className="w-5 h-5 flex-shrink-0" />
            <AnimatePresence>
              {sidebarOpen && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-sm font-medium whitespace-nowrap overflow-hidden"
                >
                  Change Subject
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
          <motion.button
            type="button"
            whileHover={{ x: 4 }}
            whileTap={{ scale: 0.98 }}
            onClick={logout}
            className="group flex w-full cursor-pointer items-center gap-3 rounded-xl p-3 text-slate-600 transition-all hover:bg-rose-50 hover:text-rose-700 focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <AnimatePresence>
              {sidebarOpen && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-sm font-medium whitespace-nowrap overflow-hidden"
                >
                  Logout
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </motion.aside>

      {/* PAGE CONTENT */}
      <main className="flex-1 overflow-y-auto pt-16 md:pt-0">
        <div className="hidden relative z-50 border-b border-slate-200/80 bg-white/70 px-6 py-3 backdrop-blur-xl md:flex md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <BackButton />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Faculty Workspace</p>
              <p className="text-sm font-semibold text-slate-800">
                {selectedSubjectName ? selectedSubjectName : "Select subject to continue"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isAdminOrHod && (
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem("auth_role", "admin");
                  navigate("/admin");
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 transition shadow-2xs cursor-pointer"
              >
                <Building2 className="h-4 w-4 text-blue-600" />
                <span>Switch to IT Admin Portal</span>
              </button>
            )}
            <div className="relative">
              <button
                type="button"
                onClick={toggleNotifications}
              aria-label="Open notifications"
              className={`group relative h-10 w-10 rounded-xl border bg-white p-2 text-slate-600 shadow-sm transition-all ${
                notificationOpen
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-slate-200 hover:-translate-y-0.5 hover:border-blue-200 hover:text-slate-800"
              }`}
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-1 text-center text-[10px] font-semibold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </button>
            <AnimatePresence>
              {notificationOpen ? (
                <>
                  <motion.button
                    type="button"
                    aria-label="Close notifications"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setNotificationOpen(false)}
                    className="fixed inset-0 z-20 bg-slate-900/10 backdrop-blur-[1px]"
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.16, ease: "easeOut" }}
                    className="absolute right-0 top-12 z-30 w-[360px] max-w-[92vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
                    onMouseEnter={pauseNotificationTimer}
                    onMouseLeave={resumeNotificationTimer}
                  >
                    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4 text-blue-600" />
                        <p className="text-sm font-semibold text-slate-800">Notifications</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-500">
                          {notificationItems.length} item{notificationItems.length !== 1 ? "s" : ""}
                        </span>
                        <button
                          type="button"
                          onClick={() => setNotificationOpen(false)}
                          className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                          aria-label="Close notifications"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="max-h-[340px] overflow-y-auto px-2 py-2">
                      {notificationLoading ? (
                        <div className="space-y-2 p-2">
                          {[1,2].map(i => <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}
                        </div>
                      ) : notificationError ? (
                        <p className="px-2 py-2 text-sm text-rose-700">{notificationError}</p>
                      ) : notificationItems.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-6 text-center">
                          <Bell className="h-6 w-6 text-slate-300" />
                          <p className="text-xs text-slate-500">No notifications yet.</p>
                        </div>
                      ) : (
                        notificationItems.map((item) => (
                          <div key={item.id} className="mb-1 rounded-xl border border-slate-100 bg-slate-50 p-3 transition-colors hover:bg-slate-100">
                            <div className="mb-1 flex items-start justify-between gap-2">
                              <p className="truncate text-xs font-semibold text-slate-800">{item.title}</p>
                              <span className="shrink-0 text-[10px] text-slate-400">{formatNotificationTime(item.createdAt)}</span>
                            </div>
                            <p className="line-clamp-2 text-xs text-slate-600">{item.message}</p>
                            <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              item.senderRole === "faculty" ? "bg-indigo-100 text-indigo-700" : "bg-blue-100 text-blue-700"
                            }`}>
                              {item.senderRole === "faculty" ? "Faculty" : "Admin"}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                </>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </div>
        <div className="mx-auto w-full max-w-[1380px] px-4 py-6 md:px-8 md:py-8">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {needsSubjectSelection ? (
                <div className="space-y-6">
                  <div className="h-8 w-56 animate-pulse rounded-lg bg-slate-200" />
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, idx) => (
                      <div
                        key={`faculty-shell-stat-skeleton-${idx}`}
                        className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm"
                      />
                    ))}
                  </div>
                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <div className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm" />
                    <div className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm" />
                  </div>
                  <div className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm" />
                </div>
              ) : (
                <Outlet />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}