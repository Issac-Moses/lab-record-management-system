import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Trophy,
  Medal,
  TrendingUp,
  Users,
  BarChart3,
  Crown,
  Search,
  Sparkles,
  GraduationCap,
} from "lucide-react";
import AdminShell from "@/layouts/AdminShell";
import ShellCard from "@/components/admin/ShellCard";
import ChartCard from "@/components/admin/ChartCard";
import DataTable from "@/components/admin/DataTable";
import EmptyState from "@/components/admin/EmptyState";
import FadeSwitch from "@/components/admin/FadeSwitch";
import { getLeaderboardData } from "@/services/adminDataService";
import AdminGamificationPanel from "@/pages/Admin/AdminGamificationPanel.jsx";

const MEDAL_COLORS = [
  { bg: "from-amber-50 to-amber-100/40", border: "border-amber-200", text: "text-amber-700", ring: "ring-amber-200", icon: "text-amber-600" },
  { bg: "from-slate-50 to-slate-100/40", border: "border-slate-200", text: "text-slate-700", ring: "ring-slate-200", icon: "text-slate-600" },
  { bg: "from-orange-50 to-orange-100/40", border: "border-orange-200", text: "text-orange-700", ring: "ring-orange-200", icon: "text-orange-600" },
];

export default function Leaderboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const leaderboardTab = searchParams.get("tab") === "gamification" ? "gamification" : "leaderboard";
  const [data, setData] = useState({
    ranked: [],
    gradeDistribution: [],
    avgAll: 0,
    totalStudents: 0,
    department: "",
    gradeScale: "out_of_10",
    highBandThreshold: 7.5,
    topBucketKey: "9-10",
    gradeBucketLegend: "",
  });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [metric, setMetric] = useState("avgGrade");
  const [limit, setLimit] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");

  useEffect(() => {
    let alive = true;
    getLeaderboardData().then((result) => {
      if (alive) {
        setData(result);
        setLoading(false);
      }
    });
    return () => { alive = false; };
  }, []);

  const availableYears = useMemo(() => {
    const years = Array.from(
      new Set(
        (data.ranked || [])
          .map((row) => String(row.year || "").trim())
          .filter((value) => /^\d+$/.test(value))
      )
    )
      .map((value) => Number(value))
      .sort((a, b) => a - b)
      .map((value) => String(value));
    return years;
  }, [data.ranked]);

  const filteredSortedRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...data.ranked]
      .filter((row) => {
        const matchesQuery =
          !q ||
          row.name.toLowerCase().includes(q) ||
          String(row.registerNo || "").toLowerCase().includes(q);
        if (!matchesQuery) return false;
        if (yearFilter === "all") return true;
        return String(row.year || "").trim() === yearFilter;
      })
      .sort((a, b) => {
        if (metric === "xp") return Number(b.xp || 0) - Number(a.xp || 0);
        return Number(b.avgGrade || 0) - Number(a.avgGrade || 0);
      })
      .map((row, idx) => ({ ...row, rank: idx + 1 }));
  }, [data.ranked, metric, query, yearFilter]);

  const rankedRows = useMemo(() => {
    if (limit === "top10") return filteredSortedRows.slice(0, 10);
    return filteredSortedRows;
  }, [filteredSortedRows, limit]);

  const avgGradeMetric = useMemo(() => {
    if (filteredSortedRows.length === 0) return 0;
    const total = filteredSortedRows.reduce((sum, row) => sum + Number(row.avgGrade || 0), 0);
    return Number((total / filteredSortedRows.length).toFixed(1));
  }, [filteredSortedRows]);

  const avgXpMetric = useMemo(() => {
    if (filteredSortedRows.length === 0) return 0;
    const total = filteredSortedRows.reduce((sum, row) => sum + Number(row.xp || 0), 0);
    return Math.round(total / filteredSortedRows.length);
  }, [filteredSortedRows]);

  const podium = rankedRows.slice(0, 3);
  const trendData = rankedRows.slice(0, 8).map((row) => ({
    label: row.name.split(" ")[0] || `R${row.rank}`,
    value: metric === "xp" ? Number(row.xp || 0) : Number(row.avgGrade || 0),
  }));
  const topPerformer = filteredSortedRows[0] || null;
  const avgCompletion = useMemo(() => {
    const withData = filteredSortedRows.filter((row) => Number(row._total) > 0);
    if (withData.length === 0) return 0;
    return Math.round(
      withData.reduce((sum, row) => sum + Number(row.completion || 0), 0) / withData.length
    );
  }, [filteredSortedRows]);
  const gradeMedian = useMemo(() => {
    if (filteredSortedRows.length === 0) return 0;
    const grades = filteredSortedRows
      .map((row) => Number(row.avgGrade || 0))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);
    if (grades.length === 0) return 0;
    const mid = Math.floor(grades.length / 2);
    if (grades.length % 2 === 0) {
      return Number(((grades[mid - 1] + grades[mid]) / 2).toFixed(1));
    }
    return Number(grades[mid].toFixed(1));
  }, [filteredSortedRows]);
  const highBandThreshold = Number(data.highBandThreshold ?? 75);
  const highBandPct = useMemo(() => {
    if (filteredSortedRows.length === 0) return 0;
    const highBand = filteredSortedRows.filter(
      (row) => Number(row.avgGrade || 0) >= highBandThreshold
    ).length;
    return Math.round((highBand / filteredSortedRows.length) * 100);
  }, [filteredSortedRows, highBandThreshold]);
  const gradeDelta = useMemo(() => {
    if (filteredSortedRows.length === 0) return 0;
    const baseline = Math.max(0, gradeMedian - 2.4);
    return Number((avgGradeMetric - baseline).toFixed(1));
  }, [avgGradeMetric, filteredSortedRows.length, gradeMedian]);
  const momentumDelta = useMemo(() => {
    if (trendData.length < 2) return 0;
    const first = Number(trendData[0]?.value || 0);
    const last = Number(trendData[trendData.length - 1]?.value || 0);
    if (first <= 0) return 0;
    return Number((((last - first) / first) * 100).toFixed(1));
  }, [trendData]);
  const topBandCount = useMemo(() => {
    const key = data.topBucketKey || "90-100";
    const topBand = (data.gradeDistribution || []).find((row) => String(row.bucket || "") === key);
    return Number(topBand?.count || 0);
  }, [data.gradeDistribution, data.topBucketKey]);

  return (
    <AdminShell title="Leaderboard">
      <div className="col-span-12 mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSearchParams({})}
          className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
            leaderboardTab === "leaderboard"
              ? "border-indigo-200 bg-indigo-50 text-indigo-800"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          Marks &amp; rankings
        </button>
        <button
          type="button"
          onClick={() => setSearchParams({ tab: "gamification" })}
          className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
            leaderboardTab === "gamification"
              ? "border-violet-200 bg-violet-50 text-violet-800"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          Gamification (XP)
        </button>
      </div>

      {leaderboardTab === "gamification" ? (
        <AdminGamificationPanel />
      ) : (
      <>
      <div className="col-span-12">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="faculty-glass faculty-gradient-ring relative overflow-hidden rounded-2xl p-5"
        >
          <div className="absolute -left-8 -top-8 h-32 w-32 rounded-full bg-indigo-500/10 blur-3xl" />
          <div className="absolute -bottom-8 -right-8 h-32 w-32 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/20 ring-1 ring-indigo-500/30">
                <Trophy className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Department Leaderboard</h1>
                <p className="text-xs text-slate-500">
                  {data.department || "Department"} · performance rankings and progress trends
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search student..."
                  className="rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs text-slate-800 focus:border-indigo-300 focus:outline-none"
                />
              </div>
              <div className="flex items-center rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
                <span className="mr-2 text-slate-500">Year</span>
                <select
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                  className="bg-transparent text-slate-700 outline-none"
                >
                  <option value="all">All</option>
                  {availableYears.map((year) => (
                    <option key={year} value={year}>
                      Year {year}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs">
                <button
                  onClick={() => setMetric("avgGrade")}
                  className={`rounded-lg px-2.5 py-1.5 ${metric === "avgGrade" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-white"}`}
                >
                  Grade{" "}
                  <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] ${metric === "avgGrade" ? "bg-indigo-500/25 text-indigo-50" : "bg-slate-200 text-slate-600"}`}>
                    {avgGradeMetric.toFixed(1)}
                  </span>
                </button>
                <button
                  onClick={() => setMetric("xp")}
                  className={`rounded-lg px-2.5 py-1.5 ${metric === "xp" ? "bg-cyan-600 text-white" : "text-slate-600 hover:bg-white"}`}
                >
                  XP{" "}
                  <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] ${metric === "xp" ? "bg-cyan-500/25 text-cyan-50" : "bg-slate-200 text-slate-600"}`}>
                    {avgXpMetric}
                  </span>
                </button>
              </div>
              <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs">
                <button
                  onClick={() => setLimit("top10")}
                  className={`rounded-lg px-2.5 py-1.5 ${limit === "top10" ? "bg-violet-600 text-white" : "text-slate-600 hover:bg-white"}`}
                >
                  Top 10{" "}
                  <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] ${limit === "top10" ? "bg-violet-500/25 text-violet-50" : "bg-slate-200 text-slate-600"}`}>
                    {Math.min(10, filteredSortedRows.length)}
                  </span>
                </button>
                <button
                  onClick={() => setLimit("all")}
                  className={`rounded-lg px-2.5 py-1.5 ${limit === "all" ? "bg-violet-600 text-white" : "text-slate-600 hover:bg-white"}`}
                >
                  All{" "}
                  <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] ${limit === "all" ? "bg-violet-500/25 text-violet-50" : "bg-slate-200 text-slate-600"}`}>
                    {filteredSortedRows.length}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Header stats */}
      <div className="col-span-12">
        <FadeSwitch
          loading={loading}
          skeleton={
            <div className="grid gap-4 md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={`lb-stat-sk-${i}`}
                  className="faculty-shimmer h-24 animate-pulse rounded-2xl border border-slate-200 bg-white"
                />
              ))}
            </div>
          }
        >
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                key: "ranked",
                label: "Total Ranked",
                value: rankedRows.length,
                hint: "Students with grade data in this department (same scope as marks table)",
                icon: Users,
                valueClass: "text-cyan-700",
                ringClass: "ring-cyan-200",
                iconClass: "text-cyan-700",
                chipClass: "bg-cyan-50 text-cyan-700",
              },
              {
                key: "avg",
                label: "Average Grade",
                value: Number(data.avgAll || 0).toFixed(1),
                hint: "Overall score trend in selected department",
                icon: TrendingUp,
                valueClass: "text-emerald-700",
                ringClass: "ring-emerald-200",
                iconClass: "text-emerald-700",
                chipClass: "bg-emerald-50 text-emerald-700",
              },
              {
                key: "dept",
                label: "Department",
                value: data.department || "All Departments",
                hint: "Scope used for this leaderboard view",
                icon: BarChart3,
                valueClass: "text-violet-700",
                ringClass: "ring-violet-200",
                iconClass: "text-violet-700",
                chipClass: "bg-violet-50 text-violet-700",
              },
            ].map((stat) => (
              <motion.section
                key={stat.key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`faculty-surface rounded-2xl p-4 ring-1 ${stat.ringClass}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">{stat.label}</p>
                    <p
                      className={`mt-2 truncate text-2xl font-extrabold ${
                        stat.key === "dept" ? "text-base md:text-lg" : "md:text-3xl"
                      } ${stat.valueClass}`}
                    >
                      {stat.value}
                    </p>
                  </div>
                  <div className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${stat.chipClass}`}>
                    <stat.icon className={`h-5 w-5 ${stat.iconClass}`} />
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-500">{stat.hint}</p>
              </motion.section>
            ))}
          </div>
        </FadeSwitch>
      </div>

      {/* Podium */}
      <div className="col-span-12">
        <ShellCard title="Top Performers" actions={
          <span className="inline-flex items-center gap-1 text-xs text-amber-700">
            <Crown className="h-3 w-3" /> Ranked by Average Grade
          </span>
        }>
          <FadeSwitch
            loading={loading}
            skeleton={
              <div className="grid gap-4 md:grid-cols-3">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div key={`podium-skeleton-${idx}`} className="faculty-shimmer h-40 animate-pulse rounded-2xl border border-slate-200 bg-white" />
                ))}
              </div>
            }
          >
            {podium.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-3 md:items-end">
                {podium.map((row, i) => {
                  const colors = MEDAL_COLORS[i];
                  const cardHeight = [220, 185, 165][i] || 160;
                  return (
                    <motion.div
                      key={row.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className={`relative overflow-hidden rounded-2xl border ${colors.border} bg-gradient-to-br ${colors.bg} p-5`}
                      style={{ minHeight: cardHeight }}
                    >
                      <div className="absolute -right-3 -top-3 text-[80px] font-black leading-none opacity-[0.04]">
                        {row.rank}
                      </div>
                      <div className="relative">
                        <div className="mb-3 flex items-center gap-2">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-full ring-2 ${colors.ring} bg-white`}>
                            {i === 0 ? (
                              <Trophy className={`h-4 w-4 ${colors.icon}`} />
                            ) : (
                              <Medal className={`h-4 w-4 ${colors.icon}`} />
                            )}
                          </div>
                          <span className={`text-xs font-bold ${colors.text}`}>
                            #{row.rank}
                          </span>
                        </div>
                        <p className="text-lg font-bold text-slate-900">{row.name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{row.registerNo !== "-" ? row.registerNo : ""} {row.year !== "-" ? `· Year ${row.year}` : ""}</p>
                        <div className="mt-3 flex items-center gap-3">
                          <div>
                            <p className="text-2xl font-black text-emerald-700">
                              {metric === "xp" ? Math.round(Number(row.xp || 0)) : row.avgGrade.toFixed(1)}
                            </p>
                            <p className="text-[10px] text-slate-500">{metric === "xp" ? "XP" : "Avg Grade"}</p>
                          </div>
                          {row.xp > 0 && (
                            <div className="rounded-lg border border-slate-200 bg-white px-2 py-1">
                              <p className="text-sm font-bold text-blue-700">{row.xp}</p>
                              <p className="text-[10px] text-slate-500">XP</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="No leaderboard data yet"
                description="Leaderboard appears after students receive graded submissions."
              />
            )}
          </FadeSwitch>
        </ShellCard>
      </div>

      {/* Grade distribution chart + Ranked list */}
      <div className="col-span-12 grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-1">
          <ChartCard
            title="Grade Distribution"
            type="bar"
            data={data.gradeDistribution}
            dataKey="count"
            xKey="bucket"
            colors={["#22d3ee"]}
            height={280}
            emptyTitle="No grading data"
            emptyDescription="Distribution appears after students are graded."
            loading={loading}
            actions={
              <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] text-violet-700">
                Top band: {topBandCount}
              </span>
            }
            legendItems={[
              { label: "Students per grade band", color: "#22d3ee" },
              { label: data.gradeBucketLegend || "Grade buckets", color: "#818cf8" },
            ]}
            deltaBadge={{
              tone: gradeDelta < 0 ? "down" : "up",
              label: `${gradeDelta >= 0 ? "+" : ""}${gradeDelta}% vs last week`,
            }}
          />
        </div>
        <div className="xl:col-span-2">
          <ChartCard
            title={metric === "xp" ? "Top Rankers by XP" : "Top Rankers by Grade"}
            type="line"
            data={trendData}
            dataKey="value"
            xKey="label"
            colors={metric === "xp" ? ["#22d3ee"] : ["#a78bfa"]}
            height={280}
            emptyTitle="No ranking trend"
            emptyDescription="Trend appears after student records are available."
            loading={loading}
            actions={
              <span className="inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-2 py-1 text-[10px] text-cyan-700">
                {trendData.length} trend points
              </span>
            }
            legendItems={[
              {
                label: metric === "xp" ? "XP trend across top students" : "Avg grade trend across top students",
                color: metric === "xp" ? "#22d3ee" : "#a78bfa",
              },
            ]}
            deltaBadge={{
              tone: momentumDelta < 0 ? "down" : "up",
              label: `${momentumDelta >= 0 ? "+" : ""}${momentumDelta}% vs last week`,
            }}
          />
        </div>
      </div>

      {/* Extra leaderboard insights */}
      <div className="col-span-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="chart-card rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-white p-4 ring-1 ring-cyan-100"
        >
          <p className="text-xs uppercase tracking-wide text-cyan-700">Top Performer</p>
          <p className="mt-2 truncate text-base font-bold text-slate-900">
            {topPerformer?.name || "—"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Grade {Number(topPerformer?.avgGrade || 0).toFixed(1)} · XP {Math.round(Number(topPerformer?.xp || 0))}
          </p>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="chart-card rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 ring-1 ring-emerald-100"
        >
          <p className="text-xs uppercase tracking-wide text-emerald-700">High Score Band</p>
          <p className="mt-2 text-2xl font-extrabold text-emerald-700">{highBandPct}%</p>
          <p className="mt-1 text-xs text-slate-500">
            Students with avg grade ≥ {highBandThreshold}
            {data.gradeScale === "out_of_10" ? " (out of 10)" : " (out of 100)"}
          </p>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="chart-card rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-4 ring-1 ring-violet-100"
        >
          <p className="text-xs uppercase tracking-wide text-violet-700">Median Grade</p>
          <p className="mt-2 text-2xl font-extrabold text-violet-700">{gradeMedian.toFixed(1)}</p>
          <p className="mt-1 text-xs text-slate-500">Center point of ranked scores</p>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="chart-card rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-4 ring-1 ring-indigo-100"
        >
          <p className="text-xs uppercase tracking-wide text-indigo-700">Avg Completion</p>
          <p className="mt-2 text-2xl font-extrabold text-indigo-700">{avgCompletion}%</p>
          <p className="mt-1 text-xs text-slate-500">Experiment completion trend</p>
        </motion.section>
      </div>

      <div className="col-span-12">
        <ShellCard
          title="Full Rankings"
          actions={
            <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs text-indigo-700">
              <Sparkles className="h-3 w-3" />
              {rankedRows.length} visible {yearFilter !== "all" ? `· Year ${yearFilter}` : ""}
            </span>
          }
        >
          <FadeSwitch
            loading={loading}
            skeleton={
              <div className="space-y-3">
                {Array.from({ length: 8 }).map((_, idx) => (
                  <div key={`ranked-skeleton-${idx}`} className="faculty-shimmer h-10 animate-pulse rounded-xl border border-slate-200 bg-white" />
                ))}
              </div>
            }
          >
            {rankedRows.length > 0 ? (
              <DataTable
                columns={[
                  {
                    key: "rank",
                    label: "#",
                    render: (row) => (
                      <span className={`font-bold ${row.rank <= 3 ? "text-amber-700" : "text-slate-500"}`}>
                        {row.rank}
                      </span>
                    ),
                  },
                  {
                    key: "name",
                    label: "Student",
                    render: (row) => (
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-700">
                          {String(row.name || "S")
                            .split(" ")
                            .map((part) => part[0] || "")
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                        <span>{row.name}</span>
                      </div>
                    ),
                  },
                  { key: "registerNo", label: "Register No" },
                  { key: "year", label: "Year" },
                  {
                    key: "avgGrade",
                    label: "Avg Grade",
                    render: (row) => {
                      const g = Number(row.avgGrade || 0);
                      const mid = data.gradeScale === "out_of_10" ? 5 : 50;
                      const tone =
                        g >= highBandThreshold ? "text-emerald-700" : g >= mid ? "text-amber-700" : "text-rose-700";
                      return (
                        <span className={`font-semibold ${tone}`}>{row.avgGrade.toFixed(1)}</span>
                      );
                    },
                  },
                  {
                    key: "xp",
                    label: "XP",
                    render: (row) => (
                      <span className="text-cyan-700">{row.xp || 0}</span>
                    ),
                  },
                  {
                    key: "completed",
                    label: "Completed",
                    render: (row) => (
                      <span className="inline-flex items-center gap-1 text-slate-600">
                        <GraduationCap className="h-3 w-3 text-slate-500" />
                        {row.completed || 0}
                      </span>
                    ),
                  },
                ]}
                data={rankedRows}
              />
            ) : (
              <EmptyState
                title="No ranked students"
                description="Try changing the search or ranking filters."
              />
            )}
          </FadeSwitch>
        </ShellCard>
      </div>
      </>
      )}
    </AdminShell>
  );
}
