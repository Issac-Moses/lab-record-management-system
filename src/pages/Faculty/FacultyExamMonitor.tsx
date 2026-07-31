import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";
import { Activity, AlertTriangle, ArrowLeft, CheckCircle2, Users } from "lucide-react";

type SubmissionRow = {
  register_no: string | null;
  submitted_at: string | null;
  marks: number | null;
};

type ActivityRow = {
  register_no: string | null;
  event: string | null;
};

type MonitorRow = {
  registerNo: string;
  submitted: boolean;
  violations: number;
  isSessionOnly?: boolean;
};

function normalizeRegister(value: string | null | undefined) {
  return (value || "").trim().toUpperCase();
}

function isTabSwitchLikeEvent(event: string | null | undefined) {
  const e = String(event || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return e === "tab_switch" || e === "switch_tab" || e === "visibility_hidden";
}

export default function FacultyExamMonitor() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const selectedSubjectId = localStorage.getItem("faculty_subject_id");

  const [rows, setRows] = useState<MonitorRow[]>([]);
  const [joinedSessionsCount, setJoinedSessionsCount] = useState(0);
  const [tabSwitchEventsCount, setTabSwitchEventsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const violationsUnsupportedRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (!examId) {
      setRows([]);
      setLoading(false);
      return;
    }

    const { data: examMeta } = await supabase
      .from("exams")
      .select("subject_id")
      .eq("id", examId)
      .maybeSingle();

    if (examMeta?.subject_id) {
      localStorage.setItem("faculty_subject_id", examMeta.subject_id);
    }

    const [submissionRes, activityRes, sessionsRes] = await Promise.all([
      supabase
        .from("exam_submissions")
        .select("register_no, submitted_at, marks")
        .eq("exam_id", examId),
      supabase
        .from("exam_activity_logs")
        .select("register_no, event")
        .eq("exam_id", examId),
      supabase
        .from("exam_sessions")
        .select("id, student_id")
        .eq("exam_id", examId),
    ]);

    if (submissionRes.error || activityRes.error) {
      setRows([]);
      setLoading(false);
      return;
    }

    const submissions = (submissionRes.data || []) as SubmissionRow[];
    const activity = (activityRes.data || []) as ActivityRow[];
    const sessions = (sessionsRes.data || []) as Array<{ id: string; student_id: string | null }>;

    const allRegisters = new Set<string>();
    submissions.forEach((item) => {
      const key = normalizeRegister(item.register_no);
      if (key) allRegisters.add(key);
    });
    activity.forEach((item) => {
      const key = normalizeRegister(item.register_no);
      if (key) allRegisters.add(key);
    });

    const submittedSet = new Set(
      submissions
        .filter((item) => Boolean(normalizeRegister(item.register_no)))
        .map((item) => normalizeRegister(item.register_no))
    );

    const tabSwitchByRegister = activity.reduce<Record<string, number>>((acc, item) => {
      if (!item.register_no || !isTabSwitchLikeEvent(item.event)) return acc;
      const key = normalizeRegister(item.register_no);
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    let tabSwitchCountFromActivity = activity.filter((item) => isTabSwitchLikeEvent(item.event)).length;


    let tabSwitchCountFromViolations = 0;
    let regByStudent = new Map<string, string>();

    // Fallback: If client-side query returned empty (due to Supabase RLS), query service role backend API
    if (allRegisters.size === 0) {
      try {
        const MANUAL_API_BASE_URL = import.meta.env.VITE_MANUAL_API_URL || "http://localhost:7001";
        const res = await fetch(`${MANUAL_API_BASE_URL}/api/manual/exam-data/${examId}`);
        const payload = await res.json();
        if (payload?.success && Array.isArray(payload?.data?.activity_logs)) {
          payload.data.activity_logs.forEach((item: any) => {
            const key = normalizeRegister(item.register_no);
            if (key) {
              allRegisters.add(key);
              tabSwitchByRegister[key] = (tabSwitchByRegister[key] || 0) + 1;
              tabSwitchCountFromActivity += 1;
            }
          });
        }
      } catch (_err) {
        // ignore network error
      }
    }

    // Merge violations table events (proctor flow).
    if (!sessionsRes.error) {
      const sessionIds = sessions.map((row) => String(row.id || "").trim()).filter(Boolean);
      const studentIds = sessions.map((row) => String(row.student_id || "").trim()).filter(Boolean);
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
              const reg = regByStudent.get(studentId) || "";
              const participantKey = reg || `SESSION-${studentId.slice(0, 8).toUpperCase()}`;
              tabSwitchByRegister[participantKey] = (tabSwitchByRegister[participantKey] || 0) + 1;
              allRegisters.add(participantKey);
              tabSwitchCountFromViolations += 1;
            }
          );
        }
      }
    }

    // Ensure joined sessions are visible even before any submission/activity is logged.
    if (!sessionsRes.error) {
      sessions.forEach((row) => {
        const sid = String(row.student_id || "").trim();
        if (!sid) return;
        const reg = regByStudent.get(sid) || "";
        const participantKey = reg || `SESSION-${sid.slice(0, 8).toUpperCase()}`;
        allRegisters.add(participantKey);
      });
    }

    const nextRows = Array.from(allRegisters)
      .sort((a, b) => a.localeCompare(b))
      .map((registerNo) => ({
        registerNo: registerNo.startsWith("SESSION-") ? `Joined (${registerNo})` : registerNo,
        submitted: submittedSet.has(registerNo),
        violations: tabSwitchByRegister[registerNo] || 0,
        isSessionOnly: registerNo.startsWith("SESSION-"),
      }));

    setRows(nextRows);
    setJoinedSessionsCount(new Set(sessions.map((row) => String(row.student_id || "").trim()).filter(Boolean)).size);
    setTabSwitchEventsCount(tabSwitchCountFromActivity + tabSwitchCountFromViolations);
    setLoading(false);
  }, [examId, navigate, selectedSubjectId]);

  useEffect(() => {
    setLoading(true);
    void fetchData();
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void fetchData();
    }, 5000);

    return () => window.clearInterval(timer);
  }, [fetchData]);

  useEffect(() => {
    if (!examId) return;

    const activityChannel = supabase
      .channel(`faculty_exam_monitor_activity_${examId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "exam_activity_logs",
          filter: `exam_id=eq.${examId}`,
        },
        () => {
          void fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(activityChannel);
    };
  }, [examId, fetchData]);

  const summary = useMemo(() => {
    const totalStudents = rows.length;
    const submittedCount = rows.filter((row) => row.submitted).length;
    const suspiciousCount = rows.filter((row) => row.violations > 3).length;
    return { totalStudents, submittedCount, suspiciousCount };
  }, [rows]);

  return (
    <div className="text-slate-800">
      <div className="mb-8 flex items-center justify-between">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3"
        >
          <div className="rounded-xl bg-blue-100 p-2.5 ring-1 ring-blue-200">
            <Activity className="h-7 w-7 text-blue-600" />
          </div>
          <h1 className="bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-3xl font-bold text-transparent md:text-4xl">
            Live Exam Monitor
          </h1>
        </motion.div>
        <button
          onClick={() => navigate(`/faculty/exams/${examId}`)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Submissions
        </button>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-xs uppercase text-slate-500">
            <Users className="w-4 h-4" />
            Total Students
          </div>
          <p className="mt-2 text-3xl font-bold text-slate-900">{summary.totalStudents}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-xs uppercase text-slate-500">
            <CheckCircle2 className="w-4 h-4" />
            Submissions
          </div>
          <p className="mt-2 text-3xl font-bold text-emerald-600">{summary.submittedCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-xs uppercase text-slate-500">
            <AlertTriangle className="w-4 h-4" />
            Suspicious
          </div>
          <p className="mt-2 text-3xl font-bold text-rose-600">{summary.suspiciousCount}</p>
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-blue-700">Joined Sessions</p>
          <p className="mt-1 text-2xl font-bold text-blue-800">{joinedSessionsCount}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-emerald-700">Submitted</p>
          <p className="mt-1 text-2xl font-bold text-emerald-800">{summary.submittedCount}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-amber-700">Tab Switch Events</p>
          <p className="mt-1 text-2xl font-bold text-amber-800">{tabSwitchEventsCount}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {loading ? (
          <div className="space-y-2">
            <div className="h-10 animate-pulse rounded bg-slate-100" />
            <div className="h-10 animate-pulse rounded bg-slate-100" />
          </div>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
            No exam activity yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-slate-700">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="px-3 py-3 font-medium">Register / Participant</th>
                  <th className="px-3 py-3 font-medium">Submitted</th>
                  <th className="px-3 py-3 font-medium">Violations</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.registerNo} className="border-b border-slate-100 last:border-0 transition-colors hover:bg-blue-50/60">
                    <td className="px-3 py-2">{row.registerNo}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          row.submitted
                            ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border border-amber-200 bg-amber-50 text-amber-700"
                        }`}
                      >
                        {row.submitted ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={row.violations > 3 ? "font-semibold text-rose-600" : ""}>
                        {row.violations}
                      </span>
                      {row.violations > 3 ? (
                        <span className="ml-2 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                          Suspicious
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
