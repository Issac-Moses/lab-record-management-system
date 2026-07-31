import { motion } from "framer-motion";

export default function ShellCard({ title, actions, children, glow = "blue", className = "" }) {
  const glowClass = {
    blue: "ring-blue-200",
    violet: "ring-indigo-200",
    emerald: "ring-emerald-200",
    cyan: "ring-sky-200",
  }[glow] || "ring-blue-200";

  return (
    <motion.section
      whileHover={{ y: -3 }}
      className={`faculty-surface rounded-2xl p-4 ring-1 ${glowClass} ${className}`}
    >
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title ? <h3 className="text-sm font-semibold text-slate-800">{title}</h3> : <span />}
          {actions}
        </div>
      )}
      {children}
    </motion.section>
  );
}

