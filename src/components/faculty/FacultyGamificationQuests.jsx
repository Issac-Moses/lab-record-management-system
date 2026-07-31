import React, { useCallback, useEffect, useState, Fragment } from "react";
import { supabase } from "@/lib/supabase";
import { assignQuestTask, fetchCreatedTasks, fetchQuestCompletions, verifyQuestTask } from "@/services/gamificationTasksClient";
import { getFacultySubjectEnrollmentProfiles } from "@/services/facultyDataService";
import { Send, ListChecks, CheckCircle2, AlertCircle, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import ShellCard from "@/components/admin/ShellCard";
import EmptyState from "@/components/admin/EmptyState";

export default function FacultyGamificationQuests({ subjectId, subjectName }) {
  const [tasks, setTasks] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [studentId, setStudentId] = useState("ALL");
  const [customStudentInput, setCustomStudentInput] = useState("");
  const [useCustomInput, setUseCustomInput] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [xpReward, setXpReward] = useState(50);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });

  const [expandedQuestId, setExpandedQuestId] = useState(null);
  const [completions, setCompletions] = useState({});
  const [completionsLoading, setCompletionsLoading] = useState({});
  const [verifyingId, setVerifyingId] = useState("");

  const toggleExpand = async (taskId, isGlobal) => {
    if (expandedQuestId === taskId) {
      setExpandedQuestId(null);
      return;
    }
    setExpandedQuestId(taskId);
    if (isGlobal && !completions[taskId]) {
      setCompletionsLoading((prev) => ({ ...prev, [taskId]: true }));
      try {
        const rows = await fetchQuestCompletions(taskId);
        setCompletions((prev) => ({ ...prev, [taskId]: rows }));
      } catch (err) {
        console.error("Failed to load completions", err);
      } finally {
        setCompletionsLoading((prev) => ({ ...prev, [taskId]: false }));
      }
    }
  };

  const handleVerify = async (taskId, studentId = null) => {
    const key = `${taskId}-${studentId || "direct"}`;
    setVerifyingId(key);
    setMsg({ type: "", text: "" });
    try {
      await verifyQuestTask(taskId, studentId || undefined);
      setMsg({ type: "success", text: "Quest submission successfully verified and XP awarded!" });
      await loadData();
      if (studentId) {
        const rows = await fetchQuestCompletions(taskId);
        setCompletions((prev) => ({ ...prev, [taskId]: rows }));
      }
    } catch (err) {
      setMsg({ type: "error", text: err instanceof Error ? err.message : "Failed to verify quest" });
    } finally {
      setVerifyingId("");
    }
  };

  const loadData = useCallback(async () => {
    if (!subjectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [createdRows, enrolledProfiles] = await Promise.all([
        fetchCreatedTasks().catch(() => []),
        getFacultySubjectEnrollmentProfiles(subjectId).catch(() => []),
      ]);

      // Filter tasks by subjectId if present
      const subjectTasks = (createdRows || []).filter(
        (t) => !t.subject_id || String(t.subject_id) === String(subjectId)
      );
      setTasks(subjectTasks);

      const cleanStudents = (enrolledProfiles || []).map((p) => ({
        id: String(p.id || "").trim(),
        name: String(p.name || "Student").trim(),
        registerNo: String(p.register_no || "-").trim(),
      })).filter((s) => s.id && !s.name.startsWith("Enrolled student ("));

      setStudents(cleanStudents);
    } catch {
      setTasks([]);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleAssign = async (e) => {
    e.preventDefault();
    setMsg({ type: "", text: "" });
    const targetStudent = useCustomInput ? customStudentInput.trim() : studentId.trim();

    if (!targetStudent || !title.trim()) {
      setMsg({ type: "error", text: "Please select a student target and enter a quest title." });
      return;
    }
    setSubmitting(true);
    try {
      await assignQuestTask({
        studentId: targetStudent,
        subjectId: subjectId || null,
        title: title.trim(),
        description: description.trim(),
        xpReward: Math.min(500, Math.max(1, Number(xpReward) || 50)),
      });
      setMsg({ type: "success", text: `Quest successfully assigned to ${subjectName || "Subject"} students!` });
      setTitle("");
      setDescription("");
      setXpReward(50);
      await loadData();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof Error ? err.message : "Failed to assign quest" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <ShellCard title={`Create Subject Quest (${subjectName || "Subject"})`} glow="indigo">
        <form onSubmit={handleAssign} className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">Assign To (Target Student)</label>
              <button
                type="button"
                onClick={() => setUseCustomInput(!useCustomInput)}
                className="text-xs font-medium text-indigo-600 hover:underline"
              >
                {useCustomInput ? "Choose from subject roster" : "Enter Register No / Email / UUID"}
              </button>
            </div>

            {useCustomInput ? (
              <input
                value={customStudentInput}
                onChange={(e) => setCustomStudentInput(e.target.value)}
                placeholder="Enter Register No, Email, UUID, or 'ALL' for Global Quest..."
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            ) : (
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 focus:border-indigo-500 focus:outline-none"
              >
                <option value="ALL">🌟 All Students in {subjectName || "Subject"} (Global Quest)</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.registerNo})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-slate-700">Quest Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Implement Dijkstra's Algorithm Bonus Challenge"
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-slate-700">Quest Description / Instructions</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Detail what students need to complete to earn XP for this subject quest..."
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700">XP Reward (1–500 XP)</label>
            <input
              type="number"
              min={1}
              max={500}
              value={xpReward}
              onChange={(e) => setXpReward(Number(e.target.value))}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-blue-700 hover:to-indigo-700 disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" />
              {submitting ? "Creating..." : "Create Subject Quest"}
            </button>
          </div>

          {msg.text ? (
            <div
              className={`md:col-span-2 flex items-center gap-2 rounded-xl p-3 text-xs font-medium ${
                msg.type === "success"
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border border-rose-200 bg-rose-50 text-rose-900"
              }`}
            >
              {msg.type === "success" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              )}
              <span>{msg.text}</span>
            </div>
          ) : null}
        </form>
      </ShellCard>

      <ShellCard title={`Created Quests (${subjectName || "Subject"})`} glow="blue">
        {loading ? (
          <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
        ) : tasks.length === 0 ? (
          <EmptyState title="No quests created yet" description="Create a quest above for students enrolled in this subject." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-slate-600 w-8"></th>
                  <th className="px-4 py-2.5 text-left text-slate-600">Target Student</th>
                  <th className="px-4 py-2.5 text-left text-slate-600">Quest Title</th>
                  <th className="px-4 py-2.5 text-right text-slate-600">XP Reward</th>
                  <th className="px-4 py-2.5 text-right text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tasks.map((t) => {
                  const isGlobal = t.is_global || !t.student_id;
                  const isExpanded = expandedQuestId === t.id;
                  return (
                    <Fragment key={t.id}>
                      <tr
                        onClick={() => void toggleExpand(t.id, isGlobal)}
                        className="bg-white/80 hover:bg-slate-50/80 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-2.5 text-slate-400">
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-800">
                          {isGlobal ? "🌟 All Students (Global)" : t.student_name || t.student_id?.slice(0, 8) || "Student"}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700 font-semibold">{t.title}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-indigo-600">+{t.xp_reward} XP</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            t.status === "completed" ? "bg-emerald-50 text-emerald-700" :
                            t.status === "submitted" ? "bg-blue-50 text-blue-700" :
                            "bg-amber-50 text-amber-700"
                          }`}>
                            {t.status}
                          </span>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-50/50">
                          <td colSpan={5} className="px-6 py-4 border-t border-b border-slate-100">
                            <div className="space-y-4">
                              {t.description && (
                                <div>
                                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Description</span>
                                  <p className="text-sm text-slate-700 mt-1">{t.description}</p>
                                </div>
                              )}
                              
                              {!isGlobal ? (
                                <div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Student Submission</span>
                                    {t.status === "submitted" && (
                                      <button
                                        type="button"
                                        disabled={verifyingId === `${t.id}-direct`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void handleVerify(t.id);
                                        }}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition disabled:opacity-50"
                                      >
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        {verifyingId === `${t.id}-direct` ? "Verifying..." : "Verify & Award XP"}
                                      </button>
                                    )}
                                  </div>
                                  {t.submission_notes ? (
                                    <div className="mt-1.5 rounded-lg border border-indigo-100 bg-white p-3 shadow-sm text-sm text-slate-800 font-mono">
                                      {t.submission_notes}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-slate-500 italic mt-1">No work submitted yet.</p>
                                  )}
                                </div>
                              ) : (
                                <div>
                                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Completions & Submissions</span>
                                  {completionsLoading[t.id] ? (
                                    <div className="h-10 animate-pulse bg-slate-100 rounded-lg mt-2" />
                                  ) : !completions[t.id] || completions[t.id].length === 0 ? (
                                    <p className="text-xs text-slate-500 italic mt-1">No students have completed this global quest yet.</p>
                                  ) : (
                                    <ul className="mt-2 space-y-2.5">
                                      {completions[t.id].map((c) => (
                                        <li key={c.student_id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm text-sm">
                                          <div className="flex items-center justify-between font-semibold text-slate-800">
                                            <div className="flex items-center gap-2">
                                              <span>{c.student_name} ({c.register_no})</span>
                                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                                c.status === "completed" ? "bg-emerald-50 text-emerald-700" :
                                                c.status === "submitted" ? "bg-blue-50 text-blue-700 animate-pulse" :
                                                "bg-amber-50 text-amber-700"
                                              }`}>
                                                {c.status}
                                              </span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                              <span className="text-[10px] font-normal text-slate-500">
                                                {new Date(c.completed_at).toLocaleString()}
                                              </span>
                                              {c.status === "submitted" && (
                                                <button
                                                  type="button"
                                                  disabled={verifyingId === `${t.id}-${c.student_id}`}
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    void handleVerify(t.id, c.student_id);
                                                  }}
                                                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition disabled:opacity-50"
                                                >
                                                  <CheckCircle2 className="h-3 w-3" />
                                                  {verifyingId === `${t.id}-${c.student_id}` ? "Verifying..." : "Verify & Approve"}
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                          {c.submission_notes ? (
                                            <div className="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-700 font-mono border border-slate-100">
                                              <span className="text-[10px] font-bold text-slate-400 block mb-0.5">SUBMISSION:</span>
                                              {c.submission_notes}
                                            </div>
                                          ) : (
                                            <p className="text-xs text-slate-400 italic mt-1">Completed without notes.</p>
                                          )}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <ListChecks className="h-3.5 w-3.5" />
          Quests created for this subject earn students bonus XP upon completion.
        </p>
      </ShellCard>
    </div>
  );
}
