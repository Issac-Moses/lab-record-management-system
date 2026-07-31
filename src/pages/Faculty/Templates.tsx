import { useCallback, useEffect, useRef, useState } from "react";
import { LayoutTemplate, Plus, Layers, Trash2, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";

type SubjectInfo = {
  id: string;
  name: string;
  code: string | null;
  department: string | null;
};

type Experiment = {
  id: string;
  title: string | null;
  experiment_number?: string | number | null;
};

type ContentType = "code" | "text" | "image" | "mixed";

const MANUAL_API_BASE_URL = import.meta.env.VITE_MANUAL_API_URL || "http://localhost:7001";
const API_TIMEOUT_MS = 8000;

function repairLeadingTitle(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) return "Untitled Experiment";
  const lower = raw.toLowerCase();
  const repairs: Array<[string, string]> = [
    ["evelop ", "Develop "],
    ["esign ", "Design "],
    ["tudy ", "Study "],
    ["mplement ", "Implement "],
    ["reate ", "Create "],
    ["nalyze ", "Analyze "],
    ["uild ", "Build "],
  ];
  for (const [broken, fixed] of repairs) {
    if (lower.startsWith(broken)) {
      return `${fixed}${raw.slice(broken.length)}`;
    }
  }
  return /^[a-z]/.test(raw) ? `${raw.charAt(0).toUpperCase()}${raw.slice(1)}` : raw;
}

export default function Templates() {
  const subjectId = localStorage.getItem("faculty_subject_id");
  const subjectName = localStorage.getItem("faculty_subject_name");

  const [subject, setSubject] = useState<SubjectInfo | null>(null);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [processingJobId, setProcessingJobId] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [contentTypeByExperiment, setContentTypeByExperiment] = useState<Record<string, ContentType>>({});
  const [savingContentTypeByExperiment, setSavingContentTypeByExperiment] = useState<Record<string, boolean>>({});
  const isFetchingRef = useRef(false);

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  }

  async function fetchWithTimeout(url: string, options: RequestInit) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  const fetchData = useCallback(async () => {
    if (!subjectId) {
      setLoading(false);
      return;
    }
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const subjectRes = await supabase
        .from("subjects")
        .select("id, name, code, department")
        .eq("id", subjectId)
        .single();

      if (subjectRes.error) {
        throw new Error(subjectRes.error.message || "Failed to load subject details.");
      }

      if (subjectRes.data) {
        setSubject(subjectRes.data as SubjectInfo);
      }

      const token = await getAccessToken();
      if (!token) {
        setErrorMessage("Session expired. Please login again.");
        setExperiments([]);
        setLoading(false);
        return;
      }

      const response = await fetchWithTimeout(
        `${MANUAL_API_BASE_URL}/api/manual/experiments/${subjectId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setErrorMessage(
          String(payload?.message || payload?.error || "Failed to load extracted experiments.")
        );
        setExperiments([]);
        setLoading(false);
        return;
      }

      const payload = await response.json();
      const list = Array.isArray(payload) ? payload : payload?.data || [];
      setExperiments(list as Experiment[]);
      const nextTypes: Record<string, ContentType> = {};
      await Promise.all(
        (list as Experiment[]).map(async (exp) => {
          try {
            const metaResponse = await fetchWithTimeout(
              `${MANUAL_API_BASE_URL}/api/manual/experiment-meta/${subjectId}/${exp.id}`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            );
            if (!metaResponse.ok) return;
            const metaPayload = await metaResponse.json().catch(() => null);
            const detectedType = String(metaPayload?.data?.content_type || "mixed").toLowerCase();
            if (
              detectedType === "code" ||
              detectedType === "text" ||
              detectedType === "image" ||
              detectedType === "mixed"
            ) {
              nextTypes[exp.id] = detectedType;
            }
          } catch {
            // Keep defaults for cards that fail metadata fetch.
          }
        })
      );
      setContentTypeByExperiment(nextTypes);
      setErrorMessage(null);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setErrorMessage("Request timed out. Please check backend server and try again.");
      } else {
        setErrorMessage(error instanceof Error ? error.message : "Failed to load experiments.");
      }
      setExperiments([]);
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  }, [subjectId]);

  const handleSaveContentType = useCallback(
    async (experimentId: string) => {
      if (!subjectId || !experimentId) return;
      const selectedType = contentTypeByExperiment[experimentId] || "mixed";
      const token = await getAccessToken();
      if (!token) {
        setErrorMessage("Session expired. Please login again.");
        return;
      }

      setSavingContentTypeByExperiment((prev) => ({ ...prev, [experimentId]: true }));
      try {
        const response = await fetchWithTimeout(
          `${MANUAL_API_BASE_URL}/api/manual/experiments/${subjectId}/${experimentId}/content-type`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ content_type: selectedType }),
          }
        );
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(String(payload?.message || payload?.error || "Failed to save content type"));
        }
        setUploadMessage(`Saved content type for experiment #${experimentId.slice(0, 8)}.`);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to save content type.");
      } finally {
        setSavingContentTypeByExperiment((prev) => ({ ...prev, [experimentId]: false }));
      }
    },
    [contentTypeByExperiment, subjectId]
  );

  async function handleManualUpload() {
    if (!subjectId) {
      setErrorMessage("Select a subject before uploading a manual.");
      return;
    }

    if (!selectedFile) {
      setErrorMessage("Please choose a manual file (PDF or image) first.");
      return;
    }

    try {
      setUploading(true);
      setErrorMessage(null);
      setUploadMessage(null);

      const token = await getAccessToken();
      if (!token) {
        setErrorMessage("Session expired. Please login again.");
        return;
      }

      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("subject_id", subjectId);

      const response = await fetchWithTimeout(
        `${MANUAL_API_BASE_URL}/api/manual/upload-async`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || payload?.error || "Failed to upload manual.");
      }

      const payload = await response.json().catch(() => null);
      const jobId = payload?.data?.job_id ? String(payload.data.job_id) : "";
      if (!jobId) {
        throw new Error("Upload accepted but job id missing.");
      }
      setProcessingJobId(jobId);
      setProcessingStatus("queued");
      setUploadMessage("Manual uploaded. Processing in background...");
      setSelectedFile(null);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setErrorMessage("Upload request timed out. Please retry.");
      } else {
        setErrorMessage(error instanceof Error ? error.message : "Manual upload failed.");
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleClearCurrentExperiments() {
    if (!subjectId) {
      setErrorMessage("Select a subject before clearing experiments.");
      return;
    }
    try {
      setClearing(true);
      setErrorMessage(null);
      setUploadMessage(null);

      const token = await getAccessToken();
      if (!token) {
        setErrorMessage("Session expired. Please login again.");
        return;
      }

      const response = await fetchWithTimeout(
        `${MANUAL_API_BASE_URL}/api/manual/experiments/${subjectId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || "Failed to clear current experiments.");
      }

      setUploadMessage("Current subject experiments removed. Upload the new manual PDF now.");
      setExperiments([]);
      setSelectedFile(null);
      await fetchData();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setErrorMessage("Clear request timed out. Please retry.");
      } else {
        setErrorMessage(error instanceof Error ? error.message : "Failed to clear experiments.");
      }
    } finally {
      setClearing(false);
    }
  }

  useEffect(() => {
    if (!processingJobId) return;
    let cancelled = false;
    let timer: number | undefined;

    const pollStatus = async () => {
      const token = await getAccessToken();
      if (!token) {
        if (!cancelled) {
          setErrorMessage("Session expired. Please login again.");
          setProcessingJobId(null);
        }
        return;
      }

      try {
        const response = await fetchWithTimeout(
          `${MANUAL_API_BASE_URL}/api/manual/upload-status/${processingJobId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.message || "Failed to load upload status");
        }

        const status = String(payload?.data?.status || "");
        const message = String(payload?.data?.message || "Processing...");
        if (!cancelled) {
          setProcessingStatus(status);
          setUploadMessage(message);
        }

        if (status === "completed") {
          if (!cancelled) {
            setProcessingJobId(null);
            setProcessingStatus(null);
            setUploadMessage("Manual processed successfully.");
            await fetchData();
          }
          return;
        }

        if (status === "failed") {
          if (!cancelled) {
            setProcessingJobId(null);
            setProcessingStatus(null);
            setErrorMessage(String(payload?.data?.error || "Manual processing failed."));
          }
          return;
        }

        timer = window.setTimeout(() => {
          void pollStatus();
        }, 2000);
      } catch (error) {
        if (!cancelled) {
          setProcessingJobId(null);
          setProcessingStatus(null);
          if (error instanceof DOMException && error.name === "AbortError") {
            setErrorMessage("Status check timed out. Please refresh templates.");
          } else {
            setErrorMessage(error instanceof Error ? error.message : "Failed to track upload status.");
          }
        }
      }
    };

    void pollStatus();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [processingJobId, fetchData]);

  useEffect(() => {
    if (!subjectId) {
      setLoading(false);
      return;
    }

    void fetchData();

    const interval = window.setInterval(() => {
      if (document.hidden) return;
      void fetchData();
    }, 15000);

    const onFocus = () => void fetchData();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchData();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [subjectId, fetchData]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 h-6 w-40 animate-pulse rounded bg-slate-200" />
        <div className="space-y-3">
          <div className="h-10 animate-pulse rounded bg-slate-100" />
          <div className="h-10 animate-pulse rounded bg-slate-100" />
          <div className="h-10 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
    );
  }

  return (
    <div className="text-slate-800">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-100 p-2.5">
            <LayoutTemplate className="w-7 h-7 text-blue-600" />
          </div>
          <div>
            <h1 className="bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-3xl font-bold text-transparent md:text-4xl">
              Lab Templates
            </h1>
            {(subjectName || subject?.name) && (
              <p className="mt-1 text-sm text-slate-500">
                {subjectName || subject?.name}
                {subject?.code && (
                  <span className="ml-2 rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                    {subject.code}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleClearCurrentExperiments}
            disabled={clearing || uploading || Boolean(processingJobId)}
            className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
            {clearing ? "Clearing..." : "Clear Current Experiments"}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleManualUpload}
            disabled={uploading || !selectedFile || Boolean(processingJobId) || clearing}
            className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-5 py-2.5 font-medium text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="w-5 h-5" />
            {uploading
              ? "Uploading..."
              : processingJobId
                ? `Processing (${processingStatus || "queued"})...`
                : "Upload New Manual PDF"}
          </motion.button>
        </div>
      </motion.div>
      <div className="mb-6 space-y-3">
        <input
          type="file"
          accept="application/pdf"
          onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
          className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-4 file:py-2 file:text-slate-700 hover:file:bg-slate-50"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedFile(null)}
            disabled={!selectedFile || uploading || Boolean(processingJobId)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove Selected PDF
          </button>
          <button
            type="button"
            onClick={() => void fetchData()}
            disabled={loading || uploading || Boolean(processingJobId)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh Extracted Experiments
          </button>
          <span className="text-xs text-slate-500">
            {selectedFile ? `Selected: ${selectedFile.name}` : "No file selected"}
          </span>
        </div>
        {uploadMessage && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {uploadMessage}
          </div>
        )}
        {errorMessage && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard
          title="Total Experiments"
          value={experiments.length}
          delay={0.1}
        />
        <StatCard
          title="Department"
          value={subject?.department ? 1 : 0}
          label={subject?.department || "—"}
          delay={0.2}
        />
        <StatCard
          title="Subject Code"
          value={subject?.code ? 1 : 0}
          label={subject?.code || "—"}
          delay={0.3}
        />
      </div>

      {/* Cards */}
      {experiments.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-20"
        >
          <LayoutTemplate className="mx-auto mb-4 h-12 w-12 text-slate-400" />
          <h3 className="mb-2 text-lg font-semibold text-slate-800">
            No Templates
          </h3>
          <p className="mx-auto max-w-md text-sm text-slate-500">
            No experiment templates found for this subject. Create one to get started.
          </p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {experiments.map((exp, idx) => (
            <motion.div
              key={exp.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + idx * 0.1 }}
              whileHover={{ y: -8, scale: 1.02 }}
              className="group faculty-surface relative overflow-hidden rounded-2xl border border-slate-200/80 p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-blue-200 hover:shadow-md"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-indigo-50 opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-4">
                  <div className="rounded-lg bg-blue-100 p-2">
                    <LayoutTemplate className="w-5 h-5 text-blue-600" />
                  </div>
                  <span
                    className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700"
                  >
                    #{exp.experiment_number ?? idx + 1}
                  </span>
                </div>
                <h2 className="mb-1 text-xl font-bold text-slate-900">
                  {repairLeadingTitle(exp.title)}
                </h2>
                <p className="mb-6 line-clamp-2 text-sm text-slate-500">
                  Extracted from uploaded manual
                </p>

                <div className="mb-4 rounded-xl border border-slate-200 bg-white/90 p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Template Content Type
                  </p>
                  <div className="flex items-center gap-2">
                    <select
                      value={contentTypeByExperiment[exp.id] || "mixed"}
                      onChange={(event) => {
                        const next = event.target.value as ContentType;
                        setContentTypeByExperiment((prev) => ({ ...prev, [exp.id]: next }));
                      }}
                      className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="mixed">Mixed (Code + Upload)</option>
                      <option value="code">Code only</option>
                      <option value="text">Text / Theory</option>
                      <option value="image">Upload / Screenshot</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => void handleSaveContentType(exp.id)}
                      disabled={Boolean(savingContentTypeByExperiment[exp.id])}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingContentTypeByExperiment[exp.id] ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-200 pt-4">
                  <motion.button
                    type="button"
                    disabled
                    title="Template editor will be available soon."
                    className="text-slate-500 font-semibold text-sm cursor-not-allowed"
                  >
                    Edit (soon)
                  </motion.button>
                  <motion.button
                    type="button"
                    disabled
                    title="Template usage flow will be available soon."
                    className="text-slate-500 font-semibold text-sm flex items-center gap-1 cursor-not-allowed"
                  >
                    Use Template (soon)
                    <span>→</span>
                  </motion.button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  label,
  delay = 0,
}: {
  title: string;
  value: number;
  label?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay }}
      whileHover={{ y: -6, scale: 1.02 }}
      className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md"
    >
      <div className="rounded-lg bg-blue-100 p-3">
        <Layers className="w-8 h-8 text-blue-600" />
      </div>
      <div>
        <p className="text-sm font-medium text-slate-500">{title}</p>
        {label ? (
          <p className="text-lg font-bold text-slate-900">{label}</p>
        ) : (
          <p className="text-3xl font-bold text-slate-900">{value}</p>
        )}
      </div>
    </motion.div>
  );
}
