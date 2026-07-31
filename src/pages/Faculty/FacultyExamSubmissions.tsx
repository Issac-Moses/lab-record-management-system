import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { formatDateTime } from "@/lib/dateFormat";

type ExamSubmission = {
  id: string;
  student_name: string | null;
  register_no: string | null;
  exp_id: string | null;
  aim: string | null;
  procedure: string | null;
  program: string | null;
  output: string | null;
  result: string | null;
  marks: number | null;
  submitted_at: string | null;
};

function normalizeRegister(value: string | null | undefined) {
  return (value || "").trim().toUpperCase();
}

function isTabSwitchLikeEvent(event: string | null | undefined) {
  const normalized = String(event || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return (
    normalized.includes("tab") ||
    normalized.includes("switch") ||
    normalized.includes("blur") ||
    normalized.includes("hidden") ||
    normalized.includes("lost") ||
    normalized.includes("focus") ||
    normalized.includes("violation")
  );
}

export default function FacultyExamSubmissions() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const selectedSubjectId = localStorage.getItem("faculty_subject_id");
  const [submissions, setSubmissions] = useState<ExamSubmission[]>([]);
  const [tabSwitchByRegister, setTabSwitchByRegister] = useState<Record<string, number>>({});
  const [experimentTitles, setExperimentTitles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [activeSubmission, setActiveSubmission] = useState<ExamSubmission | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [marksInput, setMarksInput] = useState("");
  const [saving, setSaving] = useState(false);
  const violationsUnsupportedRef = useRef(false);

  const hasSubmissions = useMemo(() => submissions.length > 0, [submissions]);
  const summary = useMemo(() => {
    const values = Object.values(tabSwitchByRegister);
    const totalSwitches = values.reduce((sum, n) => sum + Number(n || 0), 0);
    const suspiciousStudents = values.filter((n) => Number(n || 0) > 3).length;
    return { totalSwitches, suspiciousStudents };
  }, [tabSwitchByRegister]);

  const loadSubmissions = useCallback(async () => {
    if (!examId) {
      setSubmissions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data: examMeta } = await supabase
      .from("exams")
      .select("subject_id")
      .eq("id", examId)
      .maybeSingle();

    if (!examMeta) {
      setSubmissions([]);
      setExperimentTitles({});
      setLoading(false);
      navigate("/faculty/exams");
      return;
    }

    const effectiveSubjectId = examMeta.subject_id;

    const { data: expRows } = await supabase
      .from("experiments")
      .select("id, title, experiment_no")
      .eq("subject_id", effectiveSubjectId);

    const titleMap: Record<string, string> = {};
    (expRows || []).forEach((row: { id: string; title: string | null; experiment_no: string | number | null }) => {
      titleMap[row.id] = `Exp ${row.experiment_no ?? "?"} — ${row.title || "Untitled"}`;
    });
    setExperimentTitles(titleMap);

    let allSubs: ExamSubmission[] = [];
    const { data: primaryData, error: primaryErr } = await supabase
      .from("exam_submissions")
      .select("*")
      .eq("exam_id", examId)
      .order("submitted_at", { ascending: false });

    if (primaryData && primaryData.length > 0) {
      allSubs = [...(primaryData as ExamSubmission[])];
    }

    // Fallback: Also check standard submissions table for this subject
    const { data: backupSubs } = await supabase
      .from("submissions")
      .select(
        `
        id,
        student_id,
        exp_id,
        aim,
        procedure,
        program,
        output,
        result,
        marks,
        updated_at,
        created_at,
        profiles ( name, full_name, register_no )
      `
      )
      .eq("subject_id", effectiveSubjectId)
      .order("updated_at", { ascending: false });

    if (backupSubs && backupSubs.length > 0) {
      const existingKeys = new Set(
        allSubs.map((s) => `${String(s.register_no || "")}_${String(s.exp_id || "")}`)
      );
      const mappedBackup: ExamSubmission[] = backupSubs
        .filter((row: any) => {
          const reg = row.profiles?.register_no || "?";
          const key = `${reg}_${String(row.exp_id || "")}`;
          return !existingKeys.has(key);
        })
        .map((row: any) => ({
          id: String(row.id),
          student_name: row.profiles?.full_name || row.profiles?.name || "Student",
          register_no: row.profiles?.register_no || "-",
          exp_id: String(row.exp_id || ""),
          aim: row.aim || null,
          procedure: row.procedure || null,
          program: row.program || null,
          output: row.output || null,
          result: row.result || null,
          marks: typeof row.marks === "number" ? row.marks : null,
          submitted_at: row.updated_at || row.created_at || new Date().toISOString(),
        }));
      allSubs = [...allSubs, ...mappedBackup];
    }

    if (allSubs.length === 0) {
      try {
        const MANUAL_API_BASE_URL = import.meta.env.VITE_MANUAL_API_URL || "http://localhost:7001";
        const res = await fetch(`${MANUAL_API_BASE_URL}/api/manual/exam-data/${examId}`);
        const payload = await res.json();
        if (payload?.success && Array.isArray(payload?.data?.submissions) && payload.data.submissions.length > 0) {
          allSubs = payload.data.submissions.map((row: any) => ({
            id: String(row.id || Math.random()),
            student_name: String(row.student_name || row.name || "Student"),
            register_no: String(row.register_no || "-"),
            exp_id: String(row.exp_id || ""),
            aim: row.aim || null,
            procedure: row.procedure || null,
            program: row.program || null,
            output: row.output || null,
            result: row.result || null,
            marks: typeof row.marks === "number" ? row.marks : null,
            submitted_at: String(row.submitted_at || row.updated_at || new Date().toISOString()),
          }));
        }
      } catch (_err) {
        // ignore
      }
    }

    if (primaryErr && allSubs.length === 0) {
      console.warn(`Failed to load primary exam submissions: ${primaryErr.message}`);
    }
    setSubmissions(allSubs);

    setLoading(false);
  }, [examId, navigate]);

  const loadTabSwitchCounts = useCallback(async () => {
    if (!examId) {
      setTabSwitchByRegister({});
      return;
    }

    const [activityRes, sessionsRes] = await Promise.all([
      supabase
        .from("exam_activity_logs")
        .select("register_no, event, details")
        .eq("exam_id", examId),
      supabase
        .from("exam_sessions")
        .select("id, student_id")
        .eq("exam_id", examId),
    ]);

    const counts: Record<string, number> = {};

    if (!activityRes.error && Array.isArray(activityRes.data)) {
      activityRes.data.forEach((row) => {
        if (!isTabSwitchLikeEvent(row.event)) return;
        const key = normalizeRegister(row.register_no);
        if (!key) return;
        counts[key] = (counts[key] || 0) + 1;
      });
    }



    // Query backend Service Role API to bypass RLS restrictions on activity logs
    try {
      const MANUAL_API_BASE_URL = import.meta.env.VITE_MANUAL_API_URL || "http://localhost:7001";
      const res = await fetch(`${MANUAL_API_BASE_URL}/api/manual/exam-data/${examId}`);
      const payload = await res.json();
      if (payload?.success && Array.isArray(payload?.data?.activity_logs)) {
        payload.data.activity_logs.forEach((item: any) => {
          if (!isTabSwitchLikeEvent(item.event)) return;
          const key = normalizeRegister(item.register_no);
          if (!key) return;
          counts[key] = Math.max(counts[key] || 0, (payload.data.activity_logs.filter((x: any) => normalizeRegister(x.register_no) === key && isTabSwitchLikeEvent(x.event))).length);
        });
      }
    } catch (_err) {
      // ignore network error
    }

    // Merge proctor violations (session-based) so faculty sees live suspicion counts too.
    if (!sessionsRes.error) {
      const sessions = (sessionsRes.data || []) as Array<{ id: string; student_id: string | null }>;
      const sessionIds = sessions.map((row) => String(row.id || "").trim()).filter(Boolean);
      const studentIds = sessions.map((row) => String(row.student_id || "").trim()).filter(Boolean);

      let regByStudent = new Map<string, string>();
      if (studentIds.length > 0) {
        const profileRes = await supabase
          .from("profiles")
          .select("id, register_no")
          .in("id", studentIds);
        if (!profileRes.error) {
          regByStudent = new Map(
            ((profileRes.data || []) as Array<{ id: string; register_no: string | null }>).map((row) => [
              String(row.id || "").trim(),
              normalizeRegister(row.register_no),
            ])
          );
        }
      }

      if (sessionIds.length > 0 && !violationsUnsupportedRef.current) {
        const violationSelectCandidates = [
          "session_id, violation_type",
          "session_id, type",
          "session_id, event",
        ];
        let violationsData: Array<{ session_id: string | null; violation_type?: string | null; type?: string | null; event?: string | null }> = [];
        for (const selectClause of violationSelectCandidates) {
          const violationsRes = await supabase
            .from("violations")
            .select(selectClause)
            .in("session_id", sessionIds);
          if (!violationsRes.error) {
            violationsData = (violationsRes.data || []) as unknown as typeof violationsData;
            break;
          }
        }
        if (violationsData.length === 0) {
          violationsUnsupportedRef.current = true;
        }
        if (violationsData.length > 0) {
          const studentBySession = new Map(
            sessions.map((row) => [String(row.id || "").trim(), String(row.student_id || "").trim()])
          );
          violationsData.forEach(
            (row) => {
              const vt = String(row.violation_type ?? row.type ?? row.event ?? "")
                .trim()
                .toLowerCase()
                .replace(/[\s-]+/g, "_");
              if (vt !== "tab_switch") return;
              const sid = String(row.session_id || "").trim();
              const studentId = studentBySession.get(sid) || "";
              const registerNo = regByStudent.get(studentId) || "";
              if (!registerNo) return;
              counts[registerNo] = (counts[registerNo] || 0) + 1;
            }
          );
        }
      }
    }

    setTabSwitchByRegister(counts);
  }, [examId]);

  useEffect(() => {
    void loadSubmissions();
    void loadTabSwitchCounts();
  }, [loadSubmissions, loadTabSwitchCounts]);

  useEffect(() => {
    if (!examId) return;

    const channel = supabase
      .channel("exam_submissions_live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "exam_submissions",
          filter: `exam_id=eq.${examId}`,
        },
        () => {
          void loadSubmissions();
          void loadTabSwitchCounts();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "submissions",
        },
        () => {
          void loadSubmissions();
          void loadTabSwitchCounts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [examId, loadSubmissions, loadTabSwitchCounts]);

  useEffect(() => {
    if (!examId) return;

    const activityChannel = supabase
      .channel(`exam_activity_logs_${examId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "exam_activity_logs",
          filter: `exam_id=eq.${examId}`,
        },
        () => {
          void loadTabSwitchCounts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(activityChannel);
    };
  }, [examId, loadTabSwitchCounts]);

  useEffect(() => {
    if (!activeSubmission) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [activeSubmission]);

  async function openSubmission(submission: ExamSubmission) {
    setActiveSubmission(submission);
    setMarksInput(submission.marks !== null ? String(submission.marks) : "");
    setDetailLoading(true);
    const { data, error } = await supabase
      .from("exam_submissions")
      .select("*")
      .eq("id", submission.id)
      .maybeSingle();

    setDetailLoading(false);

    if (!error && data) {
      setActiveSubmission(data as ExamSubmission);
    }
  }

  function closeModal() {
    setActiveSubmission(null);
    setMarksInput("");
    setDetailLoading(false);
  }

  async function saveMarks() {
    if (!activeSubmission) return;
    const marksValue = Number(marksInput);
    if (Number.isNaN(marksValue) || marksValue < 0 || marksValue > 100) {
      alert("Enter marks between 0 and 100");
      return;
    }

    setSaving(true);
    let { data: updatedRows, error: updateErr } = await supabase
      .from("exam_submissions")
      .update({ marks: marksValue })
      .eq("id", activeSubmission.id)
      .select("id, marks");

    // Fallback: update by exam_id and register_no if id query returned 0 rows
    if ((!updatedRows || updatedRows.length === 0) && examId && activeSubmission.register_no) {
      const fallbackRes = await supabase
        .from("exam_submissions")
        .update({ marks: marksValue })
        .eq("exam_id", examId)
        .eq("register_no", activeSubmission.register_no)
        .select("id, marks");
      if (fallbackRes.data && fallbackRes.data.length > 0) {
        updatedRows = fallbackRes.data;
        updateErr = fallbackRes.error;
      }
    }

    // Second Fallback: try updating standard submissions table if it was loaded from backup
    if (!updatedRows || updatedRows.length === 0) {
      const backupRes = await supabase
        .from("submissions")
        .update({ marks: marksValue })
        .eq("id", activeSubmission.id)
        .select("id, marks");
      if (backupRes.data && backupRes.data.length > 0) {
        updatedRows = backupRes.data;
        updateErr = backupRes.error;
      }
    }

    setSaving(false);

    if (updateErr || !updatedRows || updatedRows.length === 0) {
      alert(`Failed to save marks: ${updateErr?.message || "No matching database row updated."}`);
      return;
    }

    // Immediately reflect saved marks in local state UI
    setSubmissions((prev) =>
      prev.map((item) =>
        item.id === activeSubmission.id || (item.register_no === activeSubmission.register_no)
          ? { ...item, marks: marksValue }
          : item
      )
    );

    alert("Marks saved");
    closeModal();
    await loadSubmissions();
  }

  return (
    <div className="text-slate-800">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-800 shadow-sm">
        <h1 className="mb-4 bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-2xl font-semibold text-transparent">
          Exam Submissions
        </h1>

        <div className="mb-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
              Tab switches: {summary.totalSwitches}
            </span>
            <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
              Suspicious students: {summary.suspiciousStudents}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate(`/faculty/exam-activity/${examId}`)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
            >
              View Activity Audit
            </button>
            <button
              onClick={() => navigate(`/faculty/exam-monitor/${examId}`)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
            >
              Open Live Monitor
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            <div className="h-10 animate-pulse rounded bg-slate-100" />
            <div className="h-10 animate-pulse rounded bg-slate-100" />
          </div>
        ) : !hasSubmissions ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
            No students have submitted this exam yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border border-slate-200 text-sm text-slate-700">
              <thead>
                <tr className="sticky top-0 border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                  <th className="px-3 py-2">Student Name</th>
                  <th className="px-3 py-2">Register No</th>
                  <th className="px-3 py-2">Experiment</th>
                  <th className="px-3 py-2">Submitted Time</th>
                  <th className="px-3 py-2">Tab Switches</th>
                  <th className="px-3 py-2">Marks</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((submission) => (
                  <tr key={submission.id} className="border-b border-slate-100 text-slate-700 transition-colors hover:bg-blue-50/60">
                    <td className="px-3 py-2 text-slate-800">{submission.student_name || "-"}</td>
                    <td className="px-3 py-2 text-slate-800">{submission.register_no || "-"}</td>
                    <td className="px-3 py-2 text-slate-800">
                      {submission.exp_id
                        ? experimentTitles[submission.exp_id] || submission.exp_id
                        : "-"}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {formatDateTime(submission.submitted_at)}
                    </td>
                    <td className="px-3 py-2 text-slate-800">
                      {(() => {
                        const count =
                          tabSwitchByRegister[normalizeRegister(submission.register_no)] || 0;
                        return (
                          <div className="flex items-center gap-2">
                            <span>{count}</span>
                            {count > 3 ? (
                              <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                                Suspicious
                              </span>
                            ) : null}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2 text-slate-800">{submission.marks ?? "-"}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => openSubmission(submission)}
                        className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-blue-700 transition hover:bg-blue-100"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {activeSubmission && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="max-h-[90vh] w-[640px] max-w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-800 shadow-xl">
            <h2 className="mb-4 text-xl font-semibold text-slate-900">Submission Details</h2>

            {detailLoading ? (
              <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                Loading answers…
              </div>
            ) : null}

            <div className="space-y-3 text-sm text-slate-800">
              <div>
                <p className="font-medium text-slate-700">Aim</p>
                <p className="whitespace-pre-wrap text-slate-800">{activeSubmission.aim?.trim() || "—"}</p>
              </div>
              <div>
                <p className="font-medium text-slate-700">Procedure</p>
                <p className="whitespace-pre-wrap text-slate-800">{activeSubmission.procedure?.trim() || "—"}</p>
              </div>
              <div>
                <p className="font-medium text-slate-700">Program</p>
                <pre className="overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  {activeSubmission.program?.trim() || "—"}
                </pre>
              </div>
              <div>
                <p className="font-medium text-slate-700">Output</p>
                <p className="whitespace-pre-wrap text-slate-800">{activeSubmission.output?.trim() || "—"}</p>
              </div>
              <div>
                <p className="font-medium text-slate-700">Result</p>
                <p className="whitespace-pre-wrap text-slate-800">{activeSubmission.result?.trim() || "—"}</p>
              </div>
            </div>

            <div className="mt-5">
              <input
                type="number"
                min={0}
                max={100}
                value={marksInput}
                onChange={(e) => setMarksInput(e.target.value)}
                className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 placeholder:text-slate-400"
                placeholder="Enter marks (0-100)"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={closeModal}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-100"
                  disabled={saving}
                >
                  Close
                </button>
                <button
                  onClick={saveMarks}
                  className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Marks"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
