import { motion } from "framer-motion";

export default function XpBar({ value, max = 100, color = "blue", animated = true }) {
  const safeMax = Math.max(1, Number(max) || 1);
  const pct = Math.max(0, Math.min(100, (Number(value || 0) / safeMax) * 100));
  const gradient = {
    blue: "from-blue-500 to-cyan-400",
    violet: "from-violet-500 to-fuchsia-500",
    emerald: "from-emerald-500 to-teal-400",
  }[color] || "from-blue-500 to-cyan-400";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Progress</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <motion.div
          initial={animated ? { width: 0 } : false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className={`h-2 rounded-full bg-gradient-to-r ${gradient}`}
        />
      </div>
    </div>
  );
}

