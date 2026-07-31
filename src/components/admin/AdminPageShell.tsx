import type React from "react";
import { motion } from "framer-motion";
import AdminSidebar, { type ActiveKey } from "@/components/admin/AdminSidebar";

export default function AdminPageShell({
  activeKey,
  selectedDepartment,
  onLogout,
  title,
  subtitle,
  actions,
  children,
}: {
  activeKey: ActiveKey;
  selectedDepartment?: string | null;
  onLogout: () => Promise<void> | void;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="faculty-bg-vibrant min-h-screen text-slate-900 md:flex">
      <AdminSidebar
        activeKey={activeKey}
        selectedDepartment={selectedDepartment}
        onLogout={onLogout}
      />
      <motion.main
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="relative flex-1 overflow-y-auto pt-16 md:pt-0"
      >
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-12 top-10 h-44 w-44 rounded-full bg-blue-600/10 blur-3xl" />
          <div className="absolute right-10 top-24 h-56 w-56 rounded-full bg-violet-600/10 blur-3xl" />
          <div className="absolute bottom-12 left-1/3 h-40 w-40 rounded-full bg-emerald-600/10 blur-3xl" />
        </div>

        <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-8">
            <div>
              <h1 className="text-xl font-semibold text-slate-900 md:text-2xl">{title}</h1>
              {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
          </div>
        </header>

        <div className="relative mx-auto w-full max-w-7xl p-4 md:p-8">{children}</div>
      </motion.main>
    </div>
  );
}

export function AdminGlassCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`faculty-surface rounded-2xl ${className}`}
    >
      {children}
    </div>
  );
}

