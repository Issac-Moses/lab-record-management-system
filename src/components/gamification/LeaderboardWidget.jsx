import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Trophy, Medal, Award, Users, TrendingUp } from "lucide-react";
import { getLeaderboard } from "@/services/studentGamificationService";

const podiumConfig = [
  {
    place: 0,
    order: "order-2",
    barH: "h-24",
    bg: "from-indigo-600 to-violet-600",
    ring: "ring-indigo-400/40",
    text: "text-indigo-600",
    badgeBg: "bg-amber-400 text-amber-950",
    label: "1st",
    icon: Trophy,
  },
  {
    place: 1,
    order: "order-1",
    barH: "h-16",
    bg: "from-slate-600 to-slate-700",
    ring: "ring-slate-400/30",
    text: "text-slate-600",
    badgeBg: "bg-slate-300 text-slate-900",
    label: "2nd",
    icon: Medal,
  },
  {
    place: 2,
    order: "order-3",
    barH: "h-12",
    bg: "from-amber-600 to-amber-700",
    ring: "ring-amber-500/30",
    text: "text-amber-700",
    badgeBg: "bg-amber-700 text-amber-50",
    label: "3rd",
    icon: Award,
  },
];

function getInitials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default function LeaderboardWidget({ department, currentUserId }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      try {
        const data = await getLeaderboard(department, 5, currentUserId);
        if (mounted) setRows(data);
      } catch (error) {
        console.error("LeaderboardWidget load error:", error);
        if (mounted) setRows([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [department, currentUserId]);

  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);
  const hasTop3 = top3.length >= 3;

  const currentUserInTop5 = rows.slice(0, 5).some((r) => r.user_id === currentUserId);
  const appendedUser = !currentUserInTop5 && rows.length > 5 ? rows[rows.length - 1] : null;
  const displayRest = appendedUser
    ? rest.filter((r) => r.user_id !== appendedUser.user_id)
    : rest;

  return (
    <motion.div
      className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-base">Subject Leaderboard</h3>
            <p className="text-xs text-slate-500">Student rank by accumulated XP</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
          <TrendingUp className="h-3 w-3" /> Live
        </span>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="student-shimmer h-10 rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 mb-2">
            <Users className="h-6 w-6 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-500">No student rankings available yet</p>
        </div>
      ) : (
        <div>
          {/* Podium */}
          {hasTop3 && (
            <div className="flex items-end justify-center gap-2 mb-6 pt-2">
              {podiumConfig.map(({ place, order, barH, bg, ring, badgeBg, label, icon: Icon }) => {
                const entry = top3[place];
                if (!entry) return null;
                const isCurrent = entry.user_id === currentUserId;

                return (
                  <motion.div
                    key={entry.user_id}
                    className={`flex flex-col items-center ${order} flex-1 max-w-[110px]`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + place * 0.08, duration: 0.4, ease: "easeOut" }}
                  >
                    <div className="relative mb-2 flex flex-col items-center">
                      <div
                        className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br ${bg} text-white font-bold text-xs ring-4 ${ring} shadow-sm`}
                      >
                        {getInitials(entry.name)}
                      </div>
                      <span
                        className={`absolute -bottom-1.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.2 text-[9px] font-extrabold shadow-sm ${badgeBg}`}
                      >
                        <Icon className="h-2.5 w-2.5" />
                        {label}
                      </span>
                    </div>

                    <p
                      className={`text-xs font-semibold max-w-full truncate text-center mt-1 ${
                        isCurrent ? "text-indigo-600 font-bold" : "text-slate-800"
                      }`}
                    >
                      {isCurrent ? "You" : entry.name}
                    </p>
                    <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                      {entry.xp_points} <span className="text-[9px] font-normal">XP</span>
                    </p>

                    {/* Pillar */}
                    <motion.div
                      className={`w-full ${barH} rounded-t-xl bg-gradient-to-t ${bg} opacity-15 mt-2`}
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ delay: 0.2 + place * 0.08, duration: 0.5, ease: "easeOut" }}
                      style={{ transformOrigin: "bottom" }}
                    />
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* List Rows */}
          {displayRest.length > 0 && (
            <div className="space-y-2">
              {displayRest.map((row, i) => {
                const isCurrent = row.user_id === currentUserId;
                return (
                  <motion.div
                    key={`${row.user_id}-${row.rank}`}
                    className={`flex items-center justify-between text-xs rounded-xl border px-3.5 py-2.5 transition-colors ${
                      isCurrent
                        ? "bg-indigo-50/80 border-indigo-200 text-indigo-900 font-semibold"
                        : "bg-slate-50/70 border-slate-200/80 text-slate-800 hover:bg-slate-100/60"
                    }`}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.04 }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-5 text-center text-xs font-mono font-bold text-slate-400">
                        #{row.rank}
                      </span>
                      <span className="truncate font-medium">
                        {isCurrent ? "You" : row.name}
                      </span>
                    </div>
                    <span className="font-bold text-indigo-600 shrink-0">
                      {row.xp_points} XP
                    </span>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Appended current user if outside top 5 */}
          {appendedUser && (
            <div className="mt-3 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between text-xs rounded-xl border border-indigo-200 bg-indigo-50/90 px-3.5 py-2.5 font-semibold text-indigo-900">
                <div className="flex items-center gap-2.5">
                  <span className="w-5 text-center font-mono font-bold text-indigo-500">
                    #{appendedUser.rank}
                  </span>
                  <span>You</span>
                </div>
                <span className="font-bold text-indigo-600">{appendedUser.xp_points} XP</span>
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
