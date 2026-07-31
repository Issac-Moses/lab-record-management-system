import React, { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { fetchMyTasks, submitQuestTask } from "@/services/gamificationTasksClient";
import { ArrowLeft, Sparkles, Award, Send, CheckCircle } from "lucide-react";
// @ts-ignore – JS file without declaration file
import ShellCard from "@/components/admin/ShellCard";

export default function StudentQuestWorkspace() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submissionText, setSubmissionText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  const loadQuest = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    setError("");
    try {
      const rows = await fetchMyTasks();
      const found = rows.find((r) => String(r.id) === String(taskId));
      if (!found) {
        setError("Quest not found or not assigned to you.");
      } else {
        setTask(found);
        setSubmissionText((found as any).submission_notes || "");
      }
    } catch (e) {
      setError("Failed to load quest details.");
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void loadQuest();
  }, [loadQuest]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskId || !submissionText.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      await submitQuestTask(taskId, submissionText.trim());
      setSubmittedSuccess(true);
      setTimeout(() => {
        navigate("/student");
      }, 2000);
    } catch (e: any) {
      setError(e.message || "Failed to submit quest work.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="max-w-2xl mx-auto mt-8 p-6 bg-white rounded-3xl border border-slate-200 text-center">
        <p className="text-slate-600 font-semibold mb-4">{error || "Quest not found."}</p>
        <button
          onClick={() => navigate("/student")}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm transition"
        >
          <ArrowLeft className="h-4 w-4" /> Go back
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/student")}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-xs shadow-sm transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
        </button>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
          <Award className="h-3.5 w-3.5" /> Earn +{task.xp_reward} XP
        </span>
      </div>

      {/* Quest Workspace Grid */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Instruction details */}
        <div className="md:col-span-1 space-y-6">
          <ShellCard title="Quest Instructions" glow="indigo">
            <h2 className="text-base font-bold text-slate-900 mb-2">{task.title}</h2>
            {task.description ? (
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{task.description}</p>
            ) : (
              <p className="text-xs text-slate-400 italic">No description provided.</p>
            )}
            <div className="mt-6 pt-4 border-t border-slate-100 flex justify-between text-xs text-slate-500 font-medium">
              <span>Status</span>
              <span className="capitalize font-semibold text-amber-600">{task.status}</span>
            </div>
          </ShellCard>
        </div>

        {/* Editor / Workspace area */}
        <div className="md:col-span-2">
          <ShellCard title="Submission Workspace" glow="blue">
            {submittedSuccess ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-12 text-center"
              >
                <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                  <CheckCircle className="h-8 w-8 text-emerald-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Quest Submitted!</h3>
                <p className="text-sm text-slate-500 mt-1.5">Your work has been submitted to your faculty for evaluation.</p>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Write your Solution / Answers / Code Links below
                  </label>
                  <textarea
                    value={submissionText}
                    onChange={(e) => setSubmissionText(e.target.value)}
                    required
                    rows={12}
                    placeholder="Enter your answers, copy-paste code snippets, or drop GitHub links to complete this quest..."
                    className="w-full rounded-2xl border border-slate-200 p-4 text-sm font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none bg-slate-50"
                  />
                </div>

                {error && (
                  <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-100 p-3 rounded-xl">
                    {error}
                  </p>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => navigate("/student")}
                    className="px-4 py-2 border border-slate-200 hover:bg-slate-50 font-semibold text-slate-700 text-sm rounded-xl transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !submissionText.trim()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 font-semibold text-white text-sm rounded-xl shadow-sm transition disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    {submitting ? "Submitting..." : "Submit Quest"}
                  </button>
                </div>
              </form>
            )}
          </ShellCard>
        </div>
      </div>
    </div>
  );
}
