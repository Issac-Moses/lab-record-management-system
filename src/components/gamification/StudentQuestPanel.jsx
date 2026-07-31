import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Circle, ScrollText, Sparkles, Trophy, Play, ArrowRight, Hourglass } from "lucide-react";
import { fetchMyTasks, performQuestTask } from "@/services/gamificationTasksClient";

/**
 * Assigned XP quests — completing pending/performing tasks redirects to the workspace page.
 */
export default function StudentQuestPanel({ onProgressUpdated }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState("");
  const [performingId, setPerformingId] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await fetchMyTasks();
      setTasks(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load quests.");
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeQuests = tasks.filter(
    (t) => {
      const s = String(t.status).toLowerCase();
      return s === "pending" || s === "performing";
    }
  );
  
  const submittedQuests = tasks.filter((t) => String(t.status).toLowerCase() === "submitted");
  const done = tasks.filter((t) => String(t.status).toLowerCase() === "completed");

  const handleStart = async (taskId) => {
    setPerformingId(taskId);
    setToast("");
    try {
      await performQuestTask(taskId);
      setToast("Quest started! Opening workspace...");
      setTimeout(() => {
        navigate(`/student/quests/${taskId}`);
      }, 1000);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Failed to start quest");
    } finally {
      setPerformingId("");
      window.setTimeout(() => setToast(""), 6000);
    }
  };

  return (
    <div className="rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/90 via-white to-slate-50 p-5 shadow-sm ring-1 ring-indigo-100">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-md">
          <ScrollText className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold text-slate-900">Quest board</h3>
          <p className="text-xs text-slate-600">
            Your faculty or admin assigns quests. Start and complete them here to earn XP and climb the leaderboard.
          </p>
        </div>
        <Trophy className="hidden h-8 w-8 text-amber-400 sm:block" aria-hidden />
      </div>

      {toast ? (
        <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 font-semibold animate-pulse">
          {toast}
        </div>
      ) : null}

      {error ? (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {error}{" "}
          <button type="button" className="ml-1 font-semibold underline" onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="student-shimmer h-10 rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-indigo-700">
              <Sparkles className="h-3.5 w-3.5" />
              Active quests ({activeQuests.length})
            </p>
            {activeQuests.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 bg-white/60 px-3 py-4 text-center text-sm text-slate-500">
                No quests yet. When your teacher assigns one, it will appear here.
              </p>
            ) : (
              <ul className="space-y-2">
                <AnimatePresence initial={false}>
                  {activeQuests.map((task) => {
                    const isPerforming = String(task.status).toLowerCase() === "performing";
                    return (
                      <motion.li
                        key={task.id}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex flex-col gap-2 rounded-xl border border-indigo-200 bg-white/90 px-4 py-3 shadow-sm"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between w-full">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-slate-900 text-sm sm:text-base">{task.title}</p>
                              {isPerforming && (
                                <span className="inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20 animate-pulse">
                                  Performing
                                </span>
                              )}
                            </div>
                            {task.description ? (
                              <p className="mt-0.5 text-xs text-slate-600 truncate">{task.description}</p>
                            ) : null}
                            <p className="mt-1 text-xs font-medium text-indigo-600">
                              Reward: +{Number(task.xp_reward || 0)} XP
                            </p>
                          </div>
                          <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                            {isPerforming ? (
                              <button
                                type="button"
                                onClick={() => navigate(`/student/quests/${task.id}`)}
                                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
                              >
                                Go to Workspace
                                <ArrowRight className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={performingId === task.id}
                                onClick={() => void handleStart(task.id)}
                                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3.5 py-2 text-xs font-semibold text-indigo-600 shadow-sm transition hover:bg-indigo-50 disabled:opacity-60"
                              >
                                {performingId === task.id ? (
                                  "…"
                                ) : (
                                  <>
                                    <Play className="h-3.5 w-3.5" />
                                    Start Quest
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}
          </div>

          {/* Submitted Quests pending verification */}
          {submittedQuests.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
                <Hourglass className="h-3.5 w-3.5" />
                Submitted - Awaiting Review ({submittedQuests.length})
              </p>
              <ul className="space-y-2">
                {submittedQuests.map((task) => (
                  <li key={task.id} className="flex flex-col gap-1.5 rounded-xl border border-amber-200 bg-amber-50/40 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800 text-sm">{task.title}</span>
                      <span className="shrink-0 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-100">
                        Awaiting Verification
                      </span>
                    </div>
                    {task.submission_notes ? (
                      <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-600 font-mono mt-1 max-h-24 overflow-y-auto">
                        <span className="font-semibold text-slate-400 block mb-0.5 uppercase text-[10px]">Your Answer:</span>
                        {task.submission_notes}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {done.length > 0 ? (
            <div>
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Circle className="h-3 w-3" />
                Completed ({done.length})
              </p>
              <ul className="max-h-60 space-y-2 overflow-y-auto text-sm text-slate-600">
                {done.slice(0, 8).map((task) => (
                  <li key={task.id} className="flex flex-col gap-1.5 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="truncate font-medium text-slate-700">{task.title}</span>
                      <span className="shrink-0 text-xs text-emerald-600 font-semibold">+{Number(task.xp_reward || 0)} XP</span>
                    </div>
                    {task.submission_notes ? (
                      <div className="rounded border border-slate-200 bg-white/70 px-2 py-1.5 text-xs text-slate-500 font-normal">
                        <span className="font-semibold text-slate-600 block mb-0.5">Your Submission:</span>
                        {task.submission_notes}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
