import { useEffect, useState, useCallback } from "react";
import { Navigate, useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { motion } from "framer-motion";
import { ArrowLeft, Code, Award, CheckCircle, ShieldAlert } from "lucide-react";
import ErrorScreen from "@/components/ui/ErrorScreen";
import { rewardSubmissionReview } from "@/services/gamificationClient";
import AiEvaluationCard from "@/components/ai/AiEvaluationCard";
import { evaluateSubmissionContent } from "@/utils/evaluationEngine";

type SubmissionDetail = {
  id: number;
  exp_id?: number | null;
  student_id?: string | null;
  aim: string | null;
  procedure: string | null;
  program: string | null;
  output: string | null;
  result: string | null;
  status: string;
  marks: number | null;
  faculty_marks?: number | null;
  final_marks?: number | null;
  is_overridden?: boolean | null;
  evaluated_at?: string | null;
  evaluated_by_name?: string | null;
  approved_by_name?: string | null;
  faculty_signature?: string | null;
  subject_id: string;
  experiments: { title: string | null; experiment_no: number | null } | null;
};

type AiEvaluation = {
  ai_score: number | null;
  confidence: number | null;
  status: string | null;
  breakdown: Record<string, number> | null;
};

export default function FacultyReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const selectedSubjectId = localStorage.getItem("faculty_subject_id");

  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [marks, setMarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [aiEvaluation, setAiEvaluation] = useState<AiEvaluation | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiFetchFailed, setAiFetchFailed] = useState(false);

  const fetchSubmission = useCallback(async () => {
    if (!user || !id || !selectedSubjectId) return;
    setError(null);

    const selectCandidates = [
      "id, exp_id, student_id, aim, procedure, program, output, result, status, marks, faculty_marks, final_marks, is_overridden, evaluated_at, evaluated_by_name, approved_by_name, faculty_signature, subject_id",
      "id, exp_id, student_id, aim, procedure, program, output, result, status, marks, faculty_marks, final_marks, is_overridden, evaluated_at, subject_id",
      "id, exp_id, student_id, aim, procedure, program, output, result, status, marks, subject_id",
    ];
    let data: any = null;
    let fetchError: any = null;
    for (const selectClause of selectCandidates) {
      const response = await supabase
        .from("submissions")
        .select(selectClause)
        .eq("id", id)
        .eq("subject_id", selectedSubjectId)
        .maybeSingle();
      if (!response.error) {
        data = response.data;
        fetchError = null;
        break;
      }
      fetchError = response.error;
    }

    if (fetchError) {
      setError(fetchError.message);
      setLoading(false);
      return;
    }

    if (!data) {
      setError("Submission not found for selected subject.");
      setLoading(false);
      return;
    }

    if (data && selectedSubjectId && data.subject_id !== selectedSubjectId) {
      setError("This submission belongs to a different subject.");
      setLoading(false);
      return;
    }

    if (data) {
      let experiment: { title: string | null; experiment_no: number | null } | null = null;

      if (data.exp_id) {
        const [{ data: expData }, { data: subjectExperiments }] = await Promise.all([
          supabase
            .from("experiments")
            .select("id, title")
            .eq("id", data.exp_id)
            .maybeSingle(),
          supabase
            .from("experiments")
            .select("id, experiment_no")
            .eq("subject_id", selectedSubjectId),
        ]);

        const numberMap = new Map(
          ((subjectExperiments || []) as any[])
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
            .map((row, index) => [row.id, index + 1])
        );

        experiment = expData
          ? { title: expData.title ?? null, experiment_no: numberMap.get(data.exp_id) ?? null }
          : null;
      }

      setSubmission({
        ...(data as unknown as SubmissionDetail),
        experiments: experiment,
      });
      if (data.marks !== null && !marks) setMarks(String(data.marks));

      setAiLoading(true);
      setAiFetchFailed(false);
      let resolvedAi: AiEvaluation | null = null;
      let loadedAi = false;
      const aiSelectCandidates = [
        "submission_id, ai_score, predicted_score, confidence, status, breakdown",
        "submission_id, ai_score, confidence, status, breakdown",
        "submission_id, ai_score",
      ];
      for (const selectClause of aiSelectCandidates) {
        const aiResponse = await supabase
          .from("ai_evaluations")
          .select(selectClause)
          .eq("submission_id", data.id)
          .maybeSingle();
        if (aiResponse.error) continue;
        loadedAi = true;
        if (aiResponse.data) {
          const aiData = aiResponse.data as any;
          resolvedAi = {
            ai_score: aiData?.ai_score ?? aiData?.predicted_score ?? null,
            confidence: aiData?.confidence ?? null,
            status: aiData?.status ?? null,
            breakdown:
              aiData?.breakdown && typeof aiData.breakdown === "object" ? aiData.breakdown : null,
          };
        }
        break;
      }
      if (!resolvedAi) {
        const generated = evaluateSubmissionContent({
          aim: data.aim,
          algorithm: data.procedure,
          program: data.program,
          output: data.output,
          result: data.result,
          studentName: "",
          experimentId: data.exp_id ?? data.id,
          autoGenerateIfEmpty: true,
        });
        resolvedAi = {
          ai_score: generated.aiScore,
          confidence: generated.confidence,
          status: generated.status,
          breakdown: generated.breakdown,
        };
      }
      setAiEvaluation(resolvedAi);
      setAiFetchFailed(!loadedAi);
      setAiLoading(false);
      if ((data.marks == null || Number(data.marks) <= 0) && resolvedAi?.ai_score) {
        const aiRaw = Number(resolvedAi.ai_score);
        const aiOutOf10 = aiRaw > 10 ? aiRaw / 10 : aiRaw;
        setMarks(String(Math.max(0, Math.min(10, Math.round(aiOutOf10)))));
      }
    }

    setLoading(false);
  }, [user, id, selectedSubjectId, marks]);

  useEffect(() => {
    if (!user || !selectedSubjectId) {
      setLoading(false);
      return;
    }
    fetchSubmission();
  }, [fetchSubmission, user, selectedSubjectId]);

  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`review-detail-${id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "submissions",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          const updated = payload.new as Partial<SubmissionDetail>;
          if (selectedSubjectId && updated.subject_id !== selectedSubjectId) return;
          setSubmission((prev) => (prev ? { ...prev, ...updated } : (updated as SubmissionDetail)));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, selectedSubjectId]);

  const [marksError, setMarksError] = useState<string | null>(null);

  const submitMarks = useCallback(async () => {
    if (!user || !id || !selectedSubjectId || !marks) return;
    setMarksError(null);
    const wasAlreadyEvaluated = submission?.status === "evaluated";

    const numMarks = Math.round(parseFloat(marks) * 100) / 100;
    if (isNaN(numMarks) || numMarks < 0 || numMarks > 10) {
      setMarksError("Enter a valid mark between 0 and 10");
      return;
    }

    setSubmitting(true);
    const evaluatedAt = new Date().toISOString();
    const facultySigner = String(localStorage.getItem("faculty_name") || "").trim() || "Faculty";
    // Keep `marks`, `faculty_marks`, and `final_marks` in sync (some views read faculty_* only).
    const payloads = [
      {
        marks: numMarks,
        faculty_marks: numMarks,
        final_marks: numMarks,
        is_overridden: true,
        status: "evaluated",
        evaluated_at: evaluatedAt,
        faculty_signature: facultySigner,
        evaluated_by_name: facultySigner,
        approved_by_name: facultySigner,
      },
      {
        marks: numMarks,
        faculty_marks: numMarks,
        final_marks: numMarks,
        status: "evaluated",
        evaluated_at: evaluatedAt,
      },
      {
        marks: numMarks,
        status: "evaluated",
        evaluated_at: evaluatedAt,
        faculty_signature: facultySigner,
        evaluated_by_name: facultySigner,
        approved_by_name: facultySigner,
      },
      {
        marks: numMarks,
        status: "evaluated",
        evaluated_at: evaluatedAt,
      },
    ];
    let updateError: any = null;
    for (const payload of payloads) {
      const response = await supabase
        .from("submissions")
        .update(payload)
        .eq("id", id)
        .eq("subject_id", selectedSubjectId);
      if (!response.error) {
        updateError = null;
        break;
      }
      updateError = response.error;
    }

    setSubmitting(false);

    if (updateError) {
      setMarksError("Failed to save marks: " + updateError.message);
      return;
    }

    await fetchSubmission();
    try {
      if (submission?.student_id && !wasAlreadyEvaluated) {
        await rewardSubmissionReview(submission.student_id, numMarks, user?.id ?? null);
      }
    } catch (gamificationError) {
      console.error("Gamification reward call failed:", gamificationError);
    }
    setSubmitted(true);
  }, [user, id, selectedSubjectId, marks, fetchSubmission, submission?.student_id, submission?.status]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 h-6 w-40 animate-pulse rounded bg-slate-200" />
        <div className="space-y-3">
          <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
        </div>
      </div>
    );
  }

  if (!selectedSubjectId) {
    return <Navigate to="/faculty/subjects" replace />;
  }

  if (unauthorized) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 py-16 text-slate-800">
        <ShieldAlert className="mb-4 h-12 w-12 text-rose-400" />
        <h2 className="mb-2 text-xl font-bold text-rose-700">Access Denied</h2>
        <p className="mb-6 text-sm text-rose-600">
          This submission does not belong to your selected subject.
        </p>
        <button
          onClick={() => navigate("/faculty/pending")}
          className="rounded-lg border border-rose-200 bg-white px-5 py-2.5 text-sm text-rose-700 transition-colors hover:bg-rose-100"
        >
          Back to Pending
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl">
        <ErrorScreen message={error} onRetry={() => navigate(0)} />
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="mx-auto max-w-4xl">
        <ErrorScreen
          message="Submission not found"
          onRetry={() => navigate(-1)}
        />
      </div>
    );
  }

  const sections: { label: string; value: string | null; mono?: boolean }[] = [
    { label: "Aim", value: submission.aim },
    { label: "Procedure", value: submission.procedure },
    { label: "Program", value: submission.program, mono: true },
    { label: "Output", value: submission.output },
    { label: "Result", value: submission.result },
  ];

  return (
    <div className="mx-auto max-w-4xl text-slate-800">
      <motion.button
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        onClick={() => navigate(-1)}
        className="mb-8 inline-flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-slate-800"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </motion.button>

      <motion.h1
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-2 bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-2xl font-bold text-transparent md:text-3xl"
      >
        Submission Review
      </motion.h1>
      {(submission.experiments?.title || submission.experiments?.experiment_no != null) && (
        <p className="mb-8 text-sm text-slate-500">
          {submission.experiments?.title ||
            `Experiment ${submission.experiments?.experiment_no}`}
        </p>
      )}

      <div className="space-y-5">
        {sections.map((section, idx) => (
          <motion.div
            key={section.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + idx * 0.06 }}
          >
            <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {section.mono && <Code className="w-3.5 h-3.5" />}
              {section.label}
            </label>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              {section.mono ? (
                <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-slate-700">
                  {section.value || "Not provided"}
                </pre>
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                  {section.value || "Not provided"}
                </p>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
        className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        {submitted ? (
          <div className="flex items-center gap-3 text-emerald-700">
            <CheckCircle className="w-6 h-6" />
            <div>
              <p className="font-semibold text-lg">Marks Submitted</p>
              <p className="text-sm text-slate-500">
                This submission has been evaluated.
              </p>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate("/faculty/pending")}
              className="ml-auto rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100"
            >
              Back to Pending
            </motion.button>
          </div>
        ) : (
          <>
            {!aiFetchFailed && (
              <div className="mb-4">
                <AiEvaluationCard
                  variant="faculty"
                  score={aiEvaluation?.ai_score ?? null}
                  confidence={aiEvaluation?.confidence ?? null}
                  status={aiEvaluation?.status ?? null}
                  breakdown={aiEvaluation?.breakdown ?? null}
                  isFacultyCorrected={Boolean(
                    submission.is_overridden === true ||
                    (submission.faculty_marks !== null &&
                      submission.faculty_marks !== undefined &&
                      Number.isFinite(Number(submission.faculty_marks))) ||
                    (submission.final_marks !== null &&
                      submission.final_marks !== undefined &&
                      Number.isFinite(Number(submission.final_marks)))
                  )}
                  isApproved={
                    String(submission.status || "").toLowerCase() === "evaluated" ||
                    String(submission.status || "").toLowerCase() === "approved"
                  }
                  facultySignature={
                    String(
                      submission.faculty_signature ||
                      submission.evaluated_by_name ||
                      submission.approved_by_name ||
                      localStorage.getItem("faculty_name") ||
                      ""
                    ).trim() || null
                  }
                  approvedAt={submission.evaluated_at || submission.updated_at || null}
                  loading={aiLoading}
                />
              </div>
            )}
            <div className="flex items-center gap-2 mb-4">
              <Award className="w-5 h-5 text-indigo-500" />
              <h3 className="text-lg font-bold text-slate-900">
                Assign Marks (out of 10)
              </h3>
            </div>
            {marksError && (
              <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {marksError}
              </div>
            )}
            <div className="flex items-center gap-4">
              <input
                type="number"
                min={0}
                max={10}
                value={marks}
                onChange={(e) => setMarks(e.target.value)}
                placeholder="Enter marks (0–10)"
                className="max-w-xs flex-1 rounded-xl border border-slate-300 bg-white p-3 text-slate-900 outline-none transition-all placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={submitMarks}
                disabled={submitting || !marks}
                className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 font-medium text-white shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:from-blue-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Saving..." : "Submit Marks"}
              </motion.button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
