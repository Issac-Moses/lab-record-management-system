import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Command,
  LayoutDashboard,
  Building2,
  Users,
  FlaskConical,
  BookOpen,
  Settings,
  MessageSquare,
  FileText,
  Search,
  LogOut,
  Trophy,
  ClipboardList,
} from "lucide-react";
import CommandPalette from "@/components/admin/CommandPalette";
import BackButton from "@/components/BackButton";
import { supabase } from "@/lib/supabase";
import { getAdminInboxNotifications } from "@/services/studentNotificationsService";
import { formatDepartmentNameUpper } from "@/utils/departmentLabel";

const MENU = [
  { label: "OVERVIEW", to: "/admin", icon: LayoutDashboard },
  { label: "STUDENTS", to: "/admin/students", icon: Users },
  { label: "EXPERIMENTS", to: "/admin/experiments", icon: FlaskConical },
  { label: "LEADERBOARD", to: "/admin/leaderboard", icon: Trophy },
  { label: "SUBJECTS", to: "/admin/subjects", icon: BookOpen },
  { label: "REPORTS", to: "/admin/submissions", icon: FileText },
  { label: "INTERNAL MARKS", to: "/admin/internal-marks", icon: ClipboardList },
  { label: "MESSAGE", to: "/admin/notifications", icon: MessageSquare },
  { label: "SETTINGS", to: "/admin/settings", icon: Settings },
];

const ADMIN_NOTIFICATIONS_SEEN_KEY = "admin_notifications_seen_at_v1";

function toSafeDate(value) {
  const parsed = new Date(String(value || ""));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatNotificationTime(value) {
  const parsed = toSafeDate(value);
  if (!parsed) return "Just now";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminShell({ title, children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [adminDept, setAdminDept] = useState("");
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");
  const [lastSeenAt, setLastSeenAt] = useState(
    () => localStorage.getItem(ADMIN_NOTIFICATIONS_SEEN_KEY) || ""
  );

  useEffect(() => {
    const saved = localStorage.getItem("adminShellCollapsed");
    setCollapsed(saved === "true");
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data?.session || !alive) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("department")
        .eq("id", data.session.user.id)
        .maybeSingle();
      if (alive) {
        setAdminDept(formatDepartmentNameUpper(profile?.department, ""));
      }
    })();
    return () => { alive = false; };
  }, []);

  const toggleSidebar = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("adminShellCollapsed", String(next));
      return next;
    });
  };

  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const commandItems = useMemo(
    () =>
      MENU.map((item) => ({
        id: item.to,
        label: item.label,
        group: "Navigation",
        onSelect: () => navigate(item.to),
      })),
    [navigate]
  );

  const unreadCount = useMemo(() => {
    if (!notifications.length) return 0;
    const seenTime = toSafeDate(lastSeenAt)?.getTime() || 0;
    if (!seenTime) return notifications.length;
    return notifications.filter((item) => {
      const ts = toSafeDate(item.createdAt)?.getTime() || 0;
      return ts > seenTime;
    }).length;
  }, [notifications, lastSeenAt]);

  const activeMenuIndex = useMemo(() => {
    const path = location.pathname;
    if (path === "/admin" || path === "/admin/") {
      return MENU.findIndex((item) => item.to === "/admin");
    }
    if (path.startsWith("/admin/department/")) {
      return MENU.findIndex((item) => item.to === "/admin");
    }
    if (path.startsWith("/admin/ai-monitor")) {
      return MENU.findIndex((item) => item.to === "/admin/experiments");
    }
    const idx = MENU.findIndex((item) => item.to !== "/admin" && (path === item.to || path.startsWith(`${item.to}/`)));
    return idx >= 0 ? idx : MENU.findIndex((item) => item.to === "/admin");
  }, [location.pathname]);

  const logout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("dept");
    localStorage.removeItem("year");
    localStorage.removeItem("semester");
    navigate("/login", { replace: true });
  };

  const loadAdminNotifications = async () => {
    setNotificationsLoading(true);
    setNotificationsError("");
    const result = await getAdminInboxNotifications(15);
    if (!result.success) {
      setNotifications([]);
      setNotificationsError(result.error);
    } else {
      setNotifications(result.data);
    }
    setNotificationsLoading(false);
  };

  useEffect(() => {
    setNotificationOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    void loadAdminNotifications();

    const channel = supabase
      .channel("admin-notifications-live")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "student_notifications",
        },
        () => {
          void loadAdminNotifications();
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
    localStorage.setItem(ADMIN_NOTIFICATIONS_SEEN_KEY, seenAt);
  }, [notificationOpen]);


  return (
    <div className="faculty-bg-vibrant min-h-screen text-slate-900">
      <div className="mx-auto flex min-h-screen w-full">
        <motion.aside
          initial={false}
          animate={{ width: collapsed ? 64 : 240 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="sticky top-0 z-30 hidden h-screen min-h-0 shrink-0 flex-col overflow-y-auto overflow-x-hidden border-r border-slate-200/80 bg-white p-3 shadow-[0_16px_36px_rgba(15,23,42,0.08)] backdrop-blur-xl md:flex"
        >
          {/* Brand header */}
          <div className="mb-3 flex items-center justify-between">
            {!collapsed ? <p className="text-sm font-semibold text-slate-700">Lab Record System</p> : <span />}
            <button onClick={toggleSidebar} className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 transition hover:bg-blue-50 hover:text-blue-700">
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>

          {/* Department badge */}
          <AnimatePresence>
            {adminDept && !collapsed && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-3"
              >
                <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                  <span className="truncate text-xs font-medium text-blue-700">{adminDept}</span>
                </div>
              </motion.div>
            )}
            {adminDept && collapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mb-3 flex justify-center"
                title={adminDept}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                  <Building2 className="h-3.5 w-3.5 text-blue-600" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <nav className="flex-1 space-y-1.5">
            {MENU.map((item) => {
              const Icon = item.icon;
              const active = MENU[activeMenuIndex]?.to === item.to && activeMenuIndex === MENU.indexOf(item);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  title={collapsed ? item.label : undefined}
                  className={`relative flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${
                    active
                      ? "border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-sm"
                      : "border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-800"
                  }`}
                >
                  {active && (
                    <motion.div
                      layoutId="adminSidebarActive"
                      className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-blue-600"
                      transition={{ type: "spring", stiffness: 350, damping: 30 }}
                    />
                  )}
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  {!collapsed ? <span>{item.label}</span> : null}
                </Link>
              );
            })}
          </nav>

          <button
            onClick={() => void logout()}
            className="mt-auto flex w-full items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-left text-sm text-rose-700 transition hover:bg-rose-100"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed ? <span>Logout</span> : null}
          </button>
        </motion.aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
            <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center justify-between gap-3 px-4 md:px-7">
              <div className="flex items-center gap-3 text-sm text-slate-700">
                <BackButton />
                <span className="text-slate-500">Admin</span>
                <span className="text-slate-300">/</span>
                {adminDept && (
                  <>
                    <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-blue-200">
                      <Building2 className="h-3 w-3" />
                      {adminDept}
                    </span>
                    <span className="text-slate-300">/</span>
                  </>
                )}
                <span>{title}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem("auth_role", "faculty");
                    navigate("/faculty");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition shadow-2xs cursor-pointer"
                >
                  <FlaskConical className="h-3.5 w-3.5 text-indigo-600" />
                  <span>Faculty Workspace</span>
                </button>
                <button
                  onClick={() => setPaletteOpen(true)}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-50"
                >
                  <Search className="h-3.5 w-3.5" />
                  Search
                  <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">Ctrl+K</kbd>
                </button>
                <div className="relative">
                  <button
                    onClick={() => {
                      const nextOpen = !notificationOpen;
                      setNotificationOpen(nextOpen);
                      if (nextOpen) {
                        void loadAdminNotifications();
                      }
                    }}
                    title="Open notifications"
                    aria-label="Open notifications"
                    className={`relative rounded-lg border bg-white p-2 transition ${
                      notificationOpen
                        ? "border-blue-300 text-blue-700"
                        : "border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 ? (
                      <span className="absolute -right-1 -top-1 min-w-[17px] rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-1 text-center text-[10px] font-semibold text-white">
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
                        >
                          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                            <p className="text-sm font-semibold text-slate-800">Notifications</p>
                            <span className="text-[11px] text-slate-500">
                              {notifications.length} item{notifications.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <div className="max-h-[340px] overflow-y-auto px-2 py-2">
                            {notificationsLoading ? (
                              <p className="px-2 py-2 text-sm text-slate-500">Loading notifications...</p>
                            ) : notificationsError ? (
                              <p className="px-2 py-2 text-sm text-rose-700">{notificationsError}</p>
                            ) : notifications.length === 0 ? (
                              <p className="px-2 py-2 text-sm text-slate-500">No notifications yet.</p>
                            ) : (
                              notifications.map((item) => (
                                <div key={item.id} className="mb-1 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                  <div className="mb-1 flex items-center justify-between gap-2">
                                    <p className="truncate text-xs font-semibold text-slate-800">{item.title}</p>
                                    <span className="text-[10px] text-slate-500">{formatNotificationTime(item.createdAt)}</span>
                                  </div>
                                  <p className="line-clamp-3 text-xs text-slate-600">{item.message}</p>
                                  <span className="mt-2 inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                    {(item.targetRole || "student") === "faculty" ? "Faculty" : "Students"}
                                    {item.targetDepartment ? ` • ${item.targetDepartment}` : " • All"}
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
                <button
                  onClick={() => setPaletteOpen(true)}
                  title="Open command palette"
                  aria-label="Open command palette"
                  className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 transition hover:bg-slate-50"
                >
                  <Command className="h-4 w-4" />
                </button>
                <button
                  onClick={() => void logout()}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-700 transition hover:bg-rose-100"
                >
                  Logout
                </button>
              </div>
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-7 md:px-7">
            <div className="grid grid-cols-12 gap-4">{children}</div>
          </main>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={commandItems} />
    </div>
  );
}
