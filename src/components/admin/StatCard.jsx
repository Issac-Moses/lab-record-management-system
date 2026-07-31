import { motion, animate, useMotionValue, useTransform } from "framer-motion";
import { useEffect } from "react";
import ShellCard from "@/components/admin/ShellCard";
import BadgePill from "@/components/admin/BadgePill";

export default function StatCard({ label, value, delta = 0, trend = [], icon, color = "blue" }) {
  const mv = useMotionValue(0);
  const display = useTransform(mv, (latest) => {
    if (Number(value) % 1 !== 0) return latest.toFixed(1);
    return Math.round(latest).toString();
  });

  useEffect(() => {
    const controls = animate(mv, Number(value || 0), { duration: 0.8, ease: "easeOut" });
    return () => controls.stop();
  }, [mv, value]);

  const sparkValues = trend.slice(-7).map((point) => Number(point || 0));
  const maxSpark = Math.max(1, ...sparkValues);
  const minSpark = Math.min(...sparkValues, 0);
  const sparkRange = Math.max(1, maxSpark - minSpark);

  return (
    <ShellCard glow={color} className="h-full">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        {icon ? <div className="text-slate-600">{icon}</div> : null}
      </div>
      <motion.p className="text-2xl font-semibold text-slate-900">{display}</motion.p>
      <div className="mt-3 flex items-center justify-between">
        {delta === 0 && sparkValues.length === 0 ? (
          <span className="text-[11px] text-slate-400">—</span>
        ) : (
          <BadgePill
            label={`${delta > 0 ? "+" : ""}${delta}%`}
            variant={delta >= 0 ? "active" : "error"}
          />
        )}
        <div className="flex items-end gap-1">
          {sparkValues.map((point, idx) => (
            <span
              key={`${point}-${idx}`}
              className="w-1.5 rounded bg-blue-400/70"
              style={{ height: `${8 + ((point - minSpark) / sparkRange) * 26}px` }}
            />
          ))}
        </div>
      </div>
    </ShellCard>
  );
}

