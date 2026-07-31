import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Eye, FileText, PenSquare } from "lucide-react";
import { motion } from "framer-motion";
import {
  getFacultySubmissions,
  resetSubmissionToAi,
  updateSubmissionMarks,
} from "@/services/facultyDataService";
import { formatDateTime } from "@/lib/dateFormat";
import AiEvaluationCard from "@/components/ai/AiEvaluationCard";

function formatAiScoreOutOf10(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "-";
  const normalized = parsed > 10 ? parsed / 10 : parsed;
  return `${Number.isInteger(normalized) ? normalized : normalized.toFixed(1)} / 10`;
}

function safeDownload(content, filename) {
  const blob = new Blob([content || "No output available"], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function FacultySubmissionsPage() {
  const navigate = useNavigate();
  const subjectId = localStorage.getItem("faculty_subject_id");
  const [rows, setRows] = useState([]);
  const [marksInputs, setMarksInputs] = useState({});
  const [savingRowId, setSavingRowId] = useState(null);
  const [recentlyUpdatedRowId, setRecentlyUpdatedRowId] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      const data = await getFacultySubmissions(subjectId);
      if (alive) {
        const safeRows = Array.isArray(data) ? data : [];
        setRows(safeRows);
        setMarksInputs((previous) => {
          const next = { ...previous };
          safeRows.forEach((row) => {
            const key = String(row.id);
            if (!(key in next)) {
              next[key] = row.facultyMarks == null ? "" : String(row.facultyMarks);
            }
          });
          return next;
        });
        setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [subjectId]);

  async function handleSaveMarks(submissionId) {
    const key = String(submissionId);
    setSavingRowId(key);
    setMessage("");
    const result = await updateSubmissionMarks({
      submissionId,
      marks: marksInputs[key],
    });
    if (!result.success) {
      setMessage(result.error || "Failed to save marks.");
      setSavingRowId(null);
      return;
    }

    const data = await getFacultySubmissions(subjectId);
    const safeRows = Array.isArray(data) ? data : [];
    setRows(safeRows);
    setMessage("Marks updated.");
    setRecentlyUpdatedRowId(key);
    window.setTimeout(() => setRecentlyUpdatedRowId((current) => (current === key ? null : current)), 1400);
    setSavingRowId(null);
  }

  async function handleResetToAi(submissionId, aiScore) {
    const key = String(submissionId);
    setSavingRowId(key);
    setMessage("");
    const result = await resetSubmissionToAi({ submissionId, aiScore });
    if (!result.success) {
      setMessage(result.error || "Failed to reset to AI.");
      setSavingRowId(null);
      return;
    }
    const data = await getFacultySubmissions(subjectId);
    const safeRows = Array.isArray(data) ? data : [];
    setRows(safeRows);
    setMarksInputs((previous) => ({
      ...previous,
      [key]: "",
    }));
    setMessage("Reset to AI suggestion.");
    setRecentlyUpdatedRowId(key);
    window.setTimeout(() => setRecentlyUpdatedRowId((current) => (current === key ? null : current)), 1400);
    setSavingRowId(null);
  }

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="h-14 animate-pulse border-b border-slate-200 bg-slate-50" />
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div
                key={`faculty-submissions-skeleton-${idx}`}
                className="h-11 animate-pulse rounded-lg bg-slate-100"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  function normalizeStatus(status) {
    const value = String(status || "").toLowerCase().trim();
    if (value === "approved" || value === "evaluated") return "evaluated";
    if (value === "submitted") return "submitted";
    if (value === "pending") return "pending";
    return "draft";
  }

  function statusBadgeClass(status) {
    const normalized = normalizeStatus(status);
    if (normalized === "evaluated") return "border border-emerald-200 bg-emerald-50 text-emerald-700";
    if (normalized === "submitted") return "border border-blue-200 bg-blue-50 text-blue-700";
    if (normalized === "pending") return "border border-amber-200 bg-amber-50 text-amber-700";
    return "border border-slate-200 bg-slate-50 text-slate-600";
  }

  return (
    <div className="mx-auto w-full max-w-[1280px] text-slate-800">
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-xl bg-blue-100 p-2.5 ring-1 ring-blue-200">
          <FileText className="h-7 w-7 text-blue-600" />
        </div>
        <h1 className="bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-3xl font-bold text-transparent md:text-4xl">
          Submission Review
        </h1>
      </div>

      {message ? (
        <p className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700">
          {message}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-medium text-slate-800">No submissions yet for this experiment.</p>
          <p className="mt-1 text-sm text-slate-500">
            Submissions will appear here once students start submitting records.
          </p>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Student Name</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Register Number</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Experiment</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">AI Score</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Faculty Marks</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Final</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <motion.tr
                  key={row.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    backgroundColor:
                      recentlyUpdatedRowId === String(row.id)
                        ? "rgba(59,130,246,0.10)"
                        : "rgba(255,255,255,1)",
                  }}
                  transition={{ delay: idx * 0.02 }}
                  className="border-t border-slate-100 transition-colors hover:bg-blue-50/60"
                >
                  <td className="px-4 py-3 text-slate-900">{row.studentName || "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{row.registerNumber || "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{row.experiment || "-"}</td>
                  <td className="px-4 py-3 min-w-[180px]">
                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-slate-700">
                        {formatAiScoreOutOf10(row.aiScore)}
                      </div>
                      <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                        AI
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 min-w-[220px]">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="10"
                        step="0.5"
                        value={marksInputs[String(row.id)] ?? ""}
                        onChange={(event) =>
                          setMarksInputs((prev) => ({
                            ...prev,
                            [String(row.id)]: event.target.value,
                          }))
                        }
                        className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveMarks(row.id)}
                        disabled={
                          savingRowId === String(row.id) ||
                          (marksInputs[String(row.id)] ?? "") ===
                            (row.facultyMarks == null ? "" : String(row.facultyMarks))
                        }
                        className="rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition duration-150 hover:-translate-y-0.5 hover:from-emerald-500 hover:to-emerald-600 disabled:opacity-60"
                      >
                        {savingRowId === String(row.id) ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResetToAi(row.id, row.aiScore)}
                        disabled={savingRowId === String(row.id) || !row.isOverridden}
                        className="rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-xs font-semibold text-orange-700 transition hover:bg-orange-100 disabled:opacity-60"
                      >
                        Reset to AI
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">
                        {row.finalMarks == null ? "-" : `${Number(row.finalMarks).toFixed(2)} / 10`}
                      </span>
                      {row.isOverridden ? (
                        <span className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
                          Faculty Override
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                          AI
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-slate-700 transition duration-150 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                        onClick={() => navigate(`/faculty/submission/${row.id}`)}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View Submission
                      </button>
                      <button
                        className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-2.5 py-1.5 text-white shadow-sm transition duration-150 hover:-translate-y-0.5 hover:from-blue-500 hover:to-indigo-500"
                        onClick={() => navigate(`/faculty/submission/${row.id}`)}
                      >
                        <PenSquare className="w-3.5 h-3.5" />
                        Evaluate
                      </button>
                      <button
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-emerald-700 transition duration-150 hover:bg-emerald-100"
                        onClick={() =>
                          safeDownload(row.output, `submission-${row.id}-output.txt`)
                        }
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download Output
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
          </div>
        </motion.div>
      )}
    </div>
  );
}
