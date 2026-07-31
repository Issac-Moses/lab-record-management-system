import { useEffect, useMemo, useState } from "react";
import {
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FlaskConical,
  Gauge,
  TrendingUp,
} from "lucide-react";
import AdminShell from "@/layouts/AdminShell";
import ShellCard from "@/components/admin/ShellCard";
import ChartCard from "@/components/admin/ChartCard";
import EmptyState from "@/components/admin/EmptyState";
import FadeSwitch from "@/components/admin/FadeSwitch";
import { getExperimentAnalyticsData } from "@/services/adminDataService";

export default function Experiments() {
  const [analytics, setAnalytics] = useState({
    funnel: [],
    distribution: [],
    heatMap: [],
    difficulty: [],
    topGrades: [],
    isDemo: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getExperimentAnalyticsData().then((result) => {
      if (alive) {
        setAnalytics(result);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const hasFunnelData = analytics.funnel.some((item) => Number(item.count || 0) > 0);
  const totalPipeline = useMemo(
    () => analytics.funnel.reduce((sum, item) => sum + Number(item.count || 0), 0),
    [analytics.funnel]
  );
  const avgDifficulty = useMemo(() => {
    const rows = (analytics.difficulty || []).filter((row) => Number(row?.value ?? row?.avgGrade ?? 0) > 0);
    if (rows.length === 0) return 0;
    const total = rows.reduce((sum, row) => sum + Number(row?.value ?? row?.avgGrade ?? 0), 0);
    return Number((total / rows.length).toFixed(1));
  }, [analytics.difficulty]);
  const topMark = useMemo(
    () =>
      (analytics.topGrades || []).reduce(
        (max, row) => Math.max(max, Number(row?.marks || 0)),
        0
      ),
    [analytics.topGrades]
  );
  const gradedRows = useMemo(
    () => (analytics.distribution || []).reduce((sum, row) => sum + Number(row?.count || 0), 0),
    [analytics.distribution]
  );
  const quickStats = [
    {
      label: "Pipeline Volume",
      value: totalPipeline,
      hint: "Across assigned workflow stages",
      icon: <FlaskConical className="h-4 w-4 text-blue-700" />,
      tone: "from-blue-50 to-indigo-50 border-blue-200",
    },
    {
      label: "Graded Records",
      value: gradedRows,
      hint: "Used in distribution charts",
      icon: <ClipboardCheck className="h-4 w-4 text-emerald-700" />,
      tone: "from-emerald-50 to-teal-50 border-emerald-200",
    },
    {
      label: "Average Difficulty",
      value: avgDifficulty || "N/A",
      hint: "Computed from difficulty series",
      icon: <Gauge className="h-4 w-4 text-violet-700" />,
      tone: "from-violet-50 to-fuchsia-50 border-violet-200",
    },
    {
      label: "Top Grade",
      value: topMark || 0,
      hint: "Highest mark in current dataset",
      icon: <FileCheck2 className="h-4 w-4 text-amber-700" />,
      tone: "from-amber-50 to-orange-50 border-amber-200",
    },
  ];

  return (
    <AdminShell title="Experiments">
      <div className="col-span-12">
        <div className="faculty-glass faculty-gradient-ring rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold text-slate-900">Experiment Intelligence</h1>
              <p className="text-xs text-slate-500">
                Pipeline readiness, grading velocity, and difficulty analytics in one view.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              <TrendingUp className="h-3.5 w-3.5" />
              Live analytics
            </span>
          </div>
        </div>
      </div>

      <div className="col-span-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {quickStats.map((item) => (
          <section
            key={item.label}
            className={`chart-card rounded-2xl border bg-gradient-to-br p-4 ${item.tone}`}
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">{item.label}</p>
              <div className="rounded-lg border border-white/70 bg-white/80 p-2">{item.icon}</div>
            </div>
            <p className="text-2xl font-bold text-slate-900">{item.value}</p>
            <p className="mt-1 text-xs text-slate-500">{item.hint}</p>
          </section>
        ))}
      </div>

      <div className="col-span-12 grid gap-4 xl:grid-cols-4">
        <div className="col-span-12 xl:col-span-4">
          <FadeSwitch
            loading={loading}
            skeleton={
              <div className="grid gap-4 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <ShellCard key={`funnel-skeleton-${idx}`}>
                    <div className="space-y-3">
                      <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
                      <div className="h-8 w-2/3 animate-pulse rounded bg-slate-200" />
                      <div className="h-4 w-1/3 animate-pulse rounded bg-slate-200" />
                    </div>
                  </ShellCard>
                ))}
              </div>
            }
          >
            {hasFunnelData ? (
              <div className="grid gap-4 xl:grid-cols-4">
                {analytics.funnel.map((item) => {
                  const stage = String(item.stage || "").toLowerCase();
                  const icon =
                    stage.includes("review") ? (
                      <ClipboardCheck className="h-4 w-4 text-emerald-700" />
                    ) : stage.includes("grade") ? (
                      <FileCheck2 className="h-4 w-4 text-violet-700" />
                    ) : stage.includes("submit") ? (
                      <TrendingUp className="h-4 w-4 text-blue-700" />
                    ) : (
                      <Clock3 className="h-4 w-4 text-amber-700" />
                    );
                  return (
                    <section
                      key={item.stage}
                      className="chart-card rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {item.stage}
                        </p>
                        <div className="rounded-lg border border-slate-200 bg-white p-2">{icon}</div>
                      </div>
                      <p className="text-2xl font-semibold text-slate-900">{item.count}</p>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"
                          style={{ width: `${Math.min(100, Number(item.pct || 0))}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{item.pct}%</p>
                    </section>
                  );
                })}
              </div>
            ) : (
              <ShellCard title="Submission Pipeline">
                <EmptyState
                  title="No submissions yet"
                  description="Pipeline metrics will appear once experiments are assigned and submissions are created."
                />
              </ShellCard>
            )}
          </FadeSwitch>
        </div>
      </div>

      <div className="col-span-12 grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Grade Distribution"
          type="bar"
          data={analytics.distribution}
          dataKey="count"
          xKey="bucket"
          emptyTitle="No graded submissions"
          emptyDescription="Grade distribution appears after faculty evaluation."
          loading={loading}
        />
        <ChartCard
          title="Completion Heatmap Trend"
          type="area"
          data={analytics.heatMap}
          emptyTitle="No completion trend yet"
          emptyDescription="Trend appears after submissions are made over time."
          loading={loading}
        />
      </div>

      <div className="col-span-12">
        <ChartCard
          title="Difficulty Index"
          type="line"
          data={analytics.difficulty}
          xKey="experiment"
          emptyTitle="No experiment difficulty data"
          emptyDescription="Difficulty index will appear when graded submissions are available."
          loading={loading}
        />
      </div>

      <div className="col-span-12 grid gap-4 xl:grid-cols-3">
        <section className="chart-card rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4">
          <p className="text-[11px] uppercase tracking-wide text-blue-700">Difficulty Snapshot</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{avgDifficulty || 0}</p>
          <p className="mt-1 text-xs text-slate-500">Average difficulty score across active experiments.</p>
        </section>
        <section className="chart-card rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4">
          <p className="text-[11px] uppercase tracking-wide text-emerald-700">Evaluated Records</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{gradedRows}</p>
          <p className="mt-1 text-xs text-slate-500">Rows contributing to grade distribution and top marks.</p>
        </section>
        <section className="chart-card rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-4">
          <p className="text-[11px] uppercase tracking-wide text-violet-700">Difficulty Data Points</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{(analytics.difficulty || []).length}</p>
          <p className="mt-1 text-xs text-slate-500">Helpful when line chart appears sparse or empty.</p>
        </section>
      </div>

      <div className="col-span-12">
        <ShellCard title="Top Grades">
          {(analytics.topGrades || []).length === 0 ? (
            <EmptyState
              title="No grades available"
              description="Grades appear here after submissions are evaluated."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-slate-600">Student</th>
                    <th className="px-4 py-2.5 text-left text-slate-600">Experiment</th>
                    <th className="px-4 py-2.5 text-left text-slate-600">Marks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {(analytics.topGrades || []).map((row, index) => (
                    <tr key={`${row.student}-${row.experiment}-${index}`} className="bg-white/70 transition-colors hover:bg-blue-50/60">
                      <td className="px-4 py-2.5 text-slate-800">{row.student}</td>
                      <td className="px-4 py-2.5 text-slate-600">{row.experiment}</td>
                      <td className="px-4 py-2.5 font-semibold text-emerald-700">{row.marks}</td>
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

