import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchFacultyScopedStudents } from "@/services/facultyStudentsClient";
import { assignQuestTask, fetchCreatedTasks } from "@/services/gamificationTasksClient";
import { ScrollText, Send, UserPlus } from "lucide-react";

/**
 * Assign XP quests to students in the current subject (faculty).
 */
export default function FacultyTaskAssignPanel() {
  const subjectId = typeof localStorage !== "undefined" ? localStorage.getItem("faculty_subject_id") : null;
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [studentId, setStudentId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [xpReward, setXpReward] = useState(50);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [created, setCreated] = useState([]);

  const loadStudents = useCallback(async () => {
    if (!subjectId) {
      setStudents([]);
      setLoadingStudents(false);
      return;
    }
    setLoadingStudents(true);
    try {
      const { data: mappings, error } = await supabase
        .from("student_subjects")
        .select("student_id")
        .eq("subject_id", subjectId);
      if (error) {
        console.warn("student_subjects:", error.message);
        setStudents([]);
        return;
      }
      const ids = [...new Set((mappings || []).map((m) => String(m.student_id || "").trim()).filter(Boolean))];
      if (ids.length === 0) {
        setStudents([]);
        return;
      }
      const rows = await fetchFacultyScopedStudents(subjectId, ids);
      setStudents(Array.isArray(rows) ? rows : []);
    } catch {
      setStudents([]);
    } finally {
      setLoadingStudents(false);
    }
  }, [subjectId]);

  const loadCreated = useCallback(async () => {
    const rows = await fetchCreatedTasks();
    setCreated(Array.isArray(rows) ? rows.slice(0, 20) : []);
  }, []);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  useEffect(() => {
    void loadCreated();
  }, [loadCreated]);

  const handleAssign = async (e) => {
    e.preventDefault();
    setMessage("");
    if (!studentId.trim() || !title.trim()) {
      setMessage("Choose a student and enter a quest title.");
      return;
    }
    setSubmitting(true);
    try {
      await assignQuestTask({
        studentId: studentId.trim(),
        title: title.trim(),
        description: description.trim(),
        xpReward: Math.min(500, Math.max(1, Number(xpReward) || 50)),
        subjectId: subjectId || null,
      });
      setMessage("Quest assigned! The student will see it on their dashboard.");
      setTitle("");
      setDescription("");
      setXpReward(50);
      await loadCreated();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Assign failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (!subjectId) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        Select a subject to assign student quests.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/80 to-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-600 shadow-md">
          <UserPlus className="h-5 w-5 text-white" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900">Assign student quests</h3>
          <p className="text-xs text-slate-600">Students complete quests on their dashboard to earn XP and rank up.</p>
        </div>
      </div>

      <form onSubmit={handleAssign} className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-slate-700">Student</label>
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            disabled={loadingStudents}
          >
            <option value="">{loadingStudents ? "Loading…" : "Select student"}</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name || s.register_no || s.id} {s.register_no ? `· ${s.register_no}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700">Quest title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Finish experiment 3 write-up"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700">Details (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700">XP reward (1–500)</label>
          <input
            type="number"
            min={1}
            max={500}
            value={xpReward}
            onChange={(e) => setXpReward(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        {message ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">{message}</p>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-60"
        >
          <Send className="h-4 w-4" />
          {submitting ? "Sending…" : "Assign quest"}
        </button>
      </form>

      {created.length > 0 ? (
        <div className="mt-5 border-t border-violet-100 pt-4">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
            <ScrollText className="h-3.5 w-3.5" />
            Recently assigned
          </p>
          <ul className="max-h-36 space-y-1 overflow-y-auto text-xs text-slate-600">
            {created.map((t) => (
              <li key={t.id} className="flex justify-between gap-2 rounded border border-slate-100 bg-white/80 px-2 py-1.5">
                <span className="truncate font-medium text-slate-800">{t.title}</span>
                <span className="shrink-0 text-slate-500">{t.status}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
