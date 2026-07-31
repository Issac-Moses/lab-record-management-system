import { motion } from "framer-motion";
import { FlaskConical } from "lucide-react";

function toCount(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

const milestones = [25, 50, 75, 100];

export default function LabProgressBar({ labs_completed = 0, total_labs = 0 }) {
  const completed = toCount(labs_completed);
  const total = Math.max(0, toCount(total_labs));
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const clamped = Math.max(0, Math.min(100, percent));
  const remaining = Math.max(0, total - completed);
  const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <motion.div
      className="faculty-surface rounded-2xl p-5"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      whileHover={{ y: -3, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center">
            <FlaskConical className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-semibold text-slate-900">Lab Progress</h3>
        </div>
        <span className="text-2xl font-bold text-emerald-700">{clamped}%</span>
      </div>

      <div className="relative h-3 rounded-full bg-slate-100 overflow-hidden mb-2">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-500 to-blue-600"
          initial={{ width: 0 }}
          animate={{ width: `${clamped}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>

      <div className="relative h-4 mb-4">
        {milestones.map((ms) => {
          const reached = clamped >= ms;
          return (
            <div
              key={ms}
              className="absolute -translate-x-1/2 flex flex-col items-center"
              style={{ left: `${ms}%` }}
            >
              <div
                className={`w-2.5 h-2.5 rounded-full border-2 ${
                  reached
                    ? "bg-emerald-400 border-emerald-400"
                    : "bg-transparent border-slate-300"
                }`}
              />
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-200">
        {[
          { label: "Completed", value: completed, color: "text-emerald-400" },
          { label: "Remaining", value: remaining, color: "text-slate-700" },
          { label: "Rate", value: `${rate}%`, color: "text-blue-600" },
        ].map((stat) => (
          <div key={stat.label} className="text-center">
            <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">{stat.label}</p>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
