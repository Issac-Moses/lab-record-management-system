import { useMemo } from "react";
import { motion } from "framer-motion";
import { Activity, Calendar } from "lucide-react";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfMonday(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getIntensityClass(count) {
  if (count === 0) return "bg-slate-100/80 hover:bg-slate-200";
  if (count === 1) return "bg-indigo-300 hover:bg-indigo-400";
  if (count === 2) return "bg-indigo-500 hover:bg-indigo-600 shadow-xs";
  return "bg-emerald-500 hover:bg-emerald-600 shadow-xs ring-1 ring-emerald-300";
}

export default function ContributionHeatmap({ submissions = [], weeks = 12 }) {
  const { weekColumns, monthLabels, total } = useMemo(() => {
    const counts = {};
    submissions.forEach((s) => {
      const raw = s.updated_at || s.created_at;
      if (!raw) return;
      const d = new Date(raw);
      const key = getDateKey(d);
      counts[key] = (counts[key] || 0) + 1;
    });

    const safeWeeks = Math.max(4, Number(weeks) || 12);
    const now = new Date();
    const thisMonday = startOfMonday(now);
    const firstMonday = new Date(thisMonday);
    firstMonday.setDate(firstMonday.getDate() - (safeWeeks - 1) * 7);

    const cols = [];
    for (let col = 0; col < safeWeeks; col += 1) {
      const days = [];
      for (let row = 0; row < 7; row += 1) {
        const date = new Date(firstMonday);
        date.setDate(firstMonday.getDate() + col * 7 + row);
        const key = getDateKey(date);
        days.push({ key, date, count: counts[key] || 0 });
      }
      cols.push(days);
    }

    const labels = [];
    let prevMonth = -1;
    cols.forEach((colDays, colIdx) => {
      const month = colDays[0].date.getMonth();
      if (colIdx === 0 || month !== prevMonth) {
        labels.push({
          col: colIdx,
          label: colDays[0].date.toLocaleString("default", { month: "short" }),
        });
      }
      prevMonth = month;
    });

    const submissionTotal = Object.values(counts).reduce((sum, value) => sum + value, 0);
    return { weekColumns: cols, monthLabels: labels, total: submissionTotal };
  }, [submissions, weeks]);

  return (
    <motion.div
      className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-sm text-white">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-base">Submission Activity</h3>
            <p className="text-xs text-slate-500">Daily lab practical & quest completion tracker</p>
          </div>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
          <Calendar className="h-3.5 w-3.5" />
          {total} Submissions
        </div>
      </div>

      {/* Heatmap Grid Wrapper */}
      <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-slate-50/50 p-4">
        <div className="min-w-[700px]">
          {/* Month labels */}
          <div
            className="mb-2 grid items-center gap-1.5"
            style={{ gridTemplateColumns: `36px repeat(${weekColumns.length}, minmax(0, 1fr))` }}
          >
            <div />
            {Array.from({ length: weekColumns.length }).map((_, colIdx) => {
              const month = monthLabels.find((item) => item.col === colIdx);
              return (
                <div key={`month-${colIdx}`} className="h-4 text-[10px] font-semibold text-slate-500">
                  {month ? month.label : ""}
                </div>
              );
            })}
          </div>

          {/* Grid Rows */}
          <div className="space-y-1.5">
            {DAY_LABELS.map((label, rowIdx) => (
              <div
                key={label}
                className="grid items-center gap-1.5"
                style={{ gridTemplateColumns: `36px repeat(${weekColumns.length}, minmax(0, 1fr))` }}
              >
                <div className="text-[10px] font-semibold text-slate-400">
                  {rowIdx % 2 === 0 ? label : ""}
                </div>
                {weekColumns.map((colDays, colIdx) => {
                  const cell = colDays[rowIdx];
                  return (
                    <motion.div
                      key={`${colIdx}-${cell.key}`}
                      whileHover={{ scale: 1.25, zIndex: 10 }}
                      className={`h-3.5 w-3.5 rounded-xs transition-colors cursor-pointer ${getIntensityClass(
                        cell.count
                      )}`}
                      title={`${cell.date.toLocaleDateString()} — ${cell.count} submission${
                        cell.count !== 1 ? "s" : ""
                      }`}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          {/* Legend Footer */}
          <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500 font-medium">
            <span>Recent {weekColumns.length} weeks</span>
            <div className="flex items-center gap-1.5">
              <span>Less</span>
              <div className="h-3 w-3 rounded-xs bg-slate-100" />
              <div className="h-3 w-3 rounded-xs bg-indigo-300" />
              <div className="h-3 w-3 rounded-xs bg-indigo-500" />
              <div className="h-3 w-3 rounded-xs bg-emerald-500" />
              <span>More</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
