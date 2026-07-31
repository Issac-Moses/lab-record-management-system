import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  clearSelectedSubjectInStorage,
  getSelectedSubjectFromStorage,
  setSelectedSubjectInStorage,
  useSubjects,
} from "@/context/SubjectContext";
import {
  LayoutDashboard,
  FlaskConical,
  User,
  LogOut,
  GraduationCap,
  Award,
  ClipboardList,
  Table2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FileCheck2,
  Bell,
  Menu,
  X,
  Calendar,
  MessageSquare,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { clearAllUserScope } from "@/lib/clientSession";
import { getStudentInboxNotifications } from "@/services/studentNotificationsService";

const SIDEBAR_WIDTH = {
  open: 260,
  closed: 80,
};

const MESSAGE_CENTER_SEEN_AT_KEY = "student_message_center_seen_at_v1";

type StudentMessageItem = {
  id: string;
  title: string;
  body: string;
  timestamp: string | null;
  source: "faculty" | "admin" | "system";
};

function toSafeDate(value: unknown): Date | null {
  const parsed = new Date(String(value || ""));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatMessageTime(value: string | null): string {
  const date = toSafeDate(value);
  if (!date) return "Just now";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const navItems = [
  { icon: LayoutDashboard, label: "DASHBOARD", path: "/student", color: "indigo" },
  { icon: FlaskConical, label: "EXPERIMENTS", path: "/student/experiments", color: "indigo" },
  { icon: FileCheck2, label: "SUBMISSIONS", path: "/student/submissions", color: "blue" },
  { icon: Award, label: "RESULTS", path: "/student/results", color: "amber" },
  { icon: ClipboardList, label: "EXAM RESULTS", path: "/student/exam-marks", color: "blue" },
  { icon: MessageSquare, label: "NOTIFICATIONS", path: "/student/notifications", color: "indigo" },
  { icon: User, label: "PROFILE", path: "/student/profile", color: "emerald" },
] as const;

type NavColor = { activeBg: string; activeText: string; iconBg: string; hoverText: string };

const defaultNavColor: NavColor = { activeBg: "from-blue-50 to-indigo-50", activeText: "text-blue-700", iconBg: "bg-blue-100", hoverText: "group-hover:text-blue-700" };

const navColorMap: Record<string, NavColor> = {
  indigo:  defaultNavColor,
  blue:    { activeBg: "from-blue-50 to-indigo-50",    activeText: "text-blue-700",    iconBg: "bg-blue-100",    hoverText: "group-hover:text-blue-700" },
  amber:   { activeBg: "from-amber-50 to-amber-100",   activeText: "text-amber-700",   iconBg: "bg-amber-100",   hoverText: "group-hover:text-amber-700" },
  emerald: { activeBg: "from-emerald-50 to-emerald-100",  activeText: "text-emerald-700", iconBg: "bg-emerald-100", hoverText: "group-hover:text-emerald-700" },
};

export default function StudentLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { subjects, loading: subjectsLoading } = useSubjects();
  const querySubjectId = new URLSearchParams(location.search).get("subject");
  const querySubjectName = new URLSearchParams(location.search).get("subjectName");
  const selectedFromStorage = getSelectedSubjectFromStorage();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const subjectId = querySubjectId || selectedFromStorage.subjectId;
  const [selectedSubjectName, setSelectedSubjectName] = useState(
    selectedFromStorage.subjectName || ""
  );
  const [studentName, setStudentName] = useState("");
  const [studentDept, setStudentDept] = useState("");
  const [notificationOpen, setNotificationOpen] = useState(false);
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [messages, setMessages] = useState<StudentMessageItem[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState("");
  const [lastSeenAt, setLastSeenAt] = useState(
    () => localStorage.getItem(MESSAGE_CENTER_SEEN_AT_KEY) || ""
  );
  const isSubjectSelectionPage = location.pathname === "/student/subjects";
  const allowedSubjectIds = useMemo(
    () => new Set((subjects || []).map((subject) => String(subject.id))),
    [subjects]
  );

  useEffect(() => {
    let active = true;
    const loadProfile = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session || !active) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("name, department")
        .eq("id", data.session.user.id)
        .maybeSingle();
      if (!active) return;
      setStudentName(String(profile?.name || "").trim());
      setStudentDept(String(profile?.department || "").trim());
    };
    void loadProfile();
    return () => { active = false; };
  }, []);

  const initials = studentName
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "S";

  const unreadCount = useMemo(() => {
    if (!messages.length) return 0;
    const seenTime = toSafeDate(lastSeenAt)?.getTime() || 0;
    if (!seenTime) return messages.length;
    return messages.filter((item) => {
      const ts = toSafeDate(item.timestamp)?.getTime() || 0;
      return ts > seenTime;
    }).length;
  }, [messages, lastSeenAt]);

  const loadStudentMessages = async () => {
    setMessagesLoading(true);
    setMessagesError("");
    try {
      const inbox = await getStudentInboxNotifications(studentDept || null, 12);
      if (inbox.success) {
        const mapped: StudentMessageItem[] = inbox.data.map((item) => ({
          id: item.id,
          title: item.title || "Update",
          body: item.message || "",
          timestamp: item.createdAt,
          source: item.senderRole === "admin" || item.senderRole === "faculty" ? item.senderRole : "system",
        }));
        setMessages(mapped);
        setMessagesLoading(false);
        return;
      }

      const [adminLogs, examLogs] = await Promise.all([
        supabase
          .from("admin_activity_logs")
          .select("id, action, details, timestamp")
          .order("timestamp", { ascending: false })
          .limit(10),
        supabase
          .from("exam_activity_logs")
          .select("id, activity_type, details, message, created_at")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      const nextMessages: StudentMessageItem[] = [];
      if (!adminLogs.error && Array.isArray(adminLogs.data)) {
        adminLogs.data.forEach((row: any) => {
          const title = String(row?.action || "").trim() || "Admin update";
          const body = String(row?.details || "").trim() || "New activity logged by admin.";
          nextMessages.push({
            id: `admin-${String(row?.id || Math.random())}`,
            title,
            body,
            timestamp: String(row?.timestamp || "").trim() || null,
            source: "admin",
          });
        });
      }
      if (!examLogs.error && Array.isArray(examLogs.data)) {
        examLogs.data.forEach((row: any) => {
          const title = String(row?.activity_type || "").trim() || "Faculty update";
          const body = String(row?.details || row?.message || "").trim() || "New update available.";
          nextMessages.push({
            id: `faculty-${String(row?.id || Math.random())}`,
            title,
            body,
            timestamp: String(row?.created_at || "").trim() || null,
            source: "faculty",
          });
        });
      }

      nextMessages.sort((a, b) => {
        const left = toSafeDate(a.timestamp)?.getTime() || 0;
        const right = toSafeDate(b.timestamp)?.getTime() || 0;
        return right - left;
      });
      setMessages(nextMessages.slice(0, 12));

      if (adminLogs.error && examLogs.error) {
        setMessagesError("Messages are unavailable right now.");
      }
    } catch (_error) {
      setMessages([]);
      setMessagesError("Messages are unavailable right now.");
    } finally {
      setMessagesLoading(false);
    }
  };

  useEffect(() => {
    const syncSubjectFromQuery = () => {
      if (!querySubjectId) return;

      const matchedSubject = (subjects || []).find(
        (subject) => String(subject.id) === String(querySubjectId)
      );
      if (!matchedSubject) return;

      if (querySubjectName) {
        setSelectedSubjectInStorage(querySubjectId, String(querySubjectName));
        return;
      }

      const current = getSelectedSubjectFromStorage();
      if (current.subjectId === querySubjectId && current.subjectName) return;
      setSelectedSubjectInStorage(querySubjectId, String(matchedSubject.name || ""));
    };

    syncSubjectFromQuery();
  }, [querySubjectId, querySubjectName, subjects]);

  useEffect(() => {
    if (subjectsLoading || isSubjectSelectionPage) return;

    if (!subjectId) {
      navigate("/student/subjects", { replace: true });
      return;
    }

    if (!allowedSubjectIds.has(String(subjectId))) {
      clearSelectedSubjectInStorage();
      setSelectedSubjectName("");
      navigate("/student/subjects", { replace: true });
    }
  }, [subjectId, allowedSubjectIds, isSubjectSelectionPage, navigate, subjectsLoading]);

  useEffect(() => {
    const saved = localStorage.getItem("studentSidebarOpen");
    if (saved !== null) {
      setSidebarOpen(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
    const next = getSelectedSubjectFromStorage().subjectName || "";
    setSelectedSubjectName(next);
  }, [location.pathname, location.search]);

  useEffect(() => {
    setMobileMenuOpen(false);
    setNotificationOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    void loadStudentMessages();

    const channel = supabase
      .channel("student-notifications-live")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "student_notifications",
        },
        () => {
          void loadStudentMessages();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [studentDept]);

  useEffect(() => {
    if (!notificationOpen) return;
    const seenAt = new Date().toISOString();
    setLastSeenAt(seenAt);
    localStorage.setItem(MESSAGE_CENTER_SEEN_AT_KEY, seenAt);
  }, [notificationOpen]);


  // Save sidebar state to localStorage
  const toggleSidebar = () => {
    const newState = !sidebarOpen;
    setSidebarOpen(newState);
    localStorage.setItem("studentSidebarOpen", JSON.stringify(newState));
  };

  async function logout() {
    await supabase.auth.signOut();
    clearAllUserScope();
    navigate("/login");
  }

  function toggleNotifications() {
    const nextOpen = !notificationOpen;
    setNotificationOpen(nextOpen);
    if (nextOpen) {
      void loadStudentMessages();
      // Auto-close after 8 seconds
      if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
      notificationTimerRef.current = setTimeout(() => setNotificationOpen(false), 8000);
    } else {
      if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
    }
  }

  function pauseNotificationTimer() {
    if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
  }

  function resumeNotificationTimer() {
    if (notificationOpen) {
      notificationTimerRef.current = setTimeout(() => setNotificationOpen(false), 5000);
    }
  }

  const isActive = (path: string) => {
    if (path === "/student") {
      return location.pathname === "/student";
    }
    return location.pathname.startsWith(path);
  };

  const withSubjectQuery = (path: string) => {
    if (!subjectId) return path;
    const next = new URLSearchParams(location.search);
    next.set("subject", subjectId);
    if (selectedSubjectName) {
      next.set("subjectName", selectedSubjectName);
    }
    return `${path}?${next.toString()}`;
  };

  return (
    <div className="faculty-bg-vibrant flex min-h-screen overflow-x-hidden text-slate-900">
      <AnimatePresence>
        {!isSubjectSelectionPage && mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 md:hidden"
          >
            <div className="absolute inset-0 bg-black/60" onClick={() => setMobileMenuOpen(false)} aria-hidden="true" />
            <motion.aside
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className="absolute left-0 top-0 h-full w-[88vw] max-w-[320px] border-r border-slate-200 bg-white/95 p-4 backdrop-blur-xl"
            >
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">Student Menu</p>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700"
                  aria-label="Close student menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="space-y-2">
                {navItems.map((item) => {
                  const active = isActive(item.path);
                  return (
                    <button
                      key={item.path}
                      type="button"
                      onClick={() => {
                        navigate(withSubjectQuery(item.path));
                        setMobileMenuOpen(false);
                      }}
                      className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm ${
                        active
                          ? "border-blue-200 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-700"
                      }`}
                    >
                      <item.icon className="h-5 w-5" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
              <div className="mt-5 space-y-2 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={async () => {
                    setMobileMenuOpen(false);
                    await logout();
                  }}
                  className="flex min-h-[44px] w-full items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-left text-sm text-amber-700"
                >
                  <LogOut className="h-5 w-5" />
                  <span>Sign out</span>
                </button>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================= SIDEBAR ================= */}
      {!isSubjectSelectionPage && (
      <motion.aside
        initial={false}
        animate={{ width: sidebarOpen ? SIDEBAR_WIDTH.open : SIDEBAR_WIDTH.closed }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="relative z-20 hidden flex-col border-r border-slate-200/80 bg-white/90 shadow-[0_16px_36px_rgba(15,23,42,0.08)] backdrop-blur-xl md:flex"
      >
        {/* Decorative ambient glow */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 -left-16 h-64 w-64 rounded-full bg-indigo-500/[0.04] blur-3xl" />
          <div className="absolute -bottom-24 -right-12 h-48 w-48 rounded-full bg-blue-500/[0.04] blur-3xl" />
        </div>

        {/* Brand header */}
        <div className="relative p-4 pb-3">
          <div className="flex items-center gap-3">
            <motion.div
              className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/30"
              whileHover={{ scale: 1.08, rotate: [0, -4, 4, 0] }}
              transition={{ duration: 0.35 }}
            >
              <GraduationCap className="h-5 w-5 text-white" />
              <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
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
                  <h2 className="whitespace-nowrap text-[15px] font-bold tracking-tight bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-transparent">
                    Lab Record
                  </h2>
                  <p className="whitespace-nowrap text-[11px] font-medium text-slate-500">Student Portal</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="mx-3 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

        {/* Toggle Button */}
        <motion.button
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.85 }}
          onClick={toggleSidebar}
          className="absolute -right-3 top-7 z-30 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-xl transition-colors hover:border-blue-300 hover:text-blue-700"
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {sidebarOpen ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </motion.button>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 space-y-0.5">
          <AnimatePresence>
            {sidebarOpen && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500"
              >
                Navigation
              </motion.p>
            )}
          </AnimatePresence>
          {navItems.map((item) => {
            const active = isActive(item.path);
            const colors = navColorMap[item.color] ?? defaultNavColor;
            return (
              <motion.button
                type="button"
                key={item.path}
                whileHover={{ x: sidebarOpen ? 3 : 0 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate(withSubjectQuery(item.path))}
                className={`
                  group relative flex w-full items-center gap-3 rounded-xl p-2.5 transition-all duration-200
                  ${active
                    ? "bg-[#DBEAFE] text-blue-700 border border-blue-200 shadow-sm"
                    : "border border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                  }
                `}
              >
                {active && (
                  <motion.div
                    layoutId="sidebarActiveStrip"
                    className="absolute left-0 top-1/2 -translate-y-1/2 h-7 w-[3px] rounded-r-full bg-[#2563EB]"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
                <div className={`relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors ${active ? "bg-blue-100" : `bg-transparent ${colors.hoverText}`}`}>
                  <item.icon className={`h-[18px] w-[18px] transition-colors ${active ? "text-blue-700" : `text-slate-500 ${colors.hoverText}`}`} />
                </div>
                <AnimatePresence>
                  {sidebarOpen && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: "auto" }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.2 }}
                      className="relative z-10 whitespace-nowrap overflow-hidden text-[13px] font-medium"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </nav>

        {/* Bottom area: user profile + logout */}
        <div className="relative px-3 pb-3 pt-2 space-y-2">
          <div className="mx-0 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

          {/* User profile card */}
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate(withSubjectQuery("/student/profile"))}
            className="group flex w-full items-center gap-2.5 rounded-xl border border-transparent p-2.5 text-left transition-all hover:border-slate-200 hover:bg-slate-100"
          >
            <div className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-[13px] font-bold text-white shadow-lg shadow-blue-500/20 ring-2 ring-white/80">
              {initials}
              <div className="absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full border-[1.5px] border-white bg-emerald-500" />
            </div>
            <AnimatePresence>
              {sidebarOpen && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex-1 min-w-0 overflow-hidden"
                >
                  <p className="truncate text-[13px] font-semibold text-slate-800 transition-colors group-hover:text-slate-900">
                    {studentName || "Student"}
                  </p>
                  {studentDept && (
                    <p className="truncate text-[11px] text-slate-500">{studentDept}</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>

          {/* Logout */}
          <motion.button
            type="button"
            whileHover={{ x: sidebarOpen ? 3 : 0 }}
            whileTap={{ scale: 0.97 }}
            onClick={logout}
            className="group flex w-full items-center gap-3 rounded-xl p-2.5 text-slate-500 transition-all hover:bg-amber-500/[0.07] hover:text-amber-700 border border-transparent hover:border-amber-500/20"
          >
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors group-hover:bg-amber-100">
              <LogOut className="h-[18px] w-[18px] transition-all group-hover:rotate-12" />
            </div>
            <AnimatePresence>
              {sidebarOpen && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.2 }}
                  className="whitespace-nowrap overflow-hidden text-[13px] font-medium"
                >
                  Sign out
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </motion.aside>
      )}

      {/* ================= MAIN ================= */}
      <main className={`flex-1 overflow-y-auto ${isSubjectSelectionPage ? "w-full" : ""}`}>
        {!isSubjectSelectionPage && (
          <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/80 backdrop-blur-2xl">
            <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(true)}
                  className="h-11 w-11 rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 md:hidden"
                  aria-label="Toggle navigation menu"
                >
                  <Menu className="h-4 w-4" />
                </button>

                {/* Breadcrumb-style subject indicator */}
                <div className="flex items-center gap-2 text-sm">
                  <span className="hidden sm:inline text-slate-500 font-medium">Dashboard</span>
                  {selectedSubjectName && (
                    <>
                      <span className="hidden sm:inline text-slate-600">/</span>
                      <span
                        className="inline-flex max-w-[min(100vw-10rem,22rem)] min-h-[44px] cursor-default items-center gap-1.5 truncate rounded-lg border border-slate-200 bg-slate-50/95 px-2.5 py-1 text-xs font-semibold text-slate-800"
                        title="Current subject. Sign out to choose a different subject."
                      >
                        <span className="relative flex h-1.5 w-1.5 shrink-0">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-indigo-400" />
                        </span>
                        <span className="truncate">{selectedSubjectName}</span>
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="hidden items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 md:inline-flex">
                  <Calendar className="h-3 w-3" />
                  {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </span>
                <div className="relative">
                  <button
                    type="button"
                    aria-label="Open notifications"
                    onClick={toggleNotifications}
                    className={`group relative h-11 w-11 rounded-xl border bg-white p-1.5 shadow-sm transition-all duration-150 ${
                      notificationOpen
                        ? "border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-700 shadow-[0_8px_20px_rgba(37,99,235,0.18)]"
                        : "border-slate-200 text-slate-500 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-slate-50 hover:text-slate-700 hover:shadow-[0_8px_20px_rgba(15,23,42,0.12)]"
                    }`}
                  >
                    <Bell className={`h-4 w-4 transition-transform duration-150 ${notificationOpen ? "scale-110" : "group-hover:scale-105"}`} />
                    <ChevronDown
                      className={`absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-white text-slate-500 ring-1 ring-slate-200 transition-transform ${
                        notificationOpen ? "rotate-180 text-blue-600 ring-blue-200" : ""
                      }`}
                    />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[18px] rounded-full border border-white bg-gradient-to-r from-amber-500 to-orange-500 px-1 text-center text-[10px] font-semibold text-white shadow-sm">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </button>
                  <AnimatePresence>
                    {notificationOpen && (
                      <>
                        <motion.button
                          type="button"
                          aria-label="Close notifications"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.14 }}
                          onClick={() => setNotificationOpen(false)}
                          className="fixed inset-0 z-20 bg-slate-900/10 backdrop-blur-[1px]"
                        />
                        <motion.div
                          initial={{ opacity: 0, y: -8, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -6, scale: 0.98 }}
                          transition={{ duration: 0.16, ease: "easeOut" }}
                          className="absolute right-0 top-12 z-30 w-[min(92vw,360px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
                          onMouseEnter={pauseNotificationTimer}
                          onMouseLeave={resumeNotificationTimer}
                        >
                          <div className="absolute right-4 top-[-6px] h-3 w-3 rotate-45 border-l border-t border-slate-200 bg-white" />
                          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                            <div className="flex items-center gap-2">
                              <MessageSquare className="h-4 w-4 text-blue-600" />
                              <p className="text-sm font-semibold text-slate-800">Notifications</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-slate-500">
                                {messages.length} item{messages.length !== 1 ? "s" : ""}
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
                            {messagesLoading ? (
                              <p className="px-2 py-2 text-sm text-slate-500">Loading messages...</p>
                            ) : messagesError ? (
                              <p className="px-2 py-2 text-sm text-amber-700">{messagesError}</p>
                            ) : messages.length === 0 ? (
                              <p className="px-2 py-2 text-sm text-slate-500">
                                No faculty/admin messages yet.
                              </p>
                            ) : (
                              messages.map((item) => (
                                <div
                                  key={item.id}
                                  className="mb-1 rounded-xl border border-slate-200 bg-slate-50 p-3"
                                >
                                  <div className="mb-1 flex items-center justify-between gap-2">
                                    <p className="truncate text-xs font-semibold text-slate-800">
                                      {item.title}
                                    </p>
                                    <span className="shrink-0 text-[10px] text-slate-500">
                                      {formatMessageTime(item.timestamp)}
                                    </span>
                                  </div>
                                  <p className="line-clamp-3 text-xs text-slate-600">{item.body}</p>
                                  <span
                                    className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                      item.source === "faculty"
                                        ? "bg-indigo-100 text-indigo-700"
                                        : item.source === "admin"
                                          ? "bg-blue-100 text-blue-700"
                                          : "bg-slate-200 text-slate-700"
                                    }`}
                                  >
                                    {item.source === "faculty"
                                      ? "Faculty"
                                      : item.source === "admin"
                                        ? "Admin"
                                        : "System"}
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
                <div className="ml-1 hidden items-center gap-2 border-l border-slate-200 pl-2 sm:flex">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-600/80 to-indigo-600/80 text-[10px] font-bold text-white ring-1 ring-white/10">
                    {initials}
                  </div>
                  <span className="text-[12px] font-medium text-slate-400">{studentName || "Student"}</span>
                </div>
              </div>
            </div>
          </header>
        )}
        <Outlet />
      </main>
    </div>
  );
}
