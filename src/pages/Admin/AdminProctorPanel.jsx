import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import ShellCard from "@/components/admin/ShellCard";

function formatDateTime(val) {
  if (!val) return "—";
  const dt = new Date(val);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Proctor monitoring tables — embedded in Admin Reports.
 */
export default function AdminProctorPanel() {
  const [loading, setLoading] = useState(true);
  const [activityLogs, setActivityLogs] = useState([]);
  const [violations, setViolations] = useState([]);
  const [submissions, setSubmissions] = useState([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);

        // 1. Client-side Supabase attempt
        const [logsRes, violRes, subsRes] = await Promise.all([
          supabase
            .from("exam_activity_logs")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(100),
          supabase
            .from("violations")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(100),
          supabase
            .from("exam_submissions")
            .select("*")
            .order("submitted_at", { ascending: false })
            .limit(100),
        ]);

        let rawLogs = logsRes.data || [];
        let rawViolations = violRes.data || [];
        let rawSubmissions = subsRes.data || [];

        // 2. Service Role Backend Fallback if client returns empty
        if (rawLogs.length === 0 && rawViolations.length === 0 && rawSubmissions.length === 0) {
          try {
            const MANUAL_API_BASE_URL = import.meta.env.VITE_MANUAL_API_URL || "http://localhost:7001";
            const res = await fetch(`${MANUAL_API_BASE_URL}/api/manual/admin-proctor-data`);
            const payload = await res.json();
            if (payload?.success && payload?.data) {
              rawLogs = payload.data.activityLogs || [];
              rawViolations = payload.data.violations || [];
              rawSubmissions = payload.data.submissions || [];
            }
          } catch (_err) {
            // ignore network error
          }
        }

        setActivityLogs(rawLogs);
        setViolations(rawViolations);
        setSubmissions(rawSubmissions);
      } catch (error) {
        console.error("Failed loading proctor dashboard:", error);
      } finally {
        setLoading(false);
      }
    };

    void loadData();

    const channel = supabase
      .channel("admin-proctor-panel-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "exam_activity_logs" },
        () => void loadData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "violations" },
        () => void loadData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "exam_submissions" },
        () => void loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Loading proctor data...
      </div>
    );
  }

  // Group activity logs by student register number to show total tab switches
  const candidateMap = new Map();
  activityLogs.forEach((log) => {
    const reg = String(log.register_no || "STUDENT").trim().toUpperCase();
    if (!candidateMap.has(reg)) {
      candidateMap.set(reg, { reg, count: 0, lastEvent: log.created_at || log.timestamp });
    }
    const item = candidateMap.get(reg);
    item.count += 1;
  });

  const candidates = Array.from(candidateMap.values()).sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <ShellCard title={`PROCTOR SUSPICIOUS ACTIVITIES (${activityLogs.length})`} glow="cyan">
          {activityLogs.length === 0 ? (
            <p className="text-sm text-slate-500">No suspicious exam activities recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-600 border-b border-slate-100">
                    <th className="pb-2 pr-2 uppercase text-xs">Register No</th>
                    <th className="pb-2 pr-2 uppercase text-xs">Event</th>
                    <th className="pb-2 pr-2 uppercase text-xs">Details</th>
                    <th className="pb-2 uppercase text-xs">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activityLogs.slice(0, 30).map((row, idx) => (
                    <tr key={row.id || idx} className="hover:bg-slate-50/80">
                      <td className="py-2.5 pr-2 font-bold text-slate-800">{row.register_no || "—"}</td>
                      <td className="py-2.5 pr-2">
                        <span className="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">
                          {row.event || "tab_switch"}
                        </span>
                      </td>
                      <td className="py-2.5 pr-2 text-xs text-slate-600">{row.details || "Tab switch / window hidden"}</td>
                      <td className="py-2.5 text-xs text-slate-500">{formatDateTime(row.created_at || row.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ShellCard>

        <ShellCard title={`CANDIDATE RISK SUMMARY (${candidates.length})`} glow="amber">
          {candidates.length === 0 ? (
            <p className="text-sm text-slate-500">All candidate sessions normal.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-600 border-b border-slate-100">
                    <th className="pb-2 pr-2 uppercase text-xs">Register No</th>
                    <th className="pb-2 pr-2 uppercase text-xs">Tab Switches</th>
                    <th className="pb-2 pr-2 uppercase text-xs">Risk Level</th>
                    <th className="pb-2 uppercase text-xs">Last Activity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {candidates.map((item) => {
                    const risk = item.count > 6 ? "HIGHLY SUSPICIOUS" : item.count > 3 ? "SUSPICIOUS" : "EVALUATING";
                    const badgeClass =
                      item.count > 6
                        ? "bg-rose-100 text-rose-800 border-rose-200"
                        : item.count > 3
                          ? "bg-amber-100 text-amber-800 border-amber-200"
                          : "bg-slate-100 text-slate-700 border-slate-200";

                    return (
                      <tr key={item.reg} className="hover:bg-slate-50/80">
                        <td className="py-2.5 pr-2 font-bold text-slate-900">{item.reg}</td>
                        <td className="py-2.5 pr-2 font-semibold text-rose-700">{item.count} switches</td>
                        <td className="py-2.5 pr-2">
                          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold ${badgeClass}`}>
                            {risk}
                          </span>
                        </td>
                        <td className="py-2.5 text-xs text-slate-500">{formatDateTime(item.lastEvent)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </ShellCard>
      </div>

      <ShellCard title={`RECENT ONLINE EXAM SUBMISSIONS (${submissions.length})`} glow="cyan">
        {submissions.length === 0 ? (
          <p className="text-sm text-slate-500">No exam submissions recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600 border-b border-slate-100">
                  <th className="pb-2 pr-2 uppercase text-xs">Register No</th>
                  <th className="pb-2 pr-2 uppercase text-xs">Student Name</th>
                  <th className="pb-2 pr-2 uppercase text-xs">Submitted At</th>
                  <th className="pb-2 uppercase text-xs">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {submissions.slice(0, 20).map((sub, i) => (
                  <tr key={sub.id || i} className="hover:bg-slate-50/80">
                    <td className="py-2.5 pr-2 font-bold text-slate-800">{sub.register_no || "—"}</td>
                    <td className="py-2.5 pr-2 text-slate-900">{sub.student_name || sub.name || "Student"}</td>
                    <td className="py-2.5 pr-2 text-xs text-slate-500">{formatDateTime(sub.submitted_at || sub.created_at)}</td>
                    <td className="py-2.5">
                      <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                        {sub.status || "Completed"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ShellCard>
    </div>
  );
}
