import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const LOG_SOURCE_STORAGE_KEY = "admin_logs_table_source";

function normalizeLogRow(row) {
  const action =
    row?.action ||
    row?.activity_type ||
    row?.violation_type ||
    row?.event ||
    "Activity";
  const details =
    row?.details ||
    row?.message ||
    row?.description ||
    row?.reason ||
    "—";
  const timestamp = row?.timestamp || row?.created_at || row?.updated_at || null;
  return {
    id: row?.id || `${action}-${timestamp || Math.random()}`,
    action,
    details,
    timestamp,
  };
}

async function fetchLogsFrom(tableName) {
  if (tableName === "admin_activity_logs") {
    const { data, error } = await supabase
      .from("admin_activity_logs")
      .select("id, action, details, timestamp")
      .order("timestamp", { ascending: false })
      .limit(20);
    return { data, error };
  }

  const { data, error } = await supabase
    .from("exam_activity_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);
  return { data, error };
}

export default function ActivityLogsPanel({ refreshKey = 0 }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sourceLabel, setSourceLabel] = useState("Admin");

  useEffect(() => {
    let mounted = true;

    async function loadLogs() {
      setLoading(true);
      setError("");
      try {
        const preferred = localStorage.getItem(LOG_SOURCE_STORAGE_KEY) || "admin_activity_logs";
        const sources =
          preferred === "exam_activity_logs"
            ? ["exam_activity_logs", "admin_activity_logs"]
            : ["admin_activity_logs", "exam_activity_logs"];

        let loadedRows = null;
        let loadedSource = "admin_activity_logs";
        let terminalError = null;

        for (const source of sources) {
          const { data, error: logsError } = await fetchLogsFrom(source);
          if (!logsError) {
            loadedRows = data || [];
            loadedSource = source;
            localStorage.setItem(LOG_SOURCE_STORAGE_KEY, source);
            break;
          }
          terminalError = logsError;
          // Table missing should fail over silently.
          if (logsError?.code === "PGRST205") {
            continue;
          }
        }

        if (!loadedRows) {
          throw terminalError || new Error("No activity log source available");
        }

        if (!mounted) return;
        setLogs(loadedRows.map(normalizeLogRow));
        setSourceLabel(loadedSource === "admin_activity_logs" ? "Admin" : "Exam");
      } catch (loadError) {
        if (!mounted) return;
        setLogs([]);
        setError("Activity logs are unavailable right now.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadLogs();
    return () => {
      mounted = false;
    };
  }, [refreshKey]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Activity Logs</h3>
        <span className="text-[11px] text-slate-500">{sourceLabel} source</span>
      </div>
      {loading ? <p className="text-sm text-slate-500">Loading logs...</p> : null}
      {error ? <p className="text-sm text-amber-800">{error}</p> : null}
      {!loading && !error ? (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-600">
                <th className="p-2">Action</th>
                <th className="p-2">Details</th>
                <th className="p-2">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-2 text-slate-500">
                    No logs found.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="border-t border-slate-100">
                    <td className="p-2 text-slate-900">{log.action || "—"}</td>
                    <td className="p-2 text-slate-600">{log.details || "—"}</td>
                    <td className="p-2 text-slate-500">
                      {log.timestamp ? new Date(log.timestamp).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
