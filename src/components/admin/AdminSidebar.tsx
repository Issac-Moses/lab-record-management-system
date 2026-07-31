import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Home,
  UserPlus,
  Settings,
  Building2,
  LayoutDashboard,
  LogOut,
  Menu,
  X,
} from "lucide-react";

export type ActiveKey =
  | "overview"
  | "add-user"
  | "settings"
  | "department-home"
  | "department-dashboard";

export default function AdminSidebar({
  activeKey,
  onLogout,
  selectedDepartment,
}: {
  activeKey: ActiveKey;
  onLogout: () => void;
  selectedDepartment?: string | null;
}) {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("adminSidebarOpen");
    if (saved != null) {
      setSidebarOpen(saved === "true");
    }
  }, []);

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem("adminSidebarOpen", String(next));
      return next;
    });
  };

  const departmentPath = selectedDepartment
    ? `/admin/department/${encodeURIComponent(selectedDepartment)}`
    : null;

  const items = [
    { key: "overview", label: "Admin Overview", icon: <Home className="h-4 w-4" />, onClick: () => navigate("/admin"), disabled: false },
    { key: "add-user", label: "Add User", icon: <UserPlus className="h-4 w-4" />, onClick: () => navigate("/admin/students?tab=add"), disabled: false },
    { key: "settings", label: "Settings", icon: <Settings className="h-4 w-4" />, onClick: () => navigate("/admin/settings"), disabled: false },
    {
      key: "department-home",
      label: "Department Home",
      icon: <Building2 className="h-4 w-4" />,
      onClick: () => departmentPath && navigate(departmentPath),
      disabled: !departmentPath,
    },
    {
      key: "department-dashboard",
      label: "Department Dashboard",
      icon: <LayoutDashboard className="h-4 w-4" />,
      onClick: () => departmentPath && navigate(`${departmentPath}/dashboard`),
      disabled: !departmentPath,
    },
  ] as const;

  useEffect(() => {
    setMobileOpen(false);
  }, [activeKey, selectedDepartment]);

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 py-3 md:hidden">
        <p className="text-sm font-semibold text-slate-800">Admin Panel</p>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700"
          aria-label="Open admin menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 md:hidden"
          >
            <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setMobileOpen(false)} aria-hidden="true" />
            <motion.aside
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className="absolute left-0 top-0 h-full w-[88vw] max-w-[320px] border-r border-slate-200 bg-white/95 p-4"
            >
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Navigation</p>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700"
                  aria-label="Close admin menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-2">
                {items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      if (item.disabled) return;
                      item.onClick();
                      setMobileOpen(false);
                    }}
                    disabled={item.disabled}
                    className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm ${
                      item.key === activeKey
                        ? "border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-sm"
                        : "border-slate-200 bg-white text-slate-700"
                    } ${item.disabled ? "cursor-not-allowed opacity-40" : ""}`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  onLogout();
                }}
                className="mt-4 flex min-h-[44px] w-full items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-left text-sm text-rose-700"
              >
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </button>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.aside
        initial={false}
        animate={{ width: sidebarOpen ? 252 : 84 }}
        transition={{ type: "spring", stiffness: 260, damping: 28 }}
        className="sticky top-0 hidden h-screen shrink-0 border-r border-slate-200/80 bg-white/90 p-3 backdrop-blur-xl md:block"
      >
      <div className="mb-4 flex items-center justify-between">
        {sidebarOpen ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Admin Navigation</p>
        ) : (
          <span className="text-xs text-slate-500">Nav</span>
        )}
        <button
          type="button"
          onClick={toggleSidebar}
          className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
        >
          {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>

      <div className="space-y-2">
        {items.map((item) => {
          const active = item.key === activeKey;
          return (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              disabled={item.disabled}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                active
                  ? "border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-sm"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              } ${item.disabled ? "cursor-not-allowed opacity-40" : ""}`}
            >
              {item.icon}
              {sidebarOpen ? <span>{item.label}</span> : null}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onLogout}
        className="mt-4 flex w-full items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-left text-sm text-rose-700 transition hover:bg-rose-100"
      >
        <LogOut className="h-4 w-4" />
        {sidebarOpen ? <span>Logout</span> : null}
      </button>
      </motion.aside>
    </>
  );
}

