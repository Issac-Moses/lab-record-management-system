import { motion, AnimatePresence } from "framer-motion";
import { Activity, Inbox } from "lucide-react";

const typeColors = {
  submission: "bg-emerald-400",
  achievement: "bg-amber-400",
  xp: "bg-indigo-400",
};

function relativeTime(timestamp) {
  if (!timestamp) return null;
  try {
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return `${Math.floor(days / 7)}w ago`;
  } catch {
    return null;
  }
}

const itemVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: (i) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.07, duration: 0.3, ease: "easeOut" },
  }),
};

export default function RecentActivity({ activities = [] }) {
  const safeActivities = Array.isArray(activities) ? activities.slice(0, 5) : [];

  return (
    <motion.div
      className="student-card-interactive faculty-surface rounded-2xl p-5"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
          <Activity className="w-4 h-4 text-white" />
        </div>
        <h3 className="font-semibold text-slate-900">Recent Activity</h3>
      </div>

      {safeActivities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
            <Inbox className="w-7 h-7 text-slate-500" />
          </div>
          <p className="text-sm text-slate-500">No recent activity</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-200" />

          <AnimatePresence>
            {safeActivities.map((item, i) => {
              const dotColor = typeColors[item.type] || "bg-slate-500";
              const time = relativeTime(item.timestamp);

              return (
                <motion.div
                  key={item.id || i}
                  className="relative flex items-start gap-3 py-2.5"
                  variants={itemVariants}
                  initial="hidden"
                  animate="visible"
                  custom={i}
                >
                  <div className={`relative z-10 mt-0.5 h-[15px] w-[15px] shrink-0 rounded-full ${dotColor} ring-4 ring-white`} />
                  <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                    <p className="truncate text-sm text-slate-700">
                      {item.label || "Activity updated"}
                    </p>
                    {time && (
                      <span className="shrink-0 whitespace-nowrap text-[10px] text-slate-500">{time}</span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
