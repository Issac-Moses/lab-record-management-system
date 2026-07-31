import { useEffect, useMemo, useState } from "react";
import {
  FlaskConical,
  BookOpen,
  Layers,
  ArrowRight,
  Clock,
  Save,
  Plus,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { formatDateOnly } from "@/lib/dateFormat";
import { sortByExperimentNo } from "@/utils/experimentOrder";
import { shouldHideLegacyNndlExperimentRow } from "@/utils/nndlExperimentFilter";

type ExperimentCatalogRow = {
  id: string;
  title: string;
  experiment_no: string | number | null;
  due_date: string | null;
  description: string | null;
  content_type?: string | null;
};

type ExperimentRow = {
  id: string;
  exp_id: string | null;
  status: string;
  updated_at: string;
  student_id: string | null;
  experiments: { title: string | null; experiment_no: string | number | null; id?: string | null } | null;
  student_name?: string;
  subject_experiment_no?: string | number | null;
  due_date?: string | null;
};

function normalizeStatus(status: unknown): string {
  const value = String(status || "").toLowerCase().trim();
  if (value === "approved" || value === "evaluated") return "evaluated";
  if (value === "submitted") return "submitted";
  if (value === "in_progress") return "in_progress";
  if (value === "draft") return "draft";
  return "draft";
}

function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isFacultyLikeName(value: unknown): boolean {
  const name = String(value || "").trim().toLowerCase();
  if (!name) return true;
  if (/^(mr|mrs|ms|miss|dr|prof|sir)\b/.test(name)) return true;
  if (name.includes("faculty") || name.includes("admin")) return true;
  return false;
}

export default function Experiments() {
  const navigate = useNavigate();
  const subjectId = localStorage.getItem("faculty_subject_id");
  const subjectName = localStorage.getItem("faculty_subject_name");
  const [experiments, setExperiments] = useState<ExperimentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  /** Master list for this subject — editable deadlines (not tied to a single student row). */
  const [catalog, setCatalog] = useState<ExperimentCatalogRow[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [supportsDueDateColumn, setSupportsDueDateColumn] = useState(true);
  const [deadlineDrafts, setDeadlineDrafts] = useState<Record<string, string>>({});
  const [savingDeadlineId, setSavingDeadlineId] = useState<string | null>(null);
  const [deadlineBanner, setDeadlineBanner] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [contentTypeDrafts, setContentTypeDrafts] = useState<Record<string, "code" | "text" | "image" | "mixed">>({});
  const [savingContentTypeId, setSavingContentTypeId] = useState<string | null>(null);

  /** Edit experiment details (title, description, number) — same rows students/admin read from `experiments`. */
  const [editTarget, setEditTarget] = useState<ExperimentCatalogRow | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editExperimentNo, setEditExperimentNo] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editBanner, setEditBanner] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<ExperimentCatalogRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteBanner, setDeleteBanner] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const visibleCatalog = useMemo(
    () => catalog.filter((c) => !shouldHideLegacyNndlExperimentRow(subjectName, c)),
    [catalog, subjectName]
  );

  const visibleExperiments = useMemo(
    () =>
      experiments.filter(
        (e) =>
          !shouldHideLegacyNndlExperimentRow(subjectName, {
            experiment_no: e.subject_experiment_no ?? e.experiments?.experiment_no ?? null,
            title: e.experiments?.title ?? null,
          })
      ),
    [experiments, subjectName]
  );

  useEffect(() => {
    if (!subjectId) {
      setCatalogLoading(false);
      return;
    }
    let alive = true;
    async function loadCatalog() {
      setCatalogLoading(true);
      const selectVariants = [
        "id, title, experiment_no, due_date, description, content_type",
        "id, title, experiment_no, due_date, description",
        "id, title, experiment_no, due_date, content_type",
        "id, title, experiment_no, content_type",
        "id, title, experiment_no, due_date",
        "id, title, experiment_no, description",
        "id, title, experiment_no",
      ];
      let rows: Record<string, unknown>[] = [];
      let hasDue = false;
      let hasDesc = false;
      for (const sel of selectVariants) {
        const res = await supabase
          .from("experiments")
          .select(sel)
          .eq("subject_id", subjectId)
          .order("experiment_no", { ascending: true });
        if (!alive) {
          setCatalogLoading(false);
          return;
        }
        if (!res.error) {
          rows = Array.isArray(res.data) ? res.data : [];
          hasDue = sel.includes("due_date");
          hasDesc = sel.includes("description");
          break;
        }
      }
      setSupportsDueDateColumn(hasDue);
      setCatalog(
        rows.map((r) => ({
          id: String(r.id ?? ""),
          title: String(r.title ?? ""),
          experiment_no: (r.experiment_no as string | number | null) ?? null,
          due_date: hasDue ? ((r.due_date as string | null) ?? null) : null,
          description: hasDesc && r.description != null ? String(r.description) : null,
          content_type: r.content_type != null ? String(r.content_type) : null,
        }))
      );
      const drafts: Record<string, string> = {};
      const typeDrafts: Record<string, "code" | "text" | "image" | "mixed"> = {};
      for (const r of rows) {
        if (hasDue && r.due_date) {
          drafts[String(r.id)] = isoToDatetimeLocal(String(r.due_date));
        }
        const rowType = String((r as { content_type?: string | null }).content_type || "").toLowerCase();
        if (rowType === "code" || rowType === "text" || rowType === "image" || rowType === "mixed") {
          typeDrafts[String(r.id)] = rowType;
        } else {
          typeDrafts[String(r.id)] = "mixed";
        }
      }
      setDeadlineDrafts(drafts);
      setContentTypeDrafts(typeDrafts);
      setCatalogLoading(false);
    }
    void loadCatalog();
    return () => {
      alive = false;
    };
  }, [subjectId, refreshTick]);

  useEffect(() => {
    if (!subjectId) {
      setLoading(false);
      return;
    }

    async function fetchExperiments() {
      setLoading(true);
      try {
        let experimentRows: any[] = [];
        let experimentError: any = null;
        const withDeadline = await supabase
          .from("experiments")
          .select("id, title, experiment_no, due_date")
          .eq("subject_id", subjectId)
          .order("experiment_no", { ascending: true });
        if (!withDeadline.error) {
          experimentRows = Array.isArray(withDeadline.data) ? withDeadline.data : [];
        } else {
          const fallback = await supabase
            .from("experiments")
            .select("id, title, experiment_no")
            .eq("subject_id", subjectId)
            .order("experiment_no", { ascending: true });
          experimentError = fallback.error;
          experimentRows = Array.isArray(fallback.data) ? fallback.data : [];
        }
        if (experimentError) throw experimentError;

        const experimentsById = new Map(
          (experimentRows || []).map((exp: any) => [String(exp.id), exp])
        );
        const experimentIds = (experimentRows || [])
          .map((exp: any) => String(exp.id || "").trim())
          .filter(Boolean);

        if (experimentIds.length === 0) {
          setExperiments([]);
          setLoading(false);
          return;
        }

        const { data: seRows, error: seError } = await supabase
          .from("student_experiments")
          .select("id, experiment_id, student_id, status, submitted_date")
          .in("experiment_id", experimentIds);
        if (seError) throw seError;
        let sourceRows: any[] = Array.isArray(seRows) ? seRows : [];
        let sourceType: "student_experiments" | "submissions" = "student_experiments";

        if (sourceRows.length === 0) {
          const { data: submissionRows, error: submissionError } = await supabase
            .from("submissions")
            .select("id, exp_id, student_id, status, updated_at")
            .in("exp_id", experimentIds);
          if (submissionError) throw submissionError;
          sourceRows = Array.isArray(submissionRows) ? submissionRows : [];
          sourceType = "submissions";
        }

        const studentIds = [...new Set(sourceRows.map((row: any) => String(row.student_id || "").trim()).filter(Boolean))];
        let profileMap = new Map<string, any>();
        if (studentIds.length > 0) {
          const { data: profiles, error: profileError } = await supabase
            .from("profiles")
            .select("id, name, role")
            .in("id", studentIds);
          if (profileError) throw profileError;
          profileMap = new Map(
            (profiles || []).map((p: any) => [String(p.id || ""), p])
          );
        }

        const rows: ExperimentRow[] = sortByExperimentNo(
          sourceRows
          .map((row: any) => {
            const exp = experimentsById.get(
              String(sourceType === "submissions" ? row.exp_id || "" : row.experiment_id || "")
            );
            const profile = profileMap.get(String(row.student_id || ""));
            const studentName = String(profile?.name || "").trim();
            const role = String(profile?.role || "").toLowerCase().trim();
            if (role && role !== "student") return null;
            if (studentName && isFacultyLikeName(studentName)) return null;
            return {
              id: String(row.id || ""),
              exp_id:
                sourceType === "submissions"
                  ? row.exp_id
                    ? String(row.exp_id)
                    : null
                  : row.experiment_id
                  ? String(row.experiment_id)
                  : null,
              status: normalizeStatus(row.status),
              updated_at:
                sourceType === "submissions"
                  ? String(row.updated_at || "")
                  : String(row.submitted_date || ""),
              student_id: row.student_id ? String(row.student_id) : null,
              experiments: exp
                ? {
                    id: String(exp.id || ""),
                    title: String(exp.title || ""),
                    experiment_no: exp.experiment_no ?? null,
                  }
                : null,
              student_name: studentName || undefined,
              subject_experiment_no: exp?.experiment_no ?? null,
              due_date: exp?.due_date ? String(exp.due_date) : null,
            };
          })
          .filter((row): row is ExperimentRow => Boolean(row)),
          (row) => row.subject_experiment_no
        );

        setExperiments(rows);
      } catch (error) {
        console.error(error);
        setExperiments([]);
      } finally {
        setLoading(false);
      }
    }

    fetchExperiments();
  }, [subjectId, refreshTick]);

  async function saveExperimentDeadline(expId: string) {
    const raw = deadlineDrafts[expId] ?? "";
    setSavingDeadlineId(expId);
    setDeadlineBanner(null);
    const isoDueDate = raw.trim() ? new Date(raw).toISOString() : null;
    const payload = { due_date: isoDueDate };

    let success = false;
    let errMessage = "";

    // 1. Direct update to Supabase experiments table
    const directUpdate = await supabase.from("experiments").update(payload).eq("id", expId);
    if (!directUpdate.error) {
      success = true;
    } else {
      errMessage = directUpdate.error.message;
    }

    // 2. Also call backend Service Role endpoint to guarantee persistence
    try {
      const token = await getAccessToken();
      const baseUrl = import.meta.env.VITE_MANUAL_API_URL || "http://localhost:7001";
      const res = await fetch(`${baseUrl}/api/manual/experiments/${subjectId}/${expId}/deadline`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token || ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) success = true;
    } catch (_err) {
      // ignore
    }

    setSavingDeadlineId(null);
    if (!success) {
      setDeadlineBanner({ type: "err", text: errMessage || "Failed to save deadline." });
      return;
    }
    setDeadlineBanner({ type: "ok", text: "Deadline saved successfully!" });
    setCatalog((prev) =>
      prev.map((r) => (String(r.id) === String(expId) ? { ...r, due_date: isoDueDate } : r))
    );
    setRefreshTick((t) => t + 1);
  }

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  }

  async function saveExperimentContentType(expId: string) {
    if (!expId || !subjectId) return;
    const selectedType = contentTypeDrafts[expId] || "mixed";

    setSavingContentTypeId(expId);
    setDeadlineBanner(null);
    let success = false;
    let errMessage = "";

    try {
      // 1. Direct update to Supabase experiments table
      const directUpdate = await supabase
        .from("experiments")
        .update({ content_type: selectedType, updated_at: new Date().toISOString() })
        .eq("id", expId);

      if (!directUpdate.error) {
        success = true;
      } else {
        errMessage = directUpdate.error.message;
      }

      // 2. Call backend Service Role endpoint as well
      const token = await getAccessToken();
      const baseUrl = import.meta.env.VITE_MANUAL_API_URL || "http://localhost:7001";
      const response = await fetch(
        `${baseUrl}/api/manual/experiments/${subjectId}/${expId}/content-type`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token || ""}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content_type: selectedType }),
        }
      );
      if (response.ok) success = true;

      if (!success) {
        throw new Error(errMessage || "Failed to save experiment type");
      }

      setDeadlineBanner({ type: "ok", text: "Experiment template saved successfully!" });
      setCatalog((prev) =>
        prev.map((r) => (String(r.id) === String(expId) ? { ...r, content_type: selectedType } : r))
      );
      setRefreshTick((t) => t + 1);
    } catch (err: any) {
      setDeadlineBanner({ type: "err", text: err?.message || "Unable to save experiment type." });
    } finally {
      setSavingContentTypeId(null);
    }
  }

  function openEditExperiment(exp: ExperimentCatalogRow) {
    setEditTarget(exp);
    setEditTitle(exp.title);
    setEditDescription(exp.description ?? "");
    setEditExperimentNo(
      exp.experiment_no != null && exp.experiment_no !== "" ? String(exp.experiment_no) : ""
    );
    setEditBanner(null);
  }

  async function saveExperimentEdit() {
    if (!editTarget) return;
    const title = editTitle.trim();
    if (!title) {
      setEditBanner({ type: "err", text: "Title is required." });
      return;
    }
    const numRaw = editExperimentNo.trim();
    let experiment_no: number | string | null = null;
    if (numRaw !== "") {
      const n = Number(numRaw);
      if (!Number.isFinite(n)) {
        setEditBanner({ type: "err", text: "Experiment number must be a valid number." });
        return;
      }
      experiment_no = n;
    }
    setSavingEdit(true);
    setEditBanner(null);
    let payload: Record<string, unknown> = {
      title,
      description: editDescription.trim() || null,
      experiment_no,
    };
    let { error } = await supabase.from("experiments").update(payload).eq("id", editTarget.id);
    const errMsg = String(error?.message || "").toLowerCase();
    if (error && (errMsg.includes("description") || errMsg.includes("column"))) {
      payload = { title, experiment_no };
      ({ error } = await supabase.from("experiments").update(payload).eq("id", editTarget.id));
    }
    setSavingEdit(false);
    if (error) {
      setEditBanner({ type: "err", text: error.message });
      return;
    }
    setCatalog((prev) =>
      prev.map((r) =>
        String(r.id) === String(editTarget.id)
          ? {
              ...r,
              title,
              experiment_no,
              description: editDescription.trim() || null,
            }
          : r
      )
    );
    setEditTarget(null);
    setEditBanner(null);
    setDeadlineBanner({
      type: "ok",
      text: "Experiment updated. Students and admins will see the new details after refresh.",
    });
    setRefreshTick((t) => t + 1);
  }

  async function confirmDeleteExperiment() {
    if (!deleteTarget) return;
    const expId = deleteTarget.id;
    setDeleting(true);
    setDeleteBanner(null);

    const childDeletes = [
      () => supabase.from("student_experiments").delete().eq("experiment_id", expId),
      () => supabase.from("submissions").delete().eq("exp_id", expId),
      () => supabase.from("exam_submissions").delete().eq("exp_id", expId),
    ];
    for (const run of childDeletes) {
      const { error } = await run();
      if (error) console.warn("[deleteExperiment] child step:", error.message);
    }

    const { error: delEx } = await supabase.from("experiments").delete().eq("id", expId);
    setDeleting(false);
    if (delEx) {
      setDeleteBanner({
        type: "err",
        text:
          delEx.message ||
          "Delete failed. You may need an admin to remove linked rows, or check Supabase RLS policies for faculty delete.",
      });
      return;
    }
    setDeleteTarget(null);
    setDeleteBanner(null);
    setDeadlineBanner({
      type: "ok",
      text: "Experiment removed. It will disappear for students after they refresh.",
    });
    setRefreshTick((t) => t + 1);
  }

  const submittedCount = visibleExperiments.filter((e) => e.status === "submitted").length;
  const evaluatedCount = visibleExperiments.filter((e) => e.status === "evaluated").length;
  const draftCount = visibleExperiments.filter((e) => e.status === "draft" || e.status === "in_progress").length;

  const statusStyle = (status: string) => {
    if (status === "evaluated")
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (status === "submitted")
      return "bg-blue-50 text-blue-700 border-blue-200";
    if (status === "draft" || status === "in_progress")
      return "bg-amber-50 text-amber-700 border-amber-200";
    return "bg-slate-50 text-slate-600 border-slate-200";
  };

  return (
    <div className="text-slate-800">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="faculty-glass faculty-gradient-ring mb-8 flex flex-col gap-4 rounded-3xl p-6 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-100 p-2.5 ring-1 ring-blue-200">
            <BookOpen className="h-7 w-7 text-blue-600" />
          </div>
          <div>
            <h1 className="bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-3xl font-bold text-transparent md:text-4xl">
              Experiment Submissions
            </h1>
            <p className="mt-1 text-sm text-slate-500">Student submissions grouped by experiment</p>
            {subjectName && (
              <p className="mt-0.5 text-sm text-slate-500">{subjectName}</p>
            )}
          </div>
        </div>
        {subjectId && (
          <button
            type="button"
            onClick={() => navigate("/faculty/add-experiment")}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 shadow-sm transition hover:bg-blue-100"
          >
            <Plus className="h-4 w-4" />
            Add experiment
          </button>
        )}
      </motion.div>

      {!catalogLoading && subjectId && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 rounded-3xl border border-slate-200/90 bg-white/95 p-6 shadow-[0_8px_30px_rgba(15,23,42,0.06)] backdrop-blur-sm md:p-8"
        >
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-xl bg-blue-50 p-2 ring-1 ring-blue-100">
                  <Clock className="h-5 w-5 text-blue-600" />
                </span>
                <h2 className="text-lg font-semibold text-slate-900 md:text-xl">Experiment deadlines</h2>
              </div>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Due dates live in the same style as submission cards below — set or clear anytime. Saving updates
                this list and submission views.
              </p>
            </div>
          </div>

          {visibleCatalog.length > 0 && deadlineBanner ? (
            <div
              className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
                deadlineBanner.type === "ok"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-rose-200 bg-rose-50 text-rose-800"
              }`}
            >
              {deadlineBanner.text}
            </div>
          ) : null}

          {!supportsDueDateColumn ? (
            <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Add{" "}
              <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">due_date</code> to <code>experiments</code>{" "}
              in Supabase to enable deadlines.
            </p>
          ) : null}

          {catalog.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-8 text-center">
              <p className="text-sm font-medium text-slate-800">No experiments in this subject yet</p>
              <p className="mt-1 text-sm text-slate-600">
                Add experiments first — you can set an optional deadline when creating each one, then edit deadlines
                here anytime.
              </p>
              <button
                type="button"
                onClick={() => navigate("/faculty/add-experiment")}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Create experiment
              </button>
            </div>
          ) : null}

          {catalog.length > 0 && visibleCatalog.length === 0 ? (
            <p className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
              No experiments to show here for the current subject (legacy rows may be hidden).
            </p>
          ) : null}

          {catalog.length > 0 && visibleCatalog.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {sortByExperimentNo(visibleCatalog, (r) => r.experiment_no).map((exp, idx) => (
                <motion.div
                  key={exp.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(idx * 0.04, 0.4) }}
                  className="group faculty-surface relative overflow-hidden rounded-2xl border border-slate-200/80 p-5 shadow-sm transition-all hover:-translate-y-1 hover:border-blue-200 hover:shadow-md"
                >
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-50 to-indigo-50 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                  <div className="relative z-10 flex h-full min-h-[200px] flex-col">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                          {exp.experiment_no != null ? `Experiment ${exp.experiment_no}` : "Experiment"}
                        </p>
                        <h3 className="mt-1 line-clamp-3 text-base font-bold leading-snug text-slate-900">
                          {exp.title}
                        </h3>
                        {exp.description ? (
                          <p className="mt-2 line-clamp-2 text-xs text-slate-500">{exp.description}</p>
                        ) : null}
                      </div>
                      <span className="shrink-0 rounded-lg bg-blue-50 p-2 ring-1 ring-blue-100">
                        <Clock className="h-4 w-4 text-blue-600" />
                      </span>
                    </div>

                    <div className="mb-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openEditExperiment(exp)}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-800"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit details
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteTarget(exp);
                          setDeleteBanner(null);
                        }}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    </div>

                    {supportsDueDateColumn ? (
                      <div className="mt-auto space-y-2 border-t border-slate-100 pt-4">
                        <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Experiment Type
                        </label>
                        <div className="flex items-center gap-2">
                          <select
                            value={contentTypeDrafts[exp.id] || "mixed"}
                            onChange={(e) =>
                              setContentTypeDrafts((drafts) => ({
                                ...drafts,
                                [exp.id]: e.target.value as "code" | "text" | "image" | "mixed",
                              }))
                            }
                            className="h-10 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                          >
                            <option value="mixed">Code + Upload</option>
                            <option value="code">Code Only</option>
                            <option value="text">Text / Theory</option>
                            <option value="image">Upload / Virtual Lab</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => void saveExperimentContentType(exp.id)}
                            disabled={savingContentTypeId === exp.id}
                            className="inline-flex h-10 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-60"
                          >
                            {savingContentTypeId === exp.id ? "Saving…" : "Save"}
                          </button>
                        </div>
                        <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Due date &amp; time
                        </label>
                        <input
                          type="datetime-local"
                          value={deadlineDrafts[exp.id] ?? ""}
                          onChange={(e) =>
                            setDeadlineDrafts((d) => ({ ...d, [exp.id]: e.target.value }))
                          }
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                        <button
                          type="button"
                          onClick={() => void saveExperimentDeadline(exp.id)}
                          disabled={savingDeadlineId === exp.id}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:opacity-60"
                        >
                          <Save className="h-4 w-4" />
                          {savingDeadlineId === exp.id ? "Saving…" : "Save deadline"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </motion.div>
              ))}
            </div>
          ) : null}
        </motion.section>
      )}

      {loading ? (
        <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="faculty-shimmer mb-4 h-6 w-48 rounded bg-slate-200" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="faculty-shimmer h-24 rounded-xl bg-slate-100" />
            ))}
          </div>
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="faculty-shimmer h-40 rounded-2xl bg-slate-100" />
            ))}
          </div>
        </div>
      ) : (
        <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <StatCard
          icon={<FlaskConical className="w-8 h-8 text-blue-600" />}
          title="Total"
          value={visibleExperiments.length}
          delay={0.1}
        />
        <StatCard
          icon={<Layers className="w-8 h-8 text-indigo-600" />}
          title="Submitted"
          value={submittedCount}
          delay={0.2}
        />
        <StatCard
          icon={<Layers className="w-8 h-8 text-emerald-400" />}
          title="Evaluated"
          value={evaluatedCount}
          delay={0.3}
        />
        <StatCard
          icon={<Layers className="w-8 h-8 text-amber-500" />}
          title="Drafts"
          value={draftCount}
          delay={0.4}
        />
      </div>

      {/* Cards */}
      {visibleExperiments.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-medium text-slate-800">No submissions</p>
          <p className="mt-1 text-sm text-slate-500">
            No experiment submissions found for this subject yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleExperiments.map((exp, idx) => (
            <motion.div
              key={exp.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + idx * 0.05 }}
              whileHover={{ y: -8, scale: 1.02 }}
              onClick={() => navigate(`/faculty/submission/${exp.id}`)}
              className="group faculty-surface relative cursor-pointer overflow-hidden p-6 transition-all hover:-translate-y-1 hover:border-blue-200 hover:shadow-md"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-indigo-50 opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-3">
                  <h2 className="text-xl font-bold text-slate-900">
                    {exp.experiments?.title ||
                      `Experiment ${
                        exp.subject_experiment_no ? String(exp.subject_experiment_no) : "—"
                      }`}
                  </h2>
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold border capitalize ${statusStyle(exp.status)}`}
                  >
                    {exp.status}
                  </span>
                </div>

                {exp.student_name && (
                  <p className="mb-2 text-sm text-slate-500">
                    {exp.student_name}
                  </p>
                )}

                <p className="mb-3 text-xs text-slate-500">
                  Updated: {formatDateOnly(exp.updated_at)}
                </p>
                <p className="mb-3 text-xs text-slate-500">
                  Deadline: {exp.due_date ? formatDateOnly(exp.due_date) : "-"}
                </p>
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 group-hover:text-blue-800">
                  View Submissions
                  <ArrowRight className="w-4 h-4" />
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
        </>
      )}

      {editTarget ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-exp-title"
        >
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 id="edit-exp-title" className="text-lg font-bold text-slate-900">
                Edit experiment
              </h2>
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {editBanner ? (
              <div
                className={`mb-4 rounded-xl border px-3 py-2 text-sm ${
                  editBanner.type === "ok"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-rose-200 bg-rose-50 text-rose-800"
                }`}
              >
                {editBanner.text}
              </div>
            ) : null}
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Title</label>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Experiment number</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editExperimentNo}
                  onChange={(e) => setEditExperimentNo(e.target.value)}
                  placeholder="e.g. 1"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Description</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={5}
                  className="w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </div>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveExperimentEdit()}
                disabled={savingEdit}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {savingEdit ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900">Remove experiment?</h2>
            <p className="mt-2 text-sm text-slate-600">
              <span className="font-medium text-slate-800">{deleteTarget.title}</span> will be deleted for this
              subject. Linked student progress, submissions, and exam rows for this experiment are removed. This
              cannot be undone.
            </p>
            {deleteBanner?.type === "err" ? (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {deleteBanner.text}
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteBanner(null);
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteExperiment()}
                disabled={deleting}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {deleting ? "Removing…" : "Remove experiment"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatCard({
  icon,
  title,
  value,
  delay = 0,
}: {
  icon: React.ReactNode;
  title: string;
  value: number;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay }}
      whileHover={{ y: -6, scale: 1.02 }}
      className="faculty-surface flex items-center gap-4 p-5 transition-all hover:-translate-y-1 hover:shadow-md"
    >
      <div className="rounded-lg bg-slate-100 p-2">{icon}</div>
      <div>
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <p className="text-3xl font-bold text-slate-900">{value}</p>
      </div>
    </motion.div>
  );
}
