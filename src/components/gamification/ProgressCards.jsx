import { motion } from "framer-motion";
import { Award, Sparkles, Flame, FlaskConical } from "lucide-react";

function safeValue(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.2, ease: "easeOut" },
  }),
};

function XpRing({ xp }) {
  const xpInBand = xp % 200;
  const progress = xpInBand / 200;
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  return (
    <svg width="96" height="96" viewBox="0 0 96 96" className="shrink-0">
      <circle
        cx="48"
        cy="48"
        r={radius}
        fill="none"
        stroke="rgba(148,163,184,0.3)"
        strokeWidth="6"
      />
      <motion.circle
        cx="48"
        cy="48"
        r={radius}
        fill="none"
        strokeWidth="6"
        strokeLinecap="round"
        stroke="url(#ring-grad)"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
      />
      <defs>
        <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="100%" stopColor="#4F46E5" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function ProgressCards({ progress, totalLabs = 25 }) {
  const level = safeValue(progress?.level, 1);
  const xp = safeValue(progress?.xp_points);
  const streak = safeValue(progress?.current_streak);
  const labsCompleted = safeValue(progress?.labs_completed);
  const safeTotalLabs = Math.max(1, safeValue(totalLabs, 25));
  const labPercent = Math.min(100, Math.round((labsCompleted / safeTotalLabs) * 100));
  const xpInBand = xp % 200;

  const cards = [
    {
      key: "level",
      content: (
        <div className="flex items-center gap-4">
          <div className="relative">
            <XpRing xp={xp} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-extrabold text-slate-900">{level}</span>
              <span className="text-[10px] uppercase tracking-wider text-indigo-600">Level</span>
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <Award className="w-4 h-4 text-indigo-400" />
              <span className="text-xs uppercase tracking-wide text-slate-500">Level</span>
            </div>
            <p className="text-sm font-semibold text-slate-900">Level {level}</p>
            <p className="text-xs text-slate-500">{xpInBand} / 200 XP to next</p>
          </div>
        </div>
      ),
    },
    {
      key: "xp",
      content: (
        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="text-xs uppercase tracking-wide text-slate-500">Experience Points</span>
          </div>
          <p className="text-4xl font-extrabold text-amber-600">{xp.toLocaleString()}</p>
          <p className="text-xs text-slate-500 mt-1">Total XP earned</p>
        </div>
      ),
    },
    {
      key: "streak",
      content: (
        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <Flame
              className={`w-4 h-4 text-amber-500 ${streak >= 3 ? "animate-pulse drop-shadow-[0_0_6px_rgba(245,158,11,0.55)]" : ""}`}
            />
            <span className="text-xs uppercase tracking-wide text-slate-500">Current Streak</span>
          </div>
          {streak > 0 ? (
            <>
              <div className="flex items-baseline gap-1">
                <p className="text-4xl font-extrabold text-amber-600">{streak}</p>
                <span className="text-sm text-amber-600/80">days</span>
              </div>
              {streak >= 3 && (
                <p className="text-xs text-amber-600/80 mt-1">On fire!</p>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500 mt-2">Start your streak!</p>
          )}
        </div>
      ),
    },
    {
      key: "labs",
      content: (
        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <FlaskConical className="w-4 h-4 text-emerald-400" />
            <span className="text-xs uppercase tracking-wide text-slate-500">Labs Completed</span>
          </div>
          <div className="flex items-baseline gap-1.5 mb-3">
            <p className="text-4xl font-extrabold text-emerald-700">{labsCompleted}</p>
            <span className="text-sm text-emerald-500/80">/ {safeTotalLabs}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-blue-600"
              initial={{ width: 0 }}
              animate={{ width: `${labPercent}%` }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
            />
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, i) => (
        <motion.div
          key={card.key}
          className="faculty-surface h-full min-h-[150px] rounded-2xl p-5"
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          custom={i}
          whileHover={{ y: -3, scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
        >
          <div className="text-slate-900">{card.content}</div>
        </motion.div>
      ))}
    </div>
  );
}
