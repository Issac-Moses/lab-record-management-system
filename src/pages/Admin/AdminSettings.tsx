import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";
import { fadeUp } from "@/animations/motion";
import {
  Activity,
  ArrowRight,
  Bot,
  Cog,
  Mail,
  Shield,
  Sparkles,
  Trophy,
  UserPlus,
} from "lucide-react";
// @ts-ignore – JSX module, no type declaration available
import AdminShell from "@/layouts/AdminShell";
import NotificationComposerCard from "@/components/notifications/NotificationComposerCard";
// @ts-ignore – JS module, no type declaration available
import { requestAdminApi, parseAdminApiError } from "@/services/adminApiClient";
// @ts-ignore – JS module, no type declaration available
import { getAdminDashboardScopeHeaders, getAdminDashboardSummaryEndpointPath } from "@/services/adminDataService";

type VisibilitySnapshot = {
  students: number;
  faculty: number;
  submitted: number;
  evaluated: number;
};

export default function AdminSettings() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [visibility, setVisibility] = useState<VisibilitySnapshot>({
    students: 0,
    faculty: 0,
    submitted: 0,
    evaluated: 0,
  });
  const navigate = useNavigate();

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user?.email) {
        setEmail(data.session.user.email);
      }
      setLoading(false);
    };
    void init();
  }, []);

  const loadVisibilitySnapshot = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      /** Server-side counts (service role); direct Supabase queries here return 0 under RLS. */
      const scopeHeaders = await getAdminDashboardScopeHeaders();
      const summaryPath = await getAdminDashboardSummaryEndpointPath();
      const { response } = await requestAdminApi(summaryPath, {
        method: "GET",
        token,
        headers: scopeHeaders,
      });
      if (!response.ok) {
        const message = await parseAdminApiError(response, "Failed to load dashboard summary");
        throw new Error(message);
      }
      const payload = await response.json().catch(() => null);
      const summary = payload?.data || {};
      setVisibility({
        students: Number(summary.students) || 0,
        faculty: Number(summary.faculty) || 0,
        submitted: Number(summary.pending) || 0,
        evaluated: Number(summary.evaluated) || 0,
      });
    } catch (err) {
      console.error("Failed to load snapshot:", err);
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    void loadVisibilitySnapshot();
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      void loadVisibilitySnapshot();
    }, 60000);
    return () => window.clearInterval(interval);
  }, [loadVisibilitySnapshot, loading]);

  if (loading) {
    return (
      <AdminShell title="Settings">
        <div className="col-span-12 space-y-4">
          <div className="faculty-shimmer h-24 animate-pulse rounded-2xl border border-slate-200/80 bg-white" />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="faculty-shimmer h-56 animate-pulse rounded-2xl border border-slate-200/80 bg-white" />
            <div className="faculty-shimmer h-56 animate-pulse rounded-2xl border border-slate-200/80 bg-white" />
          </div>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Settings">
      <div className="col-span-12 space-y-8">
        {/* Signed-in + hero */}
        <motion.div {...fadeUp} className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-sm ring-1 ring-slate-900/[0.04] backdrop-blur-sm md:p-8">
          <div className="pointer-events-none absolute -right-16 -top-10 h-40 w-40 rounded-full bg-emerald-600/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-1/4 h-36 w-36 rounded-full bg-blue-600/10 blur-3xl" />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Account</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Mail className="h-4 w-4 text-blue-600" />
              <span className="text-sm text-slate-600">Signed in as</span>
              <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-sm font-semibold text-slate-900">
                {email || "—"}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Two cards */}
        <div className="grid gap-6 lg:grid-cols-2">
          <motion.div {...fadeUp} transition={{ delay: 0.06 }} className="faculty-surface rounded-2xl p-6 shadow-sm ring-1 ring-slate-900/[0.04] md:p-7">
            <h2 className="mb-5 flex items-center gap-3 text-base font-semibold text-slate-900">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/80">
                <Cog className="h-5 w-5 text-slate-700" />
              </span>
              Server controls
            </h2>
            <div className="rounded-xl border border-slate-200/90 bg-white px-4 py-4 shadow-inner">
              <p className="text-sm leading-relaxed text-slate-700">
                Maintenance mode, registration policy, and backup schedules are not exposed in this build.
              </p>
              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                Use environment variables, Supabase dashboard, or your deployment pipeline to change system behavior.
              </p>
            </div>
          </motion.div>

          <motion.div {...fadeUp} transition={{ delay: 0.08 }} className="faculty-surface rounded-2xl p-6 shadow-sm ring-1 ring-slate-900/[0.04] md:p-7">
            <h2 className="mb-5 flex items-center gap-3 text-base font-semibold text-slate-900">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 ring-1 ring-blue-100">
                <Activity className="h-5 w-5 text-blue-600" />
              </span>
              System information
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <StatTile label="Students" value={visibility.students} variant="blue" />
              <StatTile label="Faculty" value={visibility.faculty} variant="violet" />
              <StatTile label="Pending review" value={visibility.submitted} variant="amber" />
              <StatTile label="Evaluated" value={visibility.evaluated} variant="emerald" />
            </div>
            <p className="mt-5 text-center text-xs text-slate-500">
              Snapshot refreshes every minute while this page is open.
            </p>
          </motion.div>
        </div>

        {/* Quick links */}
        <motion.div {...fadeUp} transition={{ delay: 0.1 }} className="faculty-surface rounded-2xl p-6 shadow-sm ring-1 ring-slate-900/[0.04] md:p-7">
          <h2 className="text-base font-semibold text-slate-900">Quick links</h2>
          <p className="mt-1 text-sm text-slate-500">Jump to tools also available in the sidebar.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <QuickLinkButton
              icon={<Trophy className="h-4 w-4 text-amber-500" />}
              label="Leaderboard"
              onClick={() => navigate("/admin/leaderboard")}
            />
            <QuickLinkButton
              icon={<Bot className="h-4 w-4 text-indigo-500" />}
              label="AI monitor"
              onClick={() => navigate("/admin/ai-monitor")}
            />
            <QuickLinkButton
              icon={<Shield className="h-4 w-4 text-rose-500" />}
              label="Proctor (under Reports)"
              onClick={() => navigate("/admin/submissions?tab=proctor")}
            />
            <QuickLinkButton
              icon={<UserPlus className="h-4 w-4 text-blue-500" />}
              label="Students — import & add users"
              onClick={() => navigate("/admin/students?tab=import")}
            />
            <QuickLinkButton
              icon={<Sparkles className="h-4 w-4 text-violet-500" />}
              label="Gamification (under Leaderboard)"
              onClick={() => navigate("/admin/leaderboard?tab=gamification")}
            />
          </div>
        </motion.div>

        <motion.div {...fadeUp} transition={{ delay: 0.12 }}>
          <NotificationComposerCard title="Messages" />
        </motion.div>
      </div>
    </AdminShell>
  );
}

function StatTile({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: "blue" | "violet" | "amber" | "emerald";
}) {
  const styles: Record<typeof variant, string> = {
    blue: "border-sky-100 bg-gradient-to-br from-sky-50 to-blue-50/80 text-sky-900 ring-sky-100",
    violet: "border-violet-100 bg-gradient-to-br from-violet-50 to-purple-50/80 text-violet-900 ring-violet-100",
    amber: "border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50/50 text-amber-950 ring-amber-100",
    emerald: "border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-50/60 text-emerald-900 ring-emerald-100",
  };
  return (
    <div
      className={`rounded-xl border px-4 py-4 shadow-sm ring-1 ${styles[variant]}`}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-600/90">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight">{value}</p>
    </div>
  );
}

function QuickLinkButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[52px] items-center justify-between rounded-xl border border-slate-200/90 bg-white px-4 py-3 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/50 hover:shadow-md"
    >
      <span className="inline-flex items-center gap-2.5 text-sm font-medium text-slate-800">
        {icon}
        {label}
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-500" />
    </button>
  );
}
