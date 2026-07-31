import { useEffect, useState, useCallback, useMemo } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { FileText, CheckCircle, Eye, Clock, Layers } from "lucide-react";
import { motion } from "framer-motion";
import { fetchFacultyScopedStudents } from "@/services/facultyStudentsClient";
import AiEvaluationCard from "@/components/ai/AiEvaluationCard";

type FilterTab = "all" | "submitted" | "evaluated" | "pending";

type SubmissionRow = {
  id: number;
  exp_id: number;
  student_id: string;
  status: string;
  marks: number | null;
  updated_at: string;
  student_name?: string;
  register_no?: string | null;
  experiment_title?: string;
  experiment_no?: number | null;
  ai_score?: number | null;
  ai_confidence?: number | null;
  ai_status?: string | null;
  ai_breakdown?: Record<string, number> | null;
  faculty_marks?: number | null;
  final_marks?: number | null;
  is_overridden?: boolean | null;
  evaluated_at?: string | null;
  evaluated_by_name?: string | null;
  approved_by_name?: string | null;
  faculty_signature?: string | null;
};

function normalizeSubmissionStatus(status: unknown) {
  const value = String(status || "").toLowerCase().trim();
  if (value === "approved" || value === "evaluated") return "evaluated";
  if (value === "submitted") return "submitted";
  if (value === "pending") return "pending";
  return "draft";
}

function resolveStudentName(profile: {
  name?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}) {
  const direct = String(profile?.name || "").trim();
  if (direct) return direct;
  const full = String(profile?.full_name || "").trim();
  if (full) return full;
  const joined = `${String(profile?.first_name || "").trim()} ${String(
    profile?.last_name || ""
  ).trim()}`.trim();
  return joined || "";
}

function fallbackStudentLabel(row: SubmissionRow) {
  if (row.register_no) return row.register_no;
  const raw = String(row.student_id || "").trim();
  if (!raw) return "Unknown Student";
  return `Student ${raw.slice(0, 8)}`;
}

export default function Submissions() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const selectedSubjectId = localStorage.getItem("faculty_subject_id");
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [aiFetchFailed, setAiFetchFailed] = useState(false);

  const fetchSubmissions = useCallback(async () => {
    if (!user || !selectedSubjectId) {
      setLoading(false);
      return;
    }

    const selectCandidates = [
      "id, exp_id, student_id, status, marks, updated_at, faculty_marks, final_marks, is_overridden, evaluated_at, evaluated_by_name, approved_by_name, faculty_signature",
      "id, exp_id, student_id, status, marks, updated_at, faculty_marks, final_marks, is_overridden, evaluated_at",
      "id, exp_id, student_id, status, marks, updated_at, faculty_marks, final_marks, is_overridden",
      "id, exp_id, student_id, status, marks, updated_at",
    ];
    let data: any[] | null = null;
    let error: any = null;
    for (const selectClause of selectCandidates) {
      const response = await supabase
        .from("submissions")
        .select(selectClause)
        .eq("subject_id", selectedSubjectId)
        .in("status", ["submitted", "evaluated", "approved"])
        .order("updated_at", { ascending: false });
      if (!response.error) {
        data = response.data as any[];
        error = null;
        break;
      }
      error = response.error;
    }

    if (error) {
      console.error("Submissions fetch error:", error);
      setSubmissions([]);
      setLoading(false);
      return;
    }

    const rows = (data || []) as unknown as SubmissionRow[];
    const studentIds = [...new Set(rows.map((r) => r.student_id))];
    const expIds = [...new Set(rows.map((r) => r.exp_id))];

    const [scopedStudents, experimentsRes, subjectExperimentsRes] = await Promise.all([
      studentIds.length
        ? fetchFacultyScopedStudents(selectedSubjectId, studentIds)
        : Promise.resolve([] as any[]),
      expIds.length
        ? supabase.from("experiments").select("id, title, experiment_no").in("id", expIds)
        : Promise.resolve({ data: [], error: null } as any),
      supabase
        .from("experiments")
        .select("id, experiment_no")
        .eq("subject_id", selectedSubjectId),
    ]);

    const profileMap = new Map(
      (scopedStudents || []).flatMap((p: any) => {
        const keys = [String(p?.id || "").trim(), String(p?.register_no || "").trim()].filter(Boolean);
        return keys.map((key) => [key, p]);
      })
    );
    const expMap = new Map((experimentsRes.data || []).map((e: any) => [e.id, e]));
    const subjectExperimentNumberMap = new Map(
      ((subjectExperimentsRes.data || []) as any[])
        .sort((a, b) => {
          const aNo = Number.isFinite(Number(a?.experiment_no))
            ? Number(a.experiment_no)
            : Number.MAX_SAFE_INTEGER;
          const bNo = Number.isFinite(Number(b?.experiment_no))
            ? Number(b.experiment_no)
            : Number.MAX_SAFE_INTEGER;
          if (aNo !== bNo) return aNo - bNo;
          return String(a?.id || "").localeCompare(String(b?.id || ""));
        })
        .map((exp, index) => [exp.id, index + 1])
    );

    rows.forEach((row) => {
      const profile = profileMap.get(String(row.student_id || "").trim());
      const experiment = expMap.get(row.exp_id);
      row.student_name = resolveStudentName(profile || {});
      row.register_no = profile?.register_no ?? null;
      row.experiment_title = experiment?.title;
      row.experiment_no = subjectExperimentNumberMap.get(row.exp_id) ?? null;
    });

    const submissionIds = rows.map((row) => String(row.id || "").trim()).filter(Boolean);
    const aiBySubmissionId = new Map<
      string,
      {
        ai_score: number | null;
        confidence: number | null;
        status: string | null;
        breakdown: Record<string, number> | null;
      }
    >();
    let aiLoaded = false;
    if (submissionIds.length > 0) {
      const aiSelectCandidates = [
        "submission_id, ai_score, predicted_score, confidence, status, breakdown",
        "submission_id, ai_score, confidence, status, breakdown",
        "submission_id, ai_score",
      ];

      for (const selectClause of aiSelectCandidates) {
        const aiResponse = await supabase
          .from("ai_evaluations")
          .select(selectClause)
          .in("submission_id", submissionIds);
        if (aiResponse.error) continue;
        aiLoaded = true;
        (Array.isArray(aiResponse.data) ? aiResponse.data : []).forEach((row: any) => {
          const key = String(row?.submission_id || "").trim();
          if (!key) return;
          aiBySubmissionId.set(key, {
            ai_score: row?.ai_score ?? row?.predicted_score ?? null,
            confidence: row?.confidence ?? null,
            status: row?.status ?? null,
            breakdown:
              row?.breakdown && typeof row.breakdown === "object" ? row.breakdown : null,
          });
        });
        break;
      }
    }

    rows.forEach((row) => {
      const ai = aiBySubmissionId.get(String(row.id || "").trim());
      row.ai_score = ai?.ai_score ?? null;
      row.ai_confidence = ai?.confidence ?? null;
      row.ai_status = ai?.status ?? null;
      row.ai_breakdown = ai?.breakdown ?? null;
    });

    setAiFetchFailed(submissionIds.length > 0 && !aiLoaded);

    setSubmissions(rows);
    setLoading(false);
  }, [user, selectedSubjectId]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  useEffect(() => {
    if (!selectedSubjectId) return;

    const channel = supabase
      .channel(`evaluated-submissions-live-${selectedSubjectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "submissions",
          filter: `subject_id=eq.${selectedSubjectId}`,
        },
        () => {
          fetchSubmissions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedSubjectId, fetchSubmissions]);

  useEffect(() => {
    if (!selectedSubjectId) return;
    const onFocus = () => fetchSubmissions();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [selectedSubjectId, fetchSubmissions]);

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="faculty-shimmer h-8 w-52 rounded bg-slate-200" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div
              key={`submissions-stat-skeleton-${idx}`}
              className="faculty-shimmer h-28 rounded-2xl border border-slate-200 bg-white shadow-sm"
            />
          ))}
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="faculty-shimmer h-14 border-b border-slate-200 bg-slate-50" />
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div
                key={`submissions-row-skeleton-${idx}`}
                className="faculty-shimmer h-11 rounded-lg bg-slate-100"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!selectedSubjectId) {
    return <Navigate to="/faculty/subjects" replace />;
  }

  const evaluatedCount = submissions.filter(
    (sub) => normalizeSubmissionStatus(sub.status) === "evaluated"
  ).length;
  const submittedCount = submissions.filter(
    (sub) => normalizeSubmissionStatus(sub.status) === "submitted"
  ).length;
  const pendingCount = submissions.filter(
    (sub) => normalizeSubmissionStatus(sub.status) === "pending"
  ).length;

  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: "all",       label: "All",       count: submissions.length },
    { id: "submitted", label: "Submitted",  count: submittedCount },
    { id: "evaluated", label: "Evaluated", count: evaluatedCount },
    { id: "pending",   label: "Pending",   count: pendingCount },
  ];

  const filteredSubmissions = useMemo(() => {
    if (activeTab === "all") return submissions;
    return submissions.filter(
      (sub) => normalizeSubmissionStatus(sub.status) === activeTab
    );
  }, [submissions, activeTab]);

  return (
    <div className="text-slate-800">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="faculty-glass faculty-gradient-ring mb-6 flex flex-col items-start justify-between gap-4 rounded-3xl p-6 md:flex-row md:items-center"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-100 p-2.5 ring-1 ring-blue-200">
            <FileText className="h-7 w-7 text-blue-600" />
          </div>
          <div>
            <h1 className="bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-3xl font-bold text-transparent md:text-4xl">
              Submissions
            </h1>
            <p className="text-sm text-slate-600">Track review-ready records and evaluation progress.</p>
          </div>
        </div>
        {/* quick-link chips to removed sidebar pages */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/faculty/experiments")}
            className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
          >
            <Layers className="h-3.5 w-3.5" />
            Experiments
          </button>
          <button
            type="button"
            onClick={() => navigate("/faculty/pending")}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
          >
            <Clock className="h-3.5 w-3.5" />
            Pending Queue
          </button>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard
          icon={<CheckCircle className="w-8 h-8 text-emerald-400" />}
          title="Evaluated"
          value={evaluatedCount}
          delay={0.1}
        />
        <StatCard
          icon={<FileText className="w-8 h-8 text-blue-400" />}
          title="Submitted"
          value={submittedCount}
          delay={0.2}
        />
        <StatCard
          icon={<FileText className="w-8 h-8 text-indigo-600" />}
          title="Experiments"
          value={new Set(submissions.map((s) => s.exp_id)).size}
          delay={0.3}
        />
      </div>

      {/* Filter tabs */}
      <div className="mb-5 flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white/80 p-1 shadow-sm backdrop-blur-sm">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              activeTab === tab.id
                ? "bg-[#DBEAFE] text-blue-700 shadow-sm"
                : "text-slate-600 hover:bg-[#F1F5F9] hover:text-slate-900"
            }`}
          >
            {tab.label}
            <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
              activeTab === tab.id ? "bg-blue-200 text-blue-800" : "bg-slate-100 text-slate-500"
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {filteredSubmissions.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-medium text-slate-800">
            {activeTab === "all"
              ? "Students haven't submitted experiments yet."
              : `No ${activeTab} submissions found.`}
          </p>
          <p className="mt-1 text-sm text-slate-500">Submissions will appear here once records are submitted.</p>
        </div>
      ) : (
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="faculty-surface overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600">Student</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600">Experiment</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600">Status</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600">Marks</th>
                  {!aiFetchFailed && (
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600">
                      AI Assisted Evaluation
                    </th>
                  )}
                  <th className="px-6 py-4 text-center text-sm font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSubmissions.map((sub, idx) => (
                  <motion.tr
                    key={sub.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.025 }}
                    onClick={() => navigate(`/faculty/submission/${sub.id}`)}
                    className="cursor-pointer transition-colors hover:bg-blue-50/60"
                  >
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-slate-900">
                        {sub.student_name || fallbackStudentLabel(sub)}
                      </div>
                      {sub.register_no && (
                        <div className="text-xs text-slate-500">{sub.register_no}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700">
                      {sub.experiment_title
                        ? `${sub.experiment_no ? `Experiment ${sub.experiment_no} – ` : ""}${sub.experiment_title}`
                        : "Experiment"}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={sub.status} />
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">
                      {sub.marks !== null && Number(sub.marks) > 0 ? sub.marks : "Not Evaluated"}
                    </td>
                    {!aiFetchFailed && (
                      <td className="px-6 py-4">
                        <AiEvaluationCard
                          variant="compact"
                          score={sub.ai_score}
                          confidence={sub.ai_confidence}
                          status={sub.ai_status}
                          breakdown={sub.ai_breakdown}
                          isFacultyCorrected={Boolean(
                            sub.is_overridden === true ||
                            (sub.faculty_marks !== null &&
                              sub.faculty_marks !== undefined &&
                              Number.isFinite(Number(sub.faculty_marks))) ||
                            (sub.final_marks !== null &&
                              sub.final_marks !== undefined &&
                              Number.isFinite(Number(sub.final_marks)))
                          )}
                          isApproved={normalizeSubmissionStatus(sub.status) === "evaluated"}
                          facultySignature={
                            String(
                              sub.faculty_signature ||
                              sub.evaluated_by_name ||
                              sub.approved_by_name ||
                              localStorage.getItem("faculty_name") ||
                              ""
                            ).trim() || null
                          }
                          approvedAt={sub.evaluated_at || sub.updated_at || null}
                          showFullBreakdown={false}
                          noteText="Faculty marks are final."
                        />
                      </td>
                    )}
                    <td className="px-6 py-4 text-center">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/faculty/submission/${sub.id}`);
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-blue-700 transition hover:bg-blue-100"
                      >
                        <Eye className="w-4 h-4" />
                        View
                      </motion.button>
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

function StatusBadge({ status }: { status: string }) {
  const normalized = normalizeSubmissionStatus(status);
  const styles: Record<string, string> = {
    evaluated: "border-emerald-200 bg-emerald-50 text-emerald-700",
    submitted: "border-blue-200 bg-blue-50 text-blue-700",
    pending: "border-indigo-200 bg-indigo-50 text-indigo-700",
    draft: "border-slate-200 bg-slate-50 text-slate-600",
  };
  const labels: Record<string, string> = {
    evaluated: "Evaluated",
    submitted: "Submitted",
    pending: "Pending",
    draft: "Draft",
  };
  const cls = styles[normalized] ?? styles.draft;
  const label = labels[normalized] ?? labels.draft;
  return (
    <span
      className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-semibold ${cls}`}
    >
      {label}
    </span>
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
