import { memo } from "react";
import { motion, useReducedMotion } from "framer-motion";

interface ProgressRingProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
}

function ProgressRingInner({ progress, size = 96, strokeWidth = 7 }: ProgressRingProps) {
  const reducedMotion = useReducedMotion();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;
  const center = size / 2;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-slate-200"
        />
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="url(#progress-gradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 60, damping: 15 }}
        />
        <defs>
          <linearGradient id="progress-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="rounded-full bg-white/90 px-1.5 py-0.5 text-center shadow-sm ring-1 ring-slate-200">
          <span className="block text-lg font-bold leading-none text-slate-900">{progress}%</span>
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-600">done</span>
        </div>
      </div>
    </div>
  );
}

const ProgressRing = memo(ProgressRingInner);
export default ProgressRing;
