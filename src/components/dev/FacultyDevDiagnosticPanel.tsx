import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Cpu,
  Database,
  Radio,
  ShieldCheck,
  Terminal,
  UserCheck,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export interface FacultyDevDiagnosticProps {
  submissionId?: string | null;
  experimentId?: string | null;
  studentId?: string | null;
  databaseStatus: "Loaded" | "Loading" | "Failed" | "Fallback";
  databaseError?: string | null;
  executionSnapshotStatus: "Loaded" | "Missing" | "Fallback" | "Failed";
  executionSnapshotNote?: string | null;
  dockerStatus: "Connected" | "Checking" | "Failed" | "Timeout";
  dockerError?: string | null;
  verificationStatus: "Idle" | "Executing" | "Passed" | "Failed" | "Warn";
  verificationNote?: string | null;
  realtimeStatus: "Connected" | "Connecting" | "Disconnected" | "Error";
  rlsStatus: "Passed" | "Failed" | "Warning";
  rlsNote?: string | null;
}

export default function FacultyDevDiagnosticPanel({
  submissionId,
  experimentId,
  studentId,
  databaseStatus,
  databaseError,
  executionSnapshotStatus,
  executionSnapshotNote,
  dockerStatus,
  dockerError,
  verificationStatus,
  verificationNote,
  realtimeStatus,
  rlsStatus,
  rlsNote,
}: FacultyDevDiagnosticProps) {
  const { user, role } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [isDev, setIsDev] = useState(false);

  useEffect(() => {
    const devMode =
      import.meta.env.DEV ||
      localStorage.getItem("enable_dev_diagnostics") === "true" ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";
    setIsDev(Boolean(devMode));
  }, []);

  if (!isDev) return null;

  const getStatusIcon = (
    status:
      | "Loaded"
      | "Connected"
      | "Passed"
      | "Idle"
      | "Loading"
      | "Executing"
      | "Connecting"
      | "Checking"
      | "Failed"
      | "Missing"
      | "Timeout"
      | "Warn"
      | "Warning"
      | "Fallback"
      | "Disconnected"
      | "Error"
  ) => {
    switch (status) {
      case "Loaded":
      case "Connected":
      case "Passed":
        return <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />;
      case "Warn":
      case "Warning":
      case "Fallback":
        return <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />;
      case "Loading":
      case "Executing":
      case "Connecting":
      case "Checking":
      case "Idle":
        return <CheckCircle2 className="h-4 w-4 text-sky-400 shrink-0" />;
      case "Failed":
      case "Missing":
      case "Timeout":
      case "Disconnected":
      case "Error":
      default:
        return <XCircle className="h-4 w-4 text-rose-400 shrink-0" />;
    }
  };

  return (
    <div className="my-6 rounded-2xl border border-slate-700/60 bg-slate-950/90 p-4 text-slate-100 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/40">
            <Terminal className="h-3.5 w-3.5" />
          </span>
          <span className="text-sm font-bold uppercase tracking-wider text-indigo-300">
            Faculty Submission Diagnostics
          </span>
          <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-400 border border-indigo-500/30">
            DEV MODE
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
        >
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>

      {!collapsed && (
        <div className="mt-4 space-y-4 text-xs font-mono">
          {/* Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-slate-800/80 bg-slate-900/60 p-3">
            <div>
              <span className="block text-[10px] text-slate-500 uppercase">Submission ID</span>
              <span className="font-semibold text-slate-200 truncate block">
                {submissionId || "N/A"}
              </span>
            </div>
            <div>
              <span className="block text-[10px] text-slate-500 uppercase">Experiment ID</span>
              <span className="font-semibold text-slate-200 truncate block">
                {experimentId || "N/A"}
              </span>
            </div>
            <div>
              <span className="block text-[10px] text-slate-500 uppercase">Student ID</span>
              <span className="font-semibold text-slate-200 truncate block">
                {studentId || "N/A"}
              </span>
            </div>
          </div>

          {/* Diagnostics Rows */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Database Status */}
            <div className="flex flex-col justify-between rounded-xl border border-slate-800/80 bg-slate-900/40 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-300 font-medium">
                  <Database className="h-3.5 w-3.5 text-slate-400" />
                  Database Status
                </span>
                <span className="flex items-center gap-1">
                  {getStatusIcon(databaseStatus)}
                  <span className="font-bold">{databaseStatus}</span>
                </span>
              </div>
              {databaseError && (
                <div className="text-[11px] text-rose-400 bg-rose-950/40 p-1.5 rounded border border-rose-900/50">
                  {databaseError}
                </div>
              )}
            </div>

            {/* Execution Snapshot */}
            <div className="flex flex-col justify-between rounded-xl border border-slate-800/80 bg-slate-900/40 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-300 font-medium">
                  <Cpu className="h-3.5 w-3.5 text-slate-400" />
                  Execution Snapshot
                </span>
                <span className="flex items-center gap-1">
                  {getStatusIcon(executionSnapshotStatus)}
                  <span className="font-bold">{executionSnapshotStatus}</span>
                </span>
              </div>
              {executionSnapshotNote && (
                <div className="text-[11px] text-amber-300/90 bg-amber-950/30 p-1.5 rounded border border-amber-900/40">
                  {executionSnapshotNote}
                </div>
              )}
            </div>

            {/* Docker Status */}
            <div className="flex flex-col justify-between rounded-xl border border-slate-800/80 bg-slate-900/40 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-300 font-medium">
                  <Terminal className="h-3.5 w-3.5 text-slate-400" />
                  Docker Status
                </span>
                <span className="flex items-center gap-1">
                  {getStatusIcon(dockerStatus)}
                  <span className="font-bold">{dockerStatus}</span>
                </span>
              </div>
              {dockerError && (
                <div className="text-[11px] text-rose-400 bg-rose-950/40 p-1.5 rounded border border-rose-900/50">
                  {dockerError}
                </div>
              )}
            </div>

            {/* Verification Status */}
            <div className="flex flex-col justify-between rounded-xl border border-slate-800/80 bg-slate-900/40 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-300 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5 text-slate-400" />
                  Verification Status
                </span>
                <span className="flex items-center gap-1">
                  {getStatusIcon(verificationStatus)}
                  <span className="font-bold">{verificationStatus}</span>
                </span>
              </div>
              {verificationNote && (
                <div className="text-[11px] text-slate-400 bg-slate-950/60 p-1.5 rounded border border-slate-800">
                  {verificationNote}
                </div>
              )}
            </div>

            {/* Realtime Status */}
            <div className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-900/40 p-3">
              <span className="flex items-center gap-1.5 text-slate-300 font-medium">
                <Radio className="h-3.5 w-3.5 text-slate-400" />
                Realtime
              </span>
              <span className="flex items-center gap-1">
                {getStatusIcon(realtimeStatus)}
                <span className="font-bold">{realtimeStatus}</span>
              </span>
            </div>

            {/* Session Status */}
            <div className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-900/40 p-3">
              <span className="flex items-center gap-1.5 text-slate-300 font-medium">
                <UserCheck className="h-3.5 w-3.5 text-slate-400" />
                Session / Role
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span className="font-bold">
                  {user ? "Authenticated" : "Unauthenticated"} ({role || "None"})
                </span>
              </span>
            </div>

            {/* RLS Status */}
            <div className="col-span-1 md:col-span-2 flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-900/40 p-3">
              <span className="flex items-center gap-1.5 text-slate-300 font-medium">
                <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
                RLS Protection & Access Control
              </span>
              <div className="flex items-center gap-2">
                {rlsNote && <span className="text-[11px] text-slate-400">{rlsNote}</span>}
                <span className="flex items-center gap-1">
                  {getStatusIcon(rlsStatus)}
                  <span className="font-bold">{rlsStatus}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
