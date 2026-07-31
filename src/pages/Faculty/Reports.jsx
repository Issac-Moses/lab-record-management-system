import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import { FileDown } from "lucide-react";
import { getFacultyAnalytics, getFacultyReportRows } from "@/services/facultyDataService";
import { exportFacultySuperDashboardToExcel } from "@/services/exportService";
import { getFacultyAnalyticsFallback } from "@/services/facultyAnalyticsFallback";

const pieColors = ["#94A3B8", "#2563EB", "#059669", "#F59E0B"];
const chartTooltipStyle = {
  backgroundColor: "#FFFFFF",
  border: "1px solid #E2E8F0",
  borderRadius: "12px",
  color: "#0F172A",
  boxShadow: "0 10px 24px rgba(15, 23, 42, 0.08)",
};
const chartCardClass =
  "group min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-transform duration-150 hover:-translate-y-[3px]";

function compactAxisLabel(value, max = 12) {
  const text = String(value ?? "");
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(max - 1, 1))}…`;
}

function formatEvaluationValue(value) {
  const safe = Number(value);
  if (!Number.isFinite(safe) || safe <= 0) return "Not Evaluated";
  return Number(safe.toFixed(2));
}

export default function FacultyReports() {
  const subjectId = localStorage.getItem("faculty_subject_id");
  const subjectName = localStorage.getItem("faculty_subject_name") || "Neural Networks and Deep Learning Lab";
  const [rows, setRows] = useState([]);
  const [analytics, setAnalytics] = useState({
    marksDistribution: [],
    passFail: [],
    completionRate: [],
  });
  const [loading, setLoading] = useState(true);
  const [activePassFailIndex, setActivePassFailIndex] = useState(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      try {
        const [reportData, analyticsData] = await Promise.all([
          getFacultyReportRows(subjectId),
          getFacultyAnalytics(subjectId),
        ]);
        if (alive) {
          setRows(Array.isArray(reportData) ? reportData : []);
          setAnalytics(analyticsData || { marksDistribution: [], passFail: [], completionRate: [] });
        }
      } catch (err) {
        console.error("Failed to load reports:", err);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [subjectId]);

  const safeRows = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);
  const fallbackAnalytics = useMemo(() => getFacultyAnalyticsFallback(subjectName), [subjectName]);
  const effectiveRows = useMemo(
    () => safeRows,
    [safeRows]
  );
  const fallbackMarksDistribution = useMemo(() => {
    const bucket = { "0-25%": 0, "26-50%": 0, "51-75%": 0, "76-100%": 0 };
    fallbackAnalytics.leaderboard.forEach((row) => {
      const progress = Number(row.progressPercentage || 0);
      if (progress <= 25) bucket["0-25%"] += 1;
      else if (progress <= 50) bucket["26-50%"] += 1;
      else if (progress <= 75) bucket["51-75%"] += 1;
      else bucket["76-100%"] += 1;
    });
    return Object.entries(bucket).map(([grade, count]) => ({ grade, count }));
  }, [fallbackAnalytics.leaderboard]);
  const fallbackPassFail = useMemo(
    () => fallbackAnalytics.submissionStatus.map((row) => ({ name: row.name, value: Number(row.value || 0) })),
    [fallbackAnalytics.submissionStatus]
  );
  const fallbackCompletionRate = useMemo(
    () => fallbackAnalytics.leaderboard.map((row) => ({ student: row.studentName, completionRate: Number(row.progressPercentage || 0) })),
    [fallbackAnalytics.leaderboard]
  );
  const effectiveMarksDistribution =
    Array.isArray(analytics.marksDistribution) && analytics.marksDistribution.length > 0
      ? analytics.marksDistribution
      : fallbackMarksDistribution;
  const effectivePassFail =
    Array.isArray(analytics.passFail) && analytics.passFail.length > 0
      ? analytics.passFail
      : fallbackPassFail;
  const effectiveCompletionRate =
    Array.isArray(analytics.completionRate) && analytics.completionRate.length > 0
      ? analytics.completionRate
      : fallbackCompletionRate;
  const leaderboardChartData = useMemo(
    () =>
      effectiveRows
        .map((row) => ({
          student:
            String(row.studentName || "Unknown")
              .trim()
              .split(" ")
              .slice(0, 2)
              .join(" ") || "Unknown",
          registerNumber: row.registerNumber || "-",
          rank: Number(row.leaderboardRank || 0) || 0,
          progress: Number(row.progressPercentage || 0) || 0,
          totalMarks:
            row.totalMarks == null || row.totalMarks === "-"
              ? 0
              : Number(row.totalMarks) || 0,
        }))
        .sort((a, b) => (a.rank || Number.MAX_SAFE_INTEGER) - (b.rank || Number.MAX_SAFE_INTEGER))
        .slice(0, 10),
    [effectiveRows]
  );
  const passFailTotal = useMemo(
    () => (Array.isArray(effectivePassFail) ? effectivePassFail.reduce((sum, row) => sum + Number(row?.value || 0), 0) : 0),
    [effectivePassFail]
  );

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="faculty-shimmer mb-4 h-6 w-44 rounded bg-slate-200" />
        <div className="space-y-3">
          <div className="faculty-shimmer h-10 rounded-lg bg-slate-100" />
          <div className="faculty-shimmer h-10 rounded-lg bg-slate-100" />
          <div className="faculty-shimmer h-10 rounded-lg bg-slate-100" />
        </div>
      </div>
    );
  }

  return (
    <div className="text-slate-800">
      <div className="faculty-glass faculty-gradient-ring mb-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl p-6">
        <div>
          <h1 className="bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-3xl font-bold text-transparent">
            Faculty Reports
          </h1>
          <p className="text-sm text-slate-600">Subject-level analytics, completion split, and leaderboard intelligence.</p>
        </div>
        <button
          onClick={() => exportFacultySuperDashboardToExcel(effectiveRows, "lab_report")}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-white shadow-sm transition duration-150 hover:-translate-y-0.5 hover:from-blue-500 hover:to-indigo-500"
        >
          <FileDown className="w-4 h-4" />
          Export Excel
        </button>
      </div>
      <>
        <div className="faculty-surface mb-8 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-3">Register Number</th>
                  <th className="text-left px-4 py-3">Student Name</th>
                  <th className="text-left px-4 py-3">Department</th>
                  <th className="text-left px-4 py-3">Subject</th>
                  <th className="text-left px-4 py-3">Completed / Total</th>
                  <th className="text-left px-4 py-3">Progress %</th>
                  <th className="text-left px-4 py-3">Total Marks</th>
                  <th className="text-left px-4 py-3">Avg AI Score</th>
                  <th className="text-left px-4 py-3">Rank</th>
                </tr>
              </thead>
              <tbody>
                {effectiveRows.map((row, idx) => (
                  <tr key={`${row.registerNumber}-${idx}`} className="border-t border-slate-100 transition-colors odd:bg-white even:bg-slate-50/50 hover:bg-blue-50/60">
                    <td className="px-4 py-3">{row.registerNumber || "-"}</td>
                    <td className="px-4 py-3">{row.studentName || "-"}</td>
                    <td className="px-4 py-3">{row.department || "-"}</td>
                    <td className="px-4 py-3">{row.subject || "-"}</td>
                    <td className="px-4 py-3">
                      {row.completedExperiments ?? 0} / {row.totalExperiments ?? 0}
                    </td>
                    <td className="px-4 py-3">{row.progressPercentage ?? 0}</td>
                    <td className="px-4 py-3">{formatEvaluationValue(row.totalMarks)}</td>
                    <td className="px-4 py-3">{formatEvaluationValue(row.avgAiScore)}</td>
                    <td className="px-4 py-3">{row.leaderboardRank ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>

        <div className="grid grid-cols-1 gap-6 min-w-0 xl:grid-cols-2">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className={chartCardClass}>
              <h2 className="mb-1 text-base font-semibold text-slate-900">Progress Distribution</h2>
              <p className="mb-3 text-xs text-slate-500">Student count across progress ranges</p>
              <div className="h-64 min-h-[220px] min-w-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={260} minHeight={220}>
                    <BarChart data={effectiveMarksDistribution}>
                      <defs>
                        <linearGradient id="marksGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2563EB" stopOpacity={0.92} />
                          <stop offset="100%" stopColor="#4F46E5" stopOpacity={0.62} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="4 6" stroke="#E2E8F0" vertical={false} />
                      <XAxis
                        dataKey="grade"
                        stroke="#64748B"
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                        tickMargin={8}
                        tickFormatter={(value) => compactAxisLabel(value, 10)}
                      />
                      <YAxis stroke="#64748B" tickLine={false} axisLine={false} fontSize={11} width={34} />
                      <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: "rgba(37, 99, 235, 0.08)" }} />
                      <Bar
                        dataKey="count"
                        fill="url(#marksGradient)"
                        radius={[10, 10, 0, 0]}
                        isAnimationActive
                        animationDuration={520}
                        animationEasing="ease-out"
                      />
                    </BarChart>
                  </ResponsiveContainer>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, delay: 0.03 }} className={chartCardClass}>
              <h2 className="mb-1 text-base font-semibold text-slate-900">Completion Status Split</h2>
              <p className="mb-3 text-xs text-slate-500">Completed students vs defaulters</p>
              <div className="relative h-64 min-h-[220px] min-w-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={260} minHeight={220}>
                    <PieChart>
                      <Pie
                        data={effectivePassFail}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={56}
                        outerRadius={96}
                        paddingAngle={3}
                        labelLine={false}
                        onMouseEnter={(_, idx) => setActivePassFailIndex(idx)}
                        onMouseLeave={() => setActivePassFailIndex(null)}
                        isAnimationActive
                        animationDuration={520}
                        animationEasing="ease-out"
                      >
                        {effectivePassFail.map((entry, idx) => (
                          <Cell
                            key={entry.name}
                            fill={pieColors[idx % pieColors.length]}
                            stroke={activePassFailIndex === idx ? "#0F172A" : "#FFFFFF"}
                            strokeWidth={activePassFailIndex === idx ? 2 : 1}
                            opacity={activePassFailIndex === null || activePassFailIndex === idx ? 1 : 0.75}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={chartTooltipStyle}
                        formatter={(value, name) => {
                          const safe = Number(value || 0);
                          const percent = passFailTotal > 0 ? (safe / passFailTotal) * 100 : 0;
                          return [`${safe} (${percent.toFixed(0)}%)`, name];
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                {passFailTotal > 0 ? (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="rounded-full bg-white/95 px-4 py-2 text-center shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total</p>
                      <p className="text-lg font-bold text-slate-900">{passFailTotal}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, delay: 0.05 }} className={chartCardClass}>
              <h2 className="mb-1 text-base font-semibold text-slate-900">Top Progress Ranking</h2>
              <p className="mb-3 text-xs text-slate-500">Students ordered by progress percentage</p>
              <div className="h-64 min-h-[220px] min-w-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={260} minHeight={220}>
                    <LineChart data={effectiveCompletionRate}>
                      <CartesianGrid strokeDasharray="4 6" stroke="#E2E8F0" vertical={false} />
                      <XAxis dataKey="student" stroke="#64748B" hide />
                      <YAxis stroke="#64748B" tickLine={false} axisLine={false} domain={[0, 100]} fontSize={11} width={34} />
                      <Tooltip contentStyle={chartTooltipStyle} />
                      <Line
                        type="monotone"
                        dataKey="completionRate"
                        stroke="#4F46E5"
                        strokeWidth={3}
                        dot={{ r: 4, fill: "#4F46E5", stroke: "#C7D2FE", strokeWidth: 2 }}
                        activeDot={{ r: 6, fill: "#4F46E5", stroke: "#DBEAFE", strokeWidth: 2 }}
                        isAnimationActive
                        animationDuration={560}
                        animationEasing="ease-out"
                      />
                    </LineChart>
                  </ResponsiveContainer>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, delay: 0.08 }} className={chartCardClass}>
              <h2 className="mb-1 text-base font-semibold text-slate-900">Leaderboard Chart</h2>
              <p className="mb-3 text-xs text-slate-500">Top 10 students by rank with progress and marks</p>
              <div className="h-72 min-h-[240px] min-w-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={260} minHeight={240}>
                    <BarChart data={leaderboardChartData}>
                      <defs>
                        <linearGradient id="leaderboardProgressBar" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.92} />
                          <stop offset="100%" stopColor="#2563EB" stopOpacity={0.62} />
                        </linearGradient>
                        <linearGradient id="leaderboardMarksBar" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#059669" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="#34D399" stopOpacity={0.55} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="4 6" stroke="#E2E8F0" vertical={false} />
                      <XAxis dataKey="student" stroke="#64748B" hide />
                      <YAxis stroke="#64748B" tickLine={false} axisLine={false} fontSize={11} width={34} />
                      <Tooltip
                        contentStyle={chartTooltipStyle}
                        formatter={(value, name) => {
                          if (name === "progress") return [`${value}%`, "Progress"];
                          if (name === "totalMarks") return [value, "Total Marks"];
                          return [value, name];
                        }}
                        labelFormatter={(_, payload) => {
                          const row = payload?.[0]?.payload;
                          if (!row) return "";
                          return `#${row.rank || "-"} ${row.student} (${row.registerNumber})`;
                        }}
                      />
                      <Bar
                        dataKey="progress"
                        fill="url(#leaderboardProgressBar)"
                        radius={[10, 10, 0, 0]}
                        isAnimationActive
                        animationDuration={520}
                        animationEasing="ease-out"
                      />
                      <Bar
                        dataKey="totalMarks"
                        fill="url(#leaderboardMarksBar)"
                        radius={[10, 10, 0, 0]}
                        isAnimationActive
                        animationDuration={520}
                        animationEasing="ease-out"
                      />
                    </BarChart>
                  </ResponsiveContainer>
              </div>
            </motion.div>
        </div>
      </>
    </div>
  );
}
