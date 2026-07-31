import { useEffect, useState, useCallback } from "react";
import { AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import { Navigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { formatDateTime, formatDateOnly } from "@/lib/dateFormat";
import { useAuth } from "@/context/AuthContext";

type DefaulterRow = {
  key: string;
  studentName: string;
  registerNo: string;
  experimentTitle: string;
  submissionStatus: "NOT_SUBMITTED" | "SUBMITTED" | "LATE";
  dueDate: string | null;
  submittedAt: string | null;
};

function getStatusDisplay(status: string): { label: string; className: string } {
  const normalized = String(status || "").trim().toLowerCase();
  const configs: Record<string, { label: string; className: string }> = {
    not_submitted: {
      label: "Not Submitted",
      className: "bg-rose-50 text-rose-700 border-rose-200",
    },
    late: {
      label: "Late",
      className: "bg-amber-50 text-amber-700 border-amber-200",
    },
    submitted: {
      label: "Submitted",
      className: "bg-blue-50 text-blue-700 border-blue-200",
    },
    evaluated: {
      label: "Evaluated",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
  };
  const config = configs[normalized];
  if (config) return config;
  const label = normalized
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
  return {
    label: label || "Unknown",
    className: "bg-slate-50 text-slate-600 border-slate-200",
  };
}

function StatusBadge({ status }: { status: string }) {
  const { label, className } = getStatusDisplay(status);
  return (
    <span className={`rounded-md px-2 py-1 text-xs font-semibold border ${className}`}>
      {label}
    </span>
  );
}

export default function PendingList() {
  const { user } = useAuth();
  const selectedSubjectId = localStorage.getItem("faculty_subject_id");
  const [rows, setRows] = useState<DefaulterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDefaulters = useCallback(async () => {
    if (!user || !selectedSubjectId) {
      setLoading(false);
      return;
    }

    setError(null);

    try {
      const mappingsRes = await supabase
        .from("student_subjects")
        .select("student_id")
        .eq("subject_id", selectedSubjectId);
      if (mappingsRes.error) {
        console.error("student_subjects query failed:", mappingsRes.error);
        throw new Error("Failed to load student mappings.");
      }

      const mappingRows = Array.isArray(mappingsRes.data) ? mappingsRes.data : [];
      const mappedStudentIds = [...new Set(mappingRows.map((row) => row.student_id).filter(Boolean))];
      if (mappedStudentIds.length === 0) {
        setRows([]);
        return;
      }

      const [profilesRes, experimentsRes, submissionsRes, experimentSubmissionsRes] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("id, name, register_no, role")
            .eq("role", "student")
            .in("id", mappedStudentIds),
          supabase
            .from("experiments")
            .select("id, title, due_date")
            .eq("subject_id", selectedSubjectId),
          supabase
            .from("submissions")
            .select("id, exp_id, student_id, updated_at")
            .eq("subject_id", selectedSubjectId),
          supabase
            .from("experiment_submissions")
            .select("id, experiment_id, student_id, created_at, updated_at")
            .eq("subject_id", selectedSubjectId),
        ]);

      if (experimentsRes.error) {
        console.error("experiments query failed:", experimentsRes.error);
        throw new Error("Failed to load experiments.");
      }

      if (experimentSubmissionsRes.error) {
        console.error("experiment_submissions query failed:", experimentSubmissionsRes.error);
        // Non-fatal: table may not exist in all environments
      }

      const profileMap = new Map(
        (Array.isArray(profilesRes.data) ? profilesRes.data : []).map((row) => [row.id, row])
      );
      const experiments = Array.isArray(experimentsRes.data) ? experimentsRes.data : [];
      const submissions = Array.isArray(submissionsRes.data) ? submissionsRes.data : [];
      const experimentSubmissions = Array.isArray(experimentSubmissionsRes.data)
        ? experimentSubmissionsRes.data
        : [];

      const submissionMap = new Map();
      [...submissions, ...experimentSubmissions].forEach((row) => {
        const experimentId = row.exp_id || row.experiment_id;
        const studentId = row.student_id;
        if (!studentId || !experimentId) return;
        submissionMap.set(`${studentId}::${experimentId}`, row);
      });

      const computedRows: DefaulterRow[] = [];
      mappedStudentIds.forEach((studentId) => {
        const profile = profileMap.get(studentId);
        experiments.forEach((exp) => {
          const key = `${studentId}::${exp.id}`;
          const submission = submissionMap.get(key);
          const dueDate = exp?.due_date ? new Date(exp.due_date) : null;
          const submittedAtRaw = submission?.created_at || submission?.updated_at || null;
          const createdAt = submittedAtRaw ? new Date(submittedAtRaw) : null;
          let status: DefaulterRow["submissionStatus"] = "NOT_SUBMITTED";
          if (createdAt) {
            status = dueDate && createdAt.getTime() > dueDate.getTime() ? "LATE" : "SUBMITTED";
          }

          computedRows.push({
            key,
            studentName:
              String(profile?.name || "").trim() || `Student ${String(studentId).slice(0, 8)}`,
            registerNo: String(profile?.register_no || "").trim() || "-",
            experimentTitle: String(exp?.title || "Experiment").trim(),
            submissionStatus: status,
            dueDate: exp?.due_date || null,
            submittedAt: submittedAtRaw,
          });
        });
      });

      setRows(computedRows);
    } catch (err) {
      console.error("Defaulters fetch failed:", err);
      setError(err instanceof Error ? err.message : "Failed to load defaulters. Please try again.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [user, selectedSubjectId]);

  useEffect(() => {
    loadDefaulters();
  }, [loadDefaulters]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 h-6 w-48 animate-pulse rounded bg-slate-200" />
        <div className="space-y-3">
          <div className="h-10 animate-pulse rounded bg-slate-100" />
          <div className="h-10 animate-pulse rounded bg-slate-100" />
          <div className="h-10 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
    );
  }
  if (!selectedSubjectId) return <Navigate to="/faculty/subjects" replace />;

  if (error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
          <p className="mb-4 text-rose-700">{error}</p>
          <button
            onClick={() => { setError(null); setLoading(true); loadDefaulters(); }}
            className="rounded-lg border border-rose-200 bg-white px-4 py-2 text-rose-700 hover:bg-rose-100"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="text-slate-800">
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-medium text-slate-800">No defaulters for this subject.</p>
          <p className="mt-1 text-sm text-slate-500">All mapped submissions are currently on track.</p>
        </div>
      ) : (
        <>
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 mb-8"
          >
            <div className="rounded-xl bg-amber-100 p-2.5">
              <AlertTriangle className="w-7 h-7 text-amber-600" />
            </div>
            <h1 className="bg-gradient-to-r from-amber-600 to-indigo-600 bg-clip-text text-3xl font-bold text-transparent md:text-4xl">
              Defaulters & Late Submissions ({rows.length})
            </h1>
          </motion.div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-3">Student Name</th>
                  <th className="text-left px-4 py-3">Register No</th>
                  <th className="text-left px-4 py-3">Experiment</th>
                  <th className="text-left px-4 py-3">Due Date</th>
                  <th className="text-left px-4 py-3">Submitted At</th>
                  <th className="text-left px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <motion.tr
                    key={row.key}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.02 }}
                    className="border-t border-slate-100 transition-colors hover:bg-blue-50/60"
                  >
                    <td className="px-4 py-3 text-slate-900">{row.studentName}</td>
                    <td className="px-4 py-3 text-slate-700">{row.registerNo}</td>
                    <td className="px-4 py-3 text-slate-700">{row.experimentTitle}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatDateOnly(row.dueDate)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatDateTime(row.submittedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.submissionStatus} />
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
