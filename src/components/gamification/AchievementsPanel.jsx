import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Lock, Sparkles, ScrollText } from "lucide-react";
import { getAchievementsCatalog } from "@/services/studentGamificationService";

const brandColors = [
  { bg: "from-blue-600 to-indigo-600", text: "text-blue-600" },
  { bg: "from-indigo-500 to-blue-600", text: "text-indigo-600" },
  { bg: "from-emerald-500 to-blue-600", text: "text-emerald-600" },
  { bg: "from-amber-500 to-amber-600", text: "text-amber-600" },
  { bg: "from-blue-500 to-emerald-500", text: "text-blue-600" },
  { bg: "from-indigo-600 to-emerald-500", text: "text-indigo-600" },
];

function formatDate(dateStr) {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

function SkeletonCard() {
  return (
    <div className="student-shimmer rounded-xl border border-slate-200 bg-slate-100 p-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-slate-200" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-24 rounded bg-slate-200" />
          <div className="h-3 w-36 rounded bg-slate-200" />
          <div className="h-5 w-14 rounded-full bg-slate-200" />
        </div>
      </div>
    </div>
  );
}

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.3, ease: "easeOut" },
  }),
};

export default function AchievementsPanel({ userId, refreshKey = 0 }) {
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState([]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!userId) {
        setCatalog([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const data = await getAchievementsCatalog(userId);
        if (mounted) setCatalog(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("AchievementsPanel load error:", error);
        if (mounted) setCatalog([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [userId, refreshKey]);

  const sorted = useMemo(() => {
    return [...catalog].sort((a, b) => {
      const ae = a.earned_at ? 1 : 0;
      const be = b.earned_at ? 1 : 0;
      if (be !== ae) return be - ae;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }, [catalog]);

  const unlockedCount = useMemo(() => catalog.filter((a) => !!a.earned_at).length, [catalog]);
  const totalCount = catalog.length;

  return (
    <motion.div
      className="faculty-surface rounded-2xl p-5"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600">
            <Trophy className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Achievements</h3>
            <p className="text-[10px] text-slate-500">Labs, streaks &amp; assigned quests</p>
          </div>
        </div>
        <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
          {unlockedCount} / {totalCount || "—"} unlocked
        </span>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
            <Trophy className="h-7 w-7 text-slate-500" />
          </div>
          <p className="mb-1 text-sm text-slate-500">No achievement definitions in the database yet</p>
          <p className="max-w-xs text-xs text-slate-500">
            Run <code className="rounded bg-slate-100 px-1">gamification-schema.sql</code> and{" "}
            <code className="rounded bg-slate-100 px-1">gamification-quest-achievements.sql</code> in Supabase.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AnimatePresence>
            {sorted.map((a, i) => {
              const color = brandColors[i % brandColors.length];
              const earned = !!a.earned_at;
              const date = formatDate(a.earned_at);
              const isQuest =
                /quest/i.test(a.name || "") || /assigned quest/i.test(a.description || "");

              return (
                <motion.div
                  key={a.id}
                  className={`relative rounded-xl border p-4 ${
                    earned ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50/90 opacity-95"
                  }`}
                  variants={itemVariants}
                  initial="hidden"
                  animate="visible"
                  custom={i}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                        earned ? `bg-gradient-to-br ${color.bg}` : "bg-slate-200"
                      }`}
                    >
                      {earned ? (
                        <Sparkles className="h-5 w-5 text-white" />
                      ) : isQuest ? (
                        <ScrollText className="h-4 w-4 text-slate-500" />
                      ) : (
                        <Lock className="h-4 w-4 text-slate-500" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{a.name}</p>
                      <p className="mt-0.5 line-clamp-3 text-xs text-slate-600">{a.description}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          +{a.xp_reward} XP
                        </span>
                        {isQuest && !earned ? (
                          <span className="text-[10px] font-medium text-indigo-600">Complete quests to unlock</span>
                        ) : null}
                        <span className="text-[10px] text-slate-500">{earned ? date : "Locked"}</span>
                      </div>
                    </div>
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
