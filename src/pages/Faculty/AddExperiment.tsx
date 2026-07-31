import { useMemo, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  PlusCircle,
  ArrowLeft,
  CheckCircle,
  Upload,
  FileSpreadsheet,
  Download,
  Loader2,
} from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import {
  parseExperimentFile,
  validateBulkExperimentRows,
  bulkInsertExperiments,
  EXPERIMENTS_BULK_TEMPLATE_CSV,
  type BulkExperimentRow,
} from "@/services/experimentBulkService";

export default function AddExperiment() {
  const navigate = useNavigate();
  const subjectId = localStorage.getItem("faculty_subject_id");
  const subjectName = localStorage.getItem("faculty_subject_name");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Bulk upload (CSV / XLSX) */
  const [bulkRows, setBulkRows] = useState<BulkExperimentRow[]>([]);
  const [bulkParseErrors, setBulkParseErrors] = useState<string | null>(null);
  const [bulkRowErrors, setBulkRowErrors] = useState<{ rowNumber: number; message: string }[]>([]);
  const [bulkParsing, setBulkParsing] = useState(false);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    success: number;
    failed: number;
    errors: { rowNumber: number; message: string }[];
  } | null>(null);

  const bulkPreview = useMemo(() => bulkRows.slice(0, 25), [bulkRows]);

  const handleSubmit = async () => {
    if (!title || !description) {
      setError("Title and description are required.");
      return;
    }
    if (!subjectId) {
      setError("No subject selected. Please select a subject first.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Not authenticated.");
      setLoading(false);
      return;
    }

    const payload = {
      title,
      description,
      subject_id: subjectId,
      created_by: user.id,
      status: "draft",
      due_date: dueDate ? new Date(dueDate).toISOString() : null,
    };
    let insertError: { message?: string } | null = null;
    const firstAttempt = await supabase.from("experiments").insert(payload);
    if (firstAttempt.error) {
      const blob = JSON.stringify(firstAttempt.error || {}).toLowerCase();
      if (blob.includes("due_date") && (blob.includes("does not exist") || blob.includes("column"))) {
        const fallbackAttempt = await supabase.from("experiments").insert({
          title,
          description,
          subject_id: subjectId,
          created_by: user.id,
          status: "draft",
        });
        insertError = fallbackAttempt.error;
      } else {
        insertError = firstAttempt.error;
      }
    }

    setLoading(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setSuccess(true);
    setTitle("");
    setDescription("");
    setDueDate("");
  };

  function downloadBulkTemplate() {
    const blob = new Blob([EXPERIMENTS_BULK_TEMPLATE_CSV], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "experiments_bulk_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleBulkFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBulkParsing(true);
    setBulkParseErrors(null);
    setBulkRowErrors([]);
    setBulkResult(null);
    setBulkRows([]);
    try {
      const parsed = await parseExperimentFile(file);
      const { valid, rowErrors } = validateBulkExperimentRows(parsed);
      setBulkRows(valid);
      setBulkRowErrors(rowErrors);
      if (parsed.length === 0) {
        setBulkParseErrors("No data rows found. Check the file format and column headers.");
      }
    } catch (e) {
      setBulkParseErrors(e instanceof Error ? e.message : "Failed to parse file.");
    } finally {
      setBulkParsing(false);
      event.target.value = "";
    }
  }

  async function handleBulkImport() {
    if (!subjectId) {
      setBulkParseErrors("No subject selected. Please select a subject first.");
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBulkParseErrors("Not authenticated.");
      return;
    }
    if (bulkRows.length === 0) {
      setBulkParseErrors("Upload and validate a file with at least one valid row.");
      return;
    }

    setBulkImporting(true);
    setBulkParseErrors(null);
    setBulkResult(null);
    try {
      const result = await bulkInsertExperiments(bulkRows, subjectId, user.id);
      setBulkResult(result);
      if (result.success > 0 && result.failed === 0) {
        setBulkRows([]);
      }
    } catch (e) {
      setBulkParseErrors(e instanceof Error ? e.message : "Bulk import failed.");
    } finally {
      setBulkImporting(false);
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-3xl p-6 md:p-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 mb-8"
      >
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate(-1)}
          className="rounded-lg border border-slate-300 bg-white p-2 text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
        >
          <ArrowLeft className="w-4 h-4" />
        </motion.button>
        <div>
          <h1 className="flex items-center gap-2 bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-2xl font-bold text-transparent md:text-3xl">
            <PlusCircle className="w-7 h-7 text-blue-600" />
            Create New Experiment
          </h1>
          {subjectName && (
            <p className="mt-0.5 text-sm text-slate-500">{subjectName}</p>
          )}
        </div>
      </motion.div>

      {/* Success Message */}
      {success && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700"
        >
          <CheckCircle className="w-5 h-5" />
          <span className="text-sm font-medium">
            Experiment created successfully!
          </span>
        </motion.div>
      )}

      {/* Error Message */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
        >
          {error}
        </motion.div>
      )}

      {/* Form */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        {/* Title */}
        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            Experiment Title
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter experiment title"
            className="w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900 placeholder:text-slate-500 transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        {/* Subject (read-only from selected) */}
        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            Subject
          </label>
          <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            {subjectName || "No subject selected"}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            Experiment Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder="Enter full experiment instructions..."
            className="w-full resize-none rounded-xl border border-slate-300 bg-white p-3 text-slate-900 placeholder:text-slate-500 transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            Deadline (optional)
          </label>
          <input
            type="datetime-local"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full max-w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900 transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          <p className="mt-2 text-xs text-slate-500">
            Leave blank if unsure — you can set or change the deadline anytime under{" "}
            <span className="font-medium text-slate-600">Faculty → Experiments</span> (Experiment
            deadlines).
          </p>
        </div>

        {/* Submit */}
        <div className="flex justify-end">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleSubmit}
            disabled={loading}
            className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 font-semibold text-white shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:from-blue-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Experiment"}
          </motion.button>
        </div>
      </motion.div>

      {/* Bulk upload — same page, same subject */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mt-10 space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-indigo-600" />
            <div>
              <h2 className="text-lg font-bold text-slate-900">Bulk upload experiments</h2>
              <p className="text-sm text-slate-500">
                Add many experiments from a CSV or Excel file (same subject as above).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={downloadBulkTemplate}
            className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            <Download className="h-4 w-4" />
            Download sample CSV
          </button>
        </div>

        <p className="text-xs text-slate-600">
          Required columns: <code className="rounded bg-slate-100 px-1">title</code>,{" "}
          <code className="rounded bg-slate-100 px-1">description</code>. Optional:{" "}
          <code className="rounded bg-slate-100 px-1">experiment_no</code>,{" "}
          <code className="rounded bg-slate-100 px-1">due_date</code> (ISO date or datetime).
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/50 px-4 py-3 text-sm font-semibold text-indigo-800 hover:bg-indigo-50">
            <Upload className="h-4 w-4 shrink-0" />
            <span>Choose CSV / XLSX</span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.xlsm,.xlsb,.ods,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={handleBulkFileChange}
              disabled={bulkParsing || bulkImporting}
            />
          </label>
          {bulkParsing ? (
            <span className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Parsing…
            </span>
          ) : null}
        </div>

        {bulkParseErrors ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {bulkParseErrors}
          </div>
        ) : null}

        {bulkRowErrors.length > 0 ? (
          <div className="max-h-32 overflow-auto rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            {bulkRowErrors.slice(0, 15).map((e) => (
              <p key={`${e.rowNumber}-${e.message}`}>
                Row {e.rowNumber}: {e.message}
              </p>
            ))}
            {bulkRowErrors.length > 15 ? (
              <p className="mt-1 font-medium">…and {bulkRowErrors.length - 15} more</p>
            ) : null}
          </div>
        ) : null}

        {bulkPreview.length > 0 ? (
          <div className="overflow-auto rounded-xl border border-slate-200 bg-slate-50">
            <table className="w-full min-w-[32rem] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
                  <th className="p-2 font-semibold">#</th>
                  <th className="p-2 font-semibold">Exp. no</th>
                  <th className="p-2 font-semibold">Title</th>
                  <th className="p-2 font-semibold">Description</th>
                  <th className="p-2 font-semibold">Due</th>
                </tr>
              </thead>
              <tbody>
                {bulkPreview.map((r) => (
                  <tr key={`${r.rowNumber}-${r.title}`} className="border-t border-slate-100">
                    <td className="p-2 text-slate-500">{r.rowNumber}</td>
                    <td className="p-2 text-slate-800">{r.experiment_no ?? "—"}</td>
                    <td className="p-2 font-medium text-slate-900">{r.title}</td>
                    <td className="p-2 text-slate-600 line-clamp-2 max-w-[12rem]">{r.description}</td>
                    <td className="p-2 text-slate-600">{r.due_date ? r.due_date.slice(0, 10) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {bulkRows.length > 25 ? (
              <p className="border-t border-slate-200 bg-white p-2 text-center text-xs text-slate-500">
                Showing 25 of {bulkRows.length} rows
              </p>
            ) : null}
          </div>
        ) : null}

        {bulkResult ? (
          <div
            className={`rounded-xl border p-4 text-sm ${
              bulkResult.failed === 0
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-950"
            }`}
          >
            <p className="font-semibold">
              Imported {bulkResult.success} experiment{bulkResult.success === 1 ? "" : "s"}
              {bulkResult.failed > 0 ? `, ${bulkResult.failed} failed` : ""}.
            </p>
            {bulkResult.errors.length > 0 ? (
              <ul className="mt-2 max-h-28 list-inside list-disc overflow-auto text-xs">
                {bulkResult.errors.slice(0, 12).map((e) => (
                  <li key={`${e.rowNumber}-${e.message}`}>
                    Row {e.rowNumber}: {e.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="flex justify-end">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            onClick={() => void handleBulkImport()}
            disabled={bulkImporting || bulkRows.length === 0 || !subjectId}
            className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3 font-semibold text-white shadow-sm transition-all duration-150 hover:from-indigo-500 hover:to-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {bulkImporting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Importing…
              </span>
            ) : (
              "Import all valid rows"
            )}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
