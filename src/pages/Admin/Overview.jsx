import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Building2,
  GraduationCap,
  Users,
  BookOpen,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import { motion } from "framer-motion";
import AdminShell from "@/layouts/AdminShell";
import StatCard from "@/components/admin/StatCard";
import ChartCard from "@/components/admin/ChartCard";
import InsightCard from "@/components/admin/InsightCard";
import ActivityFeed from "@/components/admin/ActivityFeed";
import ShellCard from "@/components/admin/ShellCard";
import FadeSwitch from "@/components/admin/FadeSwitch";
import EmptyState from "@/components/admin/EmptyState";
import { getAdminOverviewData } from "@/services/adminDataService";
import { formatDepartmentNameUpper } from "@/utils/departmentLabel";

export default function Overview() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getAdminOverviewData();
      setData(result);
    } catch (loadError) {
      setData(null);
      setError(loadError instanceof Error ? loadError.message : "Failed to load overview.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      await fetchOverview();
    })();
    return () => {
      alive = false;
    };
  }, [fetchOverview]);

  const stats = data?.stats || [];
  const trend = data?.trend || [];
  const insights = data?.insights || [];
  const activity = data?.activity || [];
  const studentPerformance = data?.studentPerformance || [];
  const department = data?.department || "";
  const displayDepartment = formatDepartmentNameUpper(department, "");
  const subjectCount = data?.subjectCount || 0;
  const kpiSource = data?.kpiSource || "client";
  const totalStudents = Number(
    stats.find((item) => String(item?.label || "").toLowerCase().includes("student"))?.value || 0
  );
  const icons = [Users, GraduationCap, Activity, BarChart3];

  return (
    <AdminShell title="Overview">
      {/* Department header */}
      <div className="col-span-12">
        <FadeSwitch
          loading={loading}
          skeleton={
            <div className="faculty-shimmer h-24 animate-pulse rounded-2xl border border-slate-200 bg-white" />
          }
        >
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="faculty-glass faculty-gradient-ring relative overflow-hidden rounded-2xl p-5"
          >
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-blue-500/5 blur-3xl" />
            <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-violet-500/5 blur-3xl" />
            <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 ring-1 ring-blue-500/20">
                  <Building2 className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-slate-900">
                    {displayDepartment || "Department Dashboard"}
                  </h1>
                  <p className="text-xs text-slate-500">
                    {displayDepartment ? "Your department overview" : "Admin overview"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-200">
                  <BookOpen className="h-3 w-3" />
                  {subjectCount} Subject{subjectCount !== 1 ? "s" : ""}
                </span>
                {department && (
                  <button
                    onClick={() => navigate(`/admin/department/${encodeURIComponent(department)}/dashboard`)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200 transition hover:bg-indigo-100"
                  >
                    <TrendingUp className="h-3 w-3" />
                    Detailed View
                    <ArrowRight className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </FadeSwitch>
      </div>
      {error ? (
        <div className="col-span-12 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {!loading && kpiSource === "client" ? (
        <div className="col-span-12 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          KPI totals on this page use <strong>browser-side</strong> Supabase data. For the same numbers as{" "}
          <strong>Student management</strong>, run the Node API (<code className="rounded bg-white/80 px-1">npm run backend:start</code> on
          port 7001) and ensure <code className="rounded bg-white/80 px-1">VITE_MANUAL_API_URL</code> points at it.
        </div>
      ) : null}

      {/* Stat cards */}
      <div className="col-span-12 grid gap-4 md:grid-cols-4">
        <div className="col-span-12 md:col-span-4">
          <FadeSwitch
            loading={loading}
            skeleton={
              <div className="grid gap-4 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <ShellCard key={`stat-skeleton-${idx}`}>
                    <div className="space-y-3">
                      <div className="h-4 w-1/3 animate-pulse rounded bg-slate-200" />
                      <div className="h-8 w-2/3 animate-pulse rounded bg-slate-200" />
                      <div className="faculty-shimmer h-16 w-full animate-pulse rounded bg-slate-100" />
                    </div>
                  </ShellCard>
                ))}
              </div>
            }
          >
            <div className="grid gap-4 md:grid-cols-4">
              {stats.map((stat, idx) => {
                const Icon = icons[idx % icons.length];
                return (
                  <StatCard
                    key={stat.label}
                    label={stat.label}
                    value={stat.value}
                    delta={stat.delta}
                    trend={stat.sparkline}
                    icon={<Icon className="h-4 w-4" />}
                    color={stat.color}
                  />
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs text-slate-600">
              <span>
                Overview shows KPI cards only. Total students: <strong>{totalStudents}</strong>.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void fetchOverview()}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 transition hover:bg-slate-100"
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/admin/students")}
                  className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-700 transition hover:bg-blue-100"
                >
                  View all students
                </button>
              </div>
            </div>
          </FadeSwitch>
        </div>
      </div>

      {/* Chart + Activity Feed */}
      <div className="col-span-12 grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 flex flex-col gap-4">
          <ChartCard
            title="Submission Activity"
            type="area"
            data={trend}
            colors={["#6366f1"]}
            dataKey="submissions"
            emptyTitle="No submissions yet"
            emptyDescription="Submission trend will appear after students start submitting labs."
            loading={loading}
          />
          <FadeSwitch
            loading={loading}
            skeleton={
              <div className="grid gap-4 md:grid-cols-2">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <ShellCard key={`insight-skeleton-${idx}`}>
                    <div className="space-y-3">
                      <div className="h-4 w-2/5 animate-pulse rounded bg-slate-200" />
                      <div className="h-5 w-4/5 animate-pulse rounded bg-slate-200" />
                    </div>
                  </ShellCard>
                ))}
              </div>
            }
          >
            <div className="grid gap-4 md:grid-cols-2">
              {insights.map((item) => (
                <InsightCard
                  key={item.title}
                  headline={item.title}
                  metric={`${item.metric} · ${item.hint}`}
                  type={item.tone}
                  icon={<Activity className="h-4 w-4" />}
                />
              ))}
            </div>
          </FadeSwitch>
        </div>
        <div className="xl:col-span-1">
          <FadeSwitch
            loading={loading}
            skeleton={
              <ShellCard title="Activity Feed">
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <div key={`activity-skeleton-${idx}`} className="faculty-shimmer h-12 animate-pulse rounded-xl border border-slate-200 bg-white" />
                  ))}
                </div>
              </ShellCard>
            }
          >
            <ActivityFeed events={activity} />
          </FadeSwitch>
        </div>
      </div>

      <div className="col-span-12">
        <ShellCard title="Student Performance (full_student_data)">
          {studentPerformance.length === 0 ? (
            <EmptyState
              title="No records found"
              description="No student performance rows available in full_student_data."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-slate-600">Student</th>
                    <th className="px-4 py-2.5 text-left text-slate-600">Total Experiments</th>
                    <th className="px-4 py-2.5 text-left text-slate-600">Completed</th>
                    <th className="px-4 py-2.5 text-left text-slate-600">Total Marks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {studentPerformance.map((row) => (
                    <tr key={row.student_id} className="bg-white">
                      <td className="px-4 py-2.5 text-slate-800">{row.full_name}</td>
                      <td className="px-4 py-2.5 text-slate-600">{row.total_experiments}</td>
                      <td className="px-4 py-2.5 text-slate-600">{row.completed}</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-800">{row.total_marks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ShellCard>
      </div>
    </AdminShell>
  );
}
