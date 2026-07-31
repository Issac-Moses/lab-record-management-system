import { memo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { SectionProgress } from "@/hooks/useExperimentProgress";

interface SectionProgressItemProps {
  section: SectionProgress;
  onClick: (key: string) => void;
}

function SectionProgressItemInner({ section, onClick }: SectionProgressItemProps) {
  const reducedMotion = useReducedMotion();
  const { key, label, state, detail } = section;

  return (
    <button
      type="button"
      onClick={() => onClick(key)}
      className={`
        group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all
        ${state === "active"
          ? "bg-indigo-500/[0.08] border border-indigo-500/25"
          : state === "completed"
            ? "border border-transparent hover:bg-white/[0.02]"
            : "border border-transparent hover:bg-white/[0.02]"
        }
      `}
      aria-label={`${label} — ${state}`}
    >
      {/* State indicator */}
      <div className="relative flex h-7 w-7 flex-shrink-0 items-center justify-center">
        {state === "completed" ? (
          <motion.div
            initial={reducedMotion ? false : { scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 20 }}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30"
          >
            <svg className="h-3.5 w-3.5 text-emerald-400" viewBox="0 0 16 16" fill="none">
              <motion.path
                d="M3 8.5L6.5 12L13 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={reducedMotion ? {} : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={reducedMotion ? { duration: 0 } : { duration: 0.25, delay: 0.05 }}
              />
            </svg>
          </motion.div>
        ) : state === "active" ? (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500/15 ring-1 ring-indigo-500/40">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-400" />
            </span>
          </div>
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.02]">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />
          </div>
        )}
      </div>

      {/* Label + detail */}
      <div className="min-w-0 flex-1">
        <p className={`text-[13px] font-medium leading-tight ${
          state === "completed"
            ? "text-emerald-300/90"
            : state === "active"
              ? "text-indigo-200"
              : "text-slate-500"
        }`}>
          {label}
        </p>
        <p className={`text-[11px] leading-tight mt-0.5 ${
          state === "completed" ? "text-emerald-400/50" : state === "active" ? "text-indigo-400/50" : "text-slate-600"
        }`}>
          {detail}
        </p>
      </div>
    </button>
  );
}

const SectionProgressItem = memo(SectionProgressItemInner);
export default SectionProgressItem;
