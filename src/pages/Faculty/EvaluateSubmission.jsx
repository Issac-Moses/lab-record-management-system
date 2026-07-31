import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, FileText } from "lucide-react";
import {
  getSubmissionForEvaluation,
  saveSubmissionEvaluation,
} from "@/services/facultyDataService";

export default function EvaluateSubmission() {
  const navigate = useNavigate();
  const { id } = useParams();
  const subjectId = localStorage.getItem("faculty_subject_id");
  const facultyId = localStorage.getItem("faculty_id");

  const [submission, setSubmission] = useState(null);
  const [marks, setMarks] = useState("");
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  if (!facultyId) {
    return (
      <div className="mx-auto w-full max-w-[1280px] text-slate-800">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-8 text-center">
          <p className="font-medium text-rose-700">Faculty session not found.</p>
          <button
            onClick={() => navigate("/faculty")}
            className="mt-4 rounded-lg border border-rose-200 bg-white px-4 py-2 text-rose-700 transition hover:bg-rose-100"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      const row = await getSubmissionForEvaluation(id, subjectId);
      if (alive) {
        setSubmission(row);
        setMarks(row?.marks != null ? String(row.marks) : "");
        setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [id, subjectId]);

  async function handleSave() {
    setMessage("");
    setSaving(true);
    try {
      const result = await saveSubmissionEvaluation({
        submissionId: id,
        subjectId,
        facultyId,
        marks,
        feedback,
      });
      if (!result.success) {
        setMessage(result.error || "Failed to save.");
      } else {
        navigate("/faculty/submissions");
      }
    } catch (_error) {
      setMessage("Failed to save. Please retry.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-56 animate-pulse rounded bg-slate-200" />
        <div className="h-60 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm" />
        <div className="h-56 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm" />
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="mx-auto w-full max-w-[1280px] text-slate-800">
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          No submissions yet for this experiment.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1000px] text-slate-800">
      <div className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/faculty/submissions")}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      </div>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 rounded-2xl border border-white/60 bg-gradient-to-br from-blue-50/90 to-indigo-50/90 p-6 shadow-[0_12px_30px_rgba(37,99,235,0.12)] backdrop-blur-sm"
      >
        <h1 className="bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-3xl font-bold text-transparent">
          Evaluate Submission
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Structured review panel for marks and feedback.
        </p>
      </motion.div>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p>
          <span className="text-slate-500">Experiment:</span>{" "}
          {submission.experiment || "Untitled Experiment"}
        </p>
        <p>
          <span className="text-slate-500">Student:</span>{" "}
          {submission.studentName || "Unknown Student"}
        </p>
        <p>
          <span className="text-slate-500">Student code:</span>
        </p>
        <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          {submission.studentCode || "No code available"}
        </pre>
        <p>
          <span className="text-slate-500">Output image/text:</span>
        </p>
        <div className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          {submission.output || "No output available"}
        </div>
        <p>
          <span className="text-slate-500">Result text:</span>{" "}
          {submission.resultText || "No result provided"}
        </p>
      </div>

      <div className="mt-6 space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="block text-sm">
          Marks
          <input
            type="number"
            min="0"
            max="10"
            step="0.5"
            value={marks}
            onChange={(e) => setMarks(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </label>
        <label className="block text-sm">
          Feedback
          <textarea
            rows={4}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            placeholder="Add constructive feedback..."
          />
        </label>
        {message && <p className="text-sm text-rose-700">{message}</p>}
        <div className="flex flex-wrap gap-2">
          <button
            disabled={saving}
            onClick={handleSave}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-white shadow-sm transition duration-150 hover:-translate-y-0.5 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-60"
          >
            <CheckCircle2 className="h-4 w-4" />
            {saving ? "Saving..." : "Save Evaluation"}
          </button>
          <button
            onClick={() => navigate("/faculty/submissions")}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
          >
            <FileText className="h-4 w-4" />
            Back to Submissions
          </button>
        </div>
      </div>
    </div>
  );
}
