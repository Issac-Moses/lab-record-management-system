import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { assignQuestTask, fetchAdminAllTasks } from "@/services/gamificationTasksClient";
import { getStudentsPageData } from "@/services/adminDataService";
import { Shield, Send, ListChecks, CheckCircle2, AlertCircle } from "lucide-react";
import ShellCard from "@/components/admin/ShellCard";
import EmptyState from "@/components/admin/EmptyState";

export default function AdminGamificationQuests() {
  const [adminDept, setAdminDept] = useState("");
  const [tasks, setTasks] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [studentId, setStudentId] = useState("");
  const [customStudentInput, setCustomStudentInput] = useState("");
  const [useCustomInput, setUseCustomInput] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [xpReward, setXpReward] = useState(50);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      let dept = "";
      if (session?.user?.id) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("department, role")
          .eq("id", session.user.id)
          .maybeSingle();
        if (String(prof?.role || "") !== "admin") {
          setTasks([]);
          return;
        }
        dept = String(prof?.department || "").trim();
        setAdminDept(dept);
      }
      const [rows, studList] = await Promise.all([
        fetchAdminAllTasks(dept || undefined),
        getStudentsPageData(dept || undefined).catch(() => []),
      ]);
      setTasks(Array.isArray(rows) ? rows : []);
      setStudents(Array.isArray(studList) ? studList : []);
      if (studList && studList.length > 0) {
        setStudentId(studList[0].id);
      }
    } catch {
      setTasks([]);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleAssign = async (e) => {
    e.preventDefault();
    setMsg({ type: "", text: "" });
    const targetStudent = useCustomInput ? customStudentInput.trim() : studentId.trim();

    if (!targetStudent || !title.trim()) {
      setMsg({ type: "error", text: "Please select a student and enter a quest title." });
      return;
    }
    setSubmitting(true);
    try {
      await assignQuestTask({
        studentId: targetStudent,
        title: title.trim(),
        description: description.trim(),
        xpReward: Math.min(500, Math.max(1, Number(xpReward) || 50)),
      });
      setMsg({ type: "success", text: "Quest successfully assigned!" });
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
    <div className="space-y-4">
      <ShellCard title="Assign quest (admin)" glow="violet">
        <form onSubmit={handleAssign} className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-600">Select Student</label>
              <button
                type="button"
                onClick={() => setUseCustomInput(!useCustomInput)}
                className="text-xs text-violet-600 hover:underline"
              >
                {useCustomInput ? "Choose from list" : "Enter Register No / UUID / Email"}
              </button>
            </div>

            {useCustomInput ? (
              <input
                value={customStudentInput}
                onChange={(e) => setCustomStudentInput(e.target.value)}
                placeholder="Enter Student Register No, UUID, Email, or 'ALL' for Global Quest..."
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
              />
            ) : (
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 focus:border-violet-400 focus:outline-none"
              >
                <option value="ALL">🌟 All Students (Global Quest - Applies to Everyone)</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.registerNo || s.register_no || "No Reg"}) — {s.department || "Dept"}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-slate-600">Quest title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Complete Lab 3 bonus challenge"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-slate-600">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Provide instructions or additional details for the quest..."
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">XP Reward (1–500)</label>
            <input
              type="number"
              min={1}
              max={500}
              value={xpReward}
              onChange={(e) => setXpReward(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {submitting ? "Assigning..." : "Assign Quest"}
            </button>
          </div>

          {msg.text ? (
            <div
              className={`md:col-span-2 flex items-center gap-2 rounded-lg p-3 text-xs ${
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

      <ShellCard title={`Recent quests${adminDept ? ` · ${adminDept}` : ""}`} glow="blue">
        {loading ? (
          <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
        ) : tasks.length === 0 ? (
          <EmptyState title="No quests yet" description="Assign quests above or from faculty accounts." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-slate-600">Student</th>
                  <th className="px-3 py-2 text-left text-slate-600">Quest</th>
                  <th className="px-3 py-2 text-right text-slate-600">XP</th>
                  <th className="px-3 py-2 text-right text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tasks.slice(0, 25).map((t) => (
                  <tr key={t.id} className="bg-white/70">
                    <td className="px-3 py-2 text-slate-800">{t.student_name || t.student_id?.slice(0, 8) || "—"}</td>
                    <td className="px-3 py-2 text-slate-700">{t.title}</td>
                    <td className="px-3 py-2 text-right font-medium text-violet-700">{t.xp_reward}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{t.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <ListChecks className="h-3.5 w-3.5" />
          Department-scoped list when your admin profile has a department set.
        </p>
      </ShellCard>
    </div>
  );
}
