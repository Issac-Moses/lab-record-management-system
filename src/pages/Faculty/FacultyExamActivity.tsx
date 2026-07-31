import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { formatDateTime } from "@/lib/dateFormat";

type ExamActivityLog = {
  id: string;
  exam_id: string;
  register_no: string | null;
  event: string | null;
  created_at: string | null;
};

type StudentSummary = {
  registerNo: string;
  tabSwitches: number;
  risk: "Normal" | "Suspicious" | "Highly Suspicious";
};

const getRisk = (tabSwitches: number): StudentSummary["risk"] => {
  if (tabSwitches > 6) return "Highly Suspicious";
  if (tabSwitches > 3) return "Suspicious";
  return "Normal";
};

function normalizeRegister(value: string | null | undefined) {
  return (value || "").trim().toUpperCase();
}

function isTabSwitchLikeEvent(event: string | null | undefined) {
  const e = String(event || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return e === "tab_switch" || e === "switch_tab" || e === "visibility_hidden";
}

export default function FacultyExamActivity() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const selectedSubjectId = localStorage.getItem("faculty_subject_id");
  const [logs, setLogs] = useState<ExamActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const violationsUnsupportedRef = useRef(false);

  const studentSummary = useMemo<StudentSummary[]>(() => {
    const counts = new Map<string, number>();
    for (const log of logs) {
      if (!log.register_no || !isTabSwitchLikeEvent(log.event)) continue;
      const reg = normalizeRegister(log.register_no);
      if (!reg) continue;
      counts.set(reg, (counts.get(reg) || 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([registerNo, tabSwitches]) => ({
        registerNo,
        tabSwitches,
        risk: getRisk(tabSwitches),
      }))
      .sort((a, b) => b.tabSwitches - a.tabSwitches);
  }, [logs]);

  useEffect(() => {
    async function loadLogs() {
      if (!examId) {
        setLogs([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const { data: examMeta } = await supabase
        .from("exams")
        .select("subject_id")
        .eq("id", examId)
        .maybeSingle();

      if (examMeta?.subject_id) {
        localStorage.setItem("faculty_subject_id", examMeta.subject_id);
      }

      const [activityRes, sessionsRes, directViolationsRes] = await Promise.all([
        supabase
          .from("exam_activity_logs")
          .select("*")
          .eq("exam_id", examId)
          .order("created_at", { ascending: false }),
        supabase
          .from("exam_sessions")
          .select("id, student_id")
          .eq("exam_id", examId),
        supabase
          .from("violations")
          .select("*")
          .eq("session_id", examId),
      ]);

      if (activityRes.error) {
        alert(`Failed to load activity logs: ${activityRes.error.message}`);
        setLogs([]);
        setLoading(false);
        return;
      }

      let mergedLogs = [...((activityRes.data || []) as ExamActivityLog[])];

      // Fallback: If client-side query returned empty (due to Supabase RLS), query service role backend API
      if (mergedLogs.length === 0) {
        try {
          const MANUAL_API_BASE_URL = import.meta.env.VITE_MANUAL_API_URL || "http://localhost:7001";
          const res = await fetch(`${MANUAL_API_BASE_URL}/api/manual/exam-data/${examId}`);
          const payload = await res.json();
          if (payload?.success && Array.isArray(payload?.data?.activity_logs)) {
            mergedLogs = payload.data.activity_logs.map((row: any) => ({
              id: String(row.id || Math.random()),
              exam_id: String(row.exam_id || examId),
              register_no: String(row.register_no || "STUDENT"),
              event: String(row.event || "tab_switch"),
              created_at: String(row.created_at || new Date().toISOString()),
            }));
          }
        } catch (_err) {
          // ignore network error
        }
      }

      if (!directViolationsRes.error && Array.isArray(directViolationsRes.data)) {
        directViolationsRes.data.forEach((row: any, index: number) => {
          const vt = String(row.violation_type ?? row.type ?? row.event ?? "").trim().toLowerCase();
          if (vt && vt !== "tab_switch") return;
          const details = String(row.details || "");
          const regMatch = details.match(/\b\d{8,14}\b/);
          const regNo = regMatch ? regMatch[0] : row.register_no || null;
          mergedLogs.push({
            id: `direct-violation-${examId}-${index}`,
            exam_id: examId,
            register_no: regNo ? normalizeRegister(regNo) : "STUDENT",
            event: "tab_switch",
            created_at: String(row.created_at || row.timestamp || new Date().toISOString()),
          });
        });
      }

      if (!sessionsRes.error) {
        const sessions = (sessionsRes.data || []) as Array<{ id: string; student_id: string | null }>;
        const sessionIds = sessions.map((row) => String(row.id || "").trim()).filter(Boolean);
        const studentIds = sessions.map((row) => String(row.student_id || "").trim()).filter(Boolean);

        let regByStudent = new Map<string, string>();
        if (studentIds.length > 0) {
          const profilesRes = await supabase
            .from("profiles")
            .select("id, register_no")
            .in("id", studentIds);
          if (!profilesRes.error) {
            regByStudent = new Map(
              ((profilesRes.data || []) as Array<{ id: string; register_no: string | null }>).map((row) => [
                String(row.id || "").trim(),
                normalizeRegister(row.register_no),
              ])
            );
          }
        }

        if (sessionIds.length > 0 && !violationsUnsupportedRef.current) {
          const violationSelectCandidates = [
            "session_id, violation_type, timestamp",
            "session_id, violation_type, created_at",
            "session_id, type, timestamp",
            "session_id, event, timestamp",
          ];
          let violationsData: Array<{
            session_id: string | null;
            violation_type?: string | null;
            type?: string | null;
            event?: string | null;
            timestamp?: string | null;
            created_at?: string | null;
          }> = [];
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
            violationsData.forEach((row, index) => {
              const vt = String(row.violation_type ?? row.type ?? row.event ?? "")
                .trim()
                .toLowerCase()
                .replace(/[\s-]+/g, "_");
              if (vt !== "tab_switch") return;
              const sid = String(row.session_id || "").trim();
              const studentId = studentBySession.get(sid) || "";
              const registerNo = regByStudent.get(studentId) || "";
              if (!registerNo) return;
              mergedLogs.push({
                id: `violation-${sid}-${index}`,
                exam_id: examId,
                register_no: registerNo,
                event: "tab_switch",
                created_at: String(row.timestamp || row.created_at || ""),
              });
            });
          }
        }
      }

      mergedLogs.sort((a, b) => {
        const ta = new Date(String(a.created_at || 0)).getTime();
        const tb = new Date(String(b.created_at || 0)).getTime();
        return tb - ta;
      });
      setLogs(mergedLogs);
      setLoading(false);
    }

    void loadLogs();

    if (!examId) return;
    const channel = supabase
      .channel(`exam_activity_audit_${examId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "exam_activity_logs", filter: `exam_id=eq.${examId}` },
        () => void loadLogs()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "violations" },
        () => void loadLogs()
      )
      .subscribe();

    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void loadLogs();
    }, 5000);

    return () => {
      window.clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [examId, navigate, selectedSubjectId]);

  return (
    <div className="text-slate-800">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-2xl font-semibold text-transparent">
          Exam Activity Audit
        </h1>
        <button
          onClick={() => navigate(`/faculty/exams/${examId}`)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
        >
          Back to Submissions
        </button>
      </div>

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          Suspicion Summary
        </h2>
        {studentSummary.length === 0 ? (
          <p className="text-sm text-slate-600">No suspicious events found yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-slate-700">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <th className="py-2 pr-4 text-slate-600">Register No</th>
                  <th className="py-2 pr-4 text-slate-600">Tab Switches</th>
                  <th className="py-2 pr-4 text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {studentSummary.map((summary) => (
                  <tr key={summary.registerNo} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4">{summary.registerNo}</td>
                    <td className="py-2 pr-4">{summary.tabSwitches}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          summary.risk === "Highly Suspicious"
                            ? "border border-rose-200 bg-rose-50 text-rose-700"
                            : summary.risk === "Suspicious"
                              ? "border border-amber-200 bg-amber-50 text-amber-700"
                              : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {summary.risk}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          Activity Logs
        </h2>
        {loading ? (
          <div className="space-y-2">
            <div className="h-10 animate-pulse rounded bg-slate-100" />
            <div className="h-10 animate-pulse rounded bg-slate-100" />
          </div>
        ) : logs.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
            No activity logs found.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-slate-700">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <th className="py-2 pr-4 text-slate-600">Student</th>
                  <th className="py-2 pr-4 text-slate-600">Event</th>
                  <th className="py-2 pr-4 text-slate-600">Time</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const isSuspicious = log.event === "tab_switch";
                  return (
                    <tr
                      key={log.id}
                      className={`border-b border-slate-100 last:border-0 ${isSuspicious ? "bg-rose-50" : ""}`}
                    >
                      <td className="py-2 pr-4">{log.register_no || "-"}</td>
                      <td className="py-2 pr-4">{log.event || "-"}</td>
                      <td className="py-2 pr-4">
                        {formatDateTime(log.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
