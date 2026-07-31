import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Users, UserCheck, Building2, FlaskConical } from "lucide-react";
import { requestAdminApi, parseAdminApiError } from "@/services/adminApiClient";
import {
  getAdminDashboardScopeHeaders,
  getAdminDashboardSummaryEndpointPath,
} from "@/services/adminDataService";

function StatCard({ title, value, icon, tone }) {
  const toneClass = {
    indigo: "from-indigo-50 to-white border-indigo-200 text-indigo-700",
    emerald: "from-emerald-50 to-white border-emerald-200 text-emerald-700",
    violet: "from-violet-50 to-white border-violet-200 text-violet-700",
    cyan: "from-cyan-50 to-white border-cyan-200 text-cyan-700",
  };

  return (
    <div className={`rounded-xl border bg-gradient-to-br p-4 shadow-sm ${toneClass[tone]}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-600">{title}</p>
        <div className="text-slate-500">{icon}</div>
      </div>
      <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

export default function AdminStatsCards({ refreshKey = 0 }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalFaculty: 0,
    totalDepartments: 0,
    totalSubmissions: 0,
  });
  const [scopeInfo, setScopeInfo] = useState({ scope: "all", department: null });

  useEffect(() => {
    let mounted = true;

    async function loadStats() {
      setLoading(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) throw new Error("Session expired");

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

        if (!mounted) return;
        setScopeInfo({
          scope: summary.scope === "department" ? "department" : "all",
          department: summary.department ? String(summary.department) : null,
        });
        setStats({
          totalStudents: Number(summary.students) || 0,
          totalFaculty: Number(summary.faculty) || 0,
          totalDepartments: Number(summary.departments_count) || 0,
          totalSubmissions: Number(summary.submissions) || 0,
        });
      } catch (error) {
        console.error("Failed to load admin stats:", error);
        if (!mounted) return;
        setScopeInfo({ scope: "all", department: null });
        setStats({
          totalStudents: 0,
          totalFaculty: 0,
          totalDepartments: 0,
          totalSubmissions: 0,
        });
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadStats();
    return () => {
      mounted = false;
    };
  }, [refreshKey]);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {scopeInfo.scope === "department" && scopeInfo.department ? (
        <p className="text-xs text-slate-500">
          KPIs are scoped to your department:{" "}
          <span className="font-medium text-slate-700">{scopeInfo.department}</span> (not
          institution-wide).
        </p>
      ) : (
        <p className="text-xs text-slate-500">
          KPIs show <span className="font-medium text-slate-700">all departments</span> (institution
          totals).
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatCard
        title="Total Students"
        value={stats.totalStudents}
        icon={<Users className="h-4 w-4" />}
        tone="indigo"
      />
      <StatCard
        title="Total Faculty"
        value={stats.totalFaculty}
        icon={<UserCheck className="h-4 w-4" />}
        tone="emerald"
      />
      <StatCard
        title="Total Departments"
        value={stats.totalDepartments}
        icon={<Building2 className="h-4 w-4" />}
        tone="violet"
      />
      <StatCard
        title="Total Submissions"
        value={stats.totalSubmissions}
        icon={<FlaskConical className="h-4 w-4" />}
        tone="cyan"
      />
      </div>
    </div>
  );
}
