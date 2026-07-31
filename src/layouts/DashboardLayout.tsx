import { ReactNode, useState } from "react";
import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Menu,
  X,
  Sun,
  Moon,
  LogOut,
  LucideIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type LinkItem = {
  label: string;
  to: string;
  icon: LucideIcon;
};

export default function DashboardLayout({
  title,
  children,
  links,
}: {
  title: string;
  children: ReactNode;
  links: LinkItem[];
}) {
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);

  function toggleTheme() {
    setDark((d) => !d);
    document.documentElement.classList.toggle("dark");
  }

  async function logout() {
    await supabase.auth.signOut();
    localStorage.removeItem("dept");
    localStorage.removeItem("year");
    localStorage.removeItem("semester");
    window.location.replace("/login");
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 25 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={dark ? "dark" : ""}
    >
      <div className="flex min-h-screen bg-slate-100 dark:bg-slate-950">
        {/* MOBILE MENU BUTTON */}
        <button
          onClick={() => setOpen(true)}
          className="md:hidden fixed top-4 left-4 z-50 bg-white dark:bg-slate-900 p-2 rounded shadow"
        >
          <Menu />
        </button>

        {/* SIDEBAR */}
        <aside
          className={`fixed md:static z-40 w-64 h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transform transition-transform
          ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
        >
          {/* HEADER */}
          <div className="flex items-center justify-between p-6">
            <h2 className="text-xl font-bold text-blue-600">
              🧪 {title}
            </h2>
            <button className="md:hidden" onClick={() => setOpen(false)}>
              <X />
            </button>
          </div>

          {/* NAV */}
          <nav className="px-4 space-y-2">
            {links.map((l) => {
              const Icon = l.icon;
              return (
                <NavLink
                  key={l.to}
                  to={l.to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2 rounded-lg transition
                    ${
                      isActive
                        ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`
                  }
                >
                  <Icon size={18} />
                  {l.label}
                </NavLink>
              );
            })}
          </nav>

          {/* FOOTER */}
          <div className="absolute bottom-6 w-full px-4 space-y-2">
            <button
              onClick={toggleTheme}
              className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
              Toggle Theme
            </button>

            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <LogOut size={18} />
              Logout
            </button>
          </div>
        </aside>

        {/* CONTENT */}
        <main className="flex-1 p-6 md:p-10 text-slate-800 dark:text-slate-100">
          {children}
        </main>
      </div>
    </motion.div>
  );
}