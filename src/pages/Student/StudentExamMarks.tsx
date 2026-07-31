import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { fadeUp } from "@/animations/motion";
import {
  ArrowLeft,
  Award,
  ClipboardList,
  GraduationCap,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  Clock,
  FileBadge2,
} from "lucide-react";

type ExamSubmissionRow = {
  id: string;
  exam_id: string | null;
  exp_id: string | null;
  student_name: string | null;
  register_no: string | null;
  marks: number | null;
  submitted_at: string | null;
};

type ExamRow = {
  id: string;
  title: string | null;
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function StudentExamMarks() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const subjectId = searchParams.get("subject") || localStorage.getItem("student_subject_id") || "";
  const subjectName =
    searchParams.get("subjectName") ||
    localStorage.getItem("student_subject_name") ||
    "Your subject";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<ExamSubmissionRow[]>([]);
  const [examTitleById, setExamTitleById] = useState<Record<string, string>>({});
  const [experimentTitleById, setExperimentTitleById] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setRows([]);
        setError("Please sign in to view exam results.");
        setLoading(false);
        return;
      }

      // Fetch student profile for register_no fallback
      const { data: userProfile } = await supabase
        .from("profiles")
        .select("register_no, name")
        .eq("id", user.id)
        .maybeSingle();

      const candidateRegNos = new Set<string>();
      if (userProfile?.register_no) {
        candidateRegNos.add(String(userProfile.register_no).trim());
        candidateRegNos.add(String(userProfile.register_no).trim().toUpperCase());
      }
      if (user.user_metadata?.register_no) {
        candidateRegNos.add(String(user.user_metadata.register_no).trim());
        candidateRegNos.add(String(user.user_metadata.register_no).trim().toUpperCase());
      }
      const loginReg = localStorage.getItem("login_register_no");
      if (loginReg) {
        candidateRegNos.add(loginReg.trim());
        candidateRegNos.add(loginReg.trim().toUpperCase());
      }
      const examReg = localStorage.getItem("exam_register_no");
      if (examReg) {
        candidateRegNos.add(examReg.trim());
        candidateRegNos.add(examReg.trim().toUpperCase());
      }

      const regNoList = Array.from(candidateRegNos).filter(Boolean);

      // 1. Fetch from exam_submissions concurrently across identifiers
      const examSubQueries = [
        supabase.from("exam_submissions").select("*").eq("student_id", user.id),
        supabase.from("exam_submissions").select("*").eq("user_id", user.id),
      ];
      regNoList.forEach((reg) => {
        examSubQueries.push(supabase.from("exam_submissions").select("*").eq("register_no", reg));
        examSubQueries.push(supabase.from("exam_submissions").select("*").eq("student_id", `student-${reg}`));
      });

      // 2. Backup fetch from standard submissions table (used as exam submission fallback)
      const stdSubQueries = [
        supabase.from("submissions").select("*").eq("student_id", user.id),
      ];
      if (subjectId) {
        stdSubQueries.push(supabase.from("submissions").select("*").eq("subject_id", subjectId));
      }
      regNoList.forEach((reg) => {
        stdSubQueries.push(supabase.from("submissions").select("*").eq("register_no", reg));
      });

      const [examSubResults, stdSubResults] = await Promise.all([
        Promise.all(examSubQueries),
        Promise.all(stdSubQueries),
      ]);

      const submissionMap = new Map<string, Record<string, unknown>>();

      examSubResults.forEach((res) => {
        if (!res.error && Array.isArray(res.data)) {
          res.data.forEach((row: Record<string, unknown>) => {
            const rowId = String(row.id || "");
            if (rowId && !submissionMap.has(rowId)) {
              submissionMap.set(rowId, { ...row, _sourceTable: "exam_submissions" });
            }
          });
        }
      });

      stdSubResults.forEach((res) => {
        if (!res.error && Array.isArray(res.data)) {
          res.data.forEach((row: Record<string, unknown>) => {
            const rowId = String(row.id || "");
            // Only include backup submissions that belong to an online exam (have a valid exam_id)
            const isOnlineExamSubmission = Boolean(row.exam_id);
            if (rowId && isOnlineExamSubmission && !submissionMap.has(rowId)) {
              submissionMap.set(rowId, { ...row, _sourceTable: "submissions" });
            }
          });
        }
      });

      const rawSubmissions = Array.from(submissionMap.values()).sort((a, b) => {
        const ta = new Date(String(a.submitted_at || a.updated_at || a.created_at || 0)).getTime();
        const tb = new Date(String(b.submitted_at || b.updated_at || b.created_at || 0)).getTime();
        return tb - ta;
      });

      // Parse submission objects - filter strictly to online exam submissions (must have exam_id or come from exam_submissions)
      let submissionRows: (ExamSubmissionRow & { raw_subject_id?: string })[] = rawSubmissions
        .filter((row) => Boolean(row.exam_id) || row._sourceTable === "exam_submissions")
        .map((row) => {
          const rawMarks = row.marks ?? row.faculty_marks ?? row.ai_marks ?? row.evaluated_marks ?? row.score ?? row.obtained_marks;
          const marksNum = rawMarks != null && Number.isFinite(Number(rawMarks)) ? Number(rawMarks) : null;
          return {
            id: String(row.id || ""),
            exam_id: row.exam_id ? String(row.exam_id) : null,
            exp_id: String(row.exp_id || row.experiment_id || ""),
            student_name: String(row.student_name || row.name || userProfile?.name || ""),
            register_no: String(row.register_no || row.register_number || ""),
            marks: marksNum,
            submitted_at: String(row.submitted_at || row.updated_at || row.created_at || ""),
            raw_subject_id: row.subject_id ? String(row.subject_id) : undefined,
          };
        });

      const examIds = [
        ...new Set(submissionRows.map((row) => String(row.exam_id || "").trim()).filter(Boolean)),
      ];
      const expIds = [
        ...new Set(submissionRows.map((row) => String(row.exp_id || "").trim()).filter(Boolean)),
      ];

      const examSubjectMap: Record<string, string> = {};
      const examTitleMap: Record<string, string> = {};

      // Fetch exams both by IDs, by subjectId, and broadly for comprehensive title mapping
      const examQueries = [supabase.from("exams").select("id, title, subject_id, room_id")];
      if (examIds.length > 0) {
        examQueries.push(supabase.from("exams").select("id, title, subject_id, room_id").in("id", examIds));
      }

      if (examQueries.length > 0) {
        const examResults = await Promise.all(examQueries);
        examResults.forEach((res) => {
          if (!res.error && Array.isArray(res.data)) {
            res.data.forEach((row: { id: string; title: string | null; subject_id?: string | null; room_id?: string | null }) => {
              const id = String(row.id);
              if (row.title) {
                examTitleMap[id] = String(row.title).trim();
              } else if (row.room_id) {
                examTitleMap[id] = `Online Exam (${row.room_id})`;
              }
              if (row.subject_id) examSubjectMap[id] = String(row.subject_id).trim();
            });
          }
        });
      }

      setExamTitleById(examTitleMap);

      // Filter by subjectId safely
      if (subjectId) {
        submissionRows = submissionRows.filter((row) => {
          if (row.raw_subject_id && row.raw_subject_id === subjectId) return true;
          if (row.exam_id && examSubjectMap[row.exam_id] === subjectId) return true;
          // If the exam's subject mapping is unknown, keep it so we don't drop valid exam rows
          if (row.exam_id && !examSubjectMap[row.exam_id]) return true;
          return false;
        });
      }

      setRows(submissionRows);

      if (expIds.length === 0) {
        setExperimentTitleById({});
      } else {
        const expRes = await supabase
          .from("experiments")
          .select("id, title, experiment_no")
          .in("id", expIds);
        if (!expRes.error && Array.isArray(expRes.data)) {
          const map: Record<string, string> = {};
          (expRes.data as ExamRow[]).forEach((row: Record<string, unknown>) => {
            const id = String(row.id || "");
            const no = row.experiment_no != null ? `Exp ${row.experiment_no}` : "";
            const title = String(row.title || "").trim();
            map[id] = [no, title].filter(Boolean).join(" · ") || `Experiment ${id.slice(0, 8)}…`;
          });
          setExperimentTitleById(map);
        } else {
          setExperimentTitleById({});
        }
      }
    } catch (e) {
      const message =
        e && typeof e === "object" && "message" in e
          ? String((e as { message?: unknown }).message || "Failed to load exam marks.")
          : "Failed to load exam marks.";
      setError(message);
      setRows([]);
      setExamTitleById({});
      setExperimentTitleById({});
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  useEffect(() => {
    void fetchData();

    const channel = supabase
      .channel("student_exam_marks_live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "exam_submissions",
        },
        () => {
          void fetchData();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "submissions",
        },
        () => {
          void fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const evaluatedCount = useMemo(
    () => rows.filter((row) => row.marks != null && Number.isFinite(Number(row.marks))).length,
    [rows]
  );

  const averageMarks = useMemo(() => {
    const nums = rows
      .map((r) => (r.marks != null && Number.isFinite(Number(r.marks)) ? Number(r.marks) : null))
      .filter((n): n is number => n != null);
    if (nums.length === 0) return null;
    return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
  }, [rows]);

  const pendingCount = Math.max(0, rows.length - evaluatedCount);

  const formattedDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="student-page-enter faculty-bg-vibrant min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto w-full max-w-[1380px] space-y-8">
        {/* Hero */}
        <motion.div
          {...fadeUp}
          className="faculty-glass faculty-gradient-ring relative overflow-hidden rounded-3xl p-6 md:p-8"
        >
          <div className="pointer-events-none absolute -top-16 -right-16 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.22)_0%,transparent_70%)] blur-2xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-64 w-64 rounded-full bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.18)_0%,transparent_72%)] blur-2xl" />

          <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() =>
                  navigate(
                    subjectId
                      ? `/student?subject=${encodeURIComponent(subjectId)}&subjectName=${encodeURIComponent(subjectName)}`
                      : "/student"
                  )
                }
                className="mb-4 inline-flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-indigo-200 hover:bg-white hover:text-indigo-700"
              >
                <ArrowLeft className="h-4 w-4 shrink-0" />
                Back
              </button>

              <p className="mb-1 text-sm text-slate-500">{formattedDate}</p>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-2xl font-bold text-transparent md:text-3xl">
                  Exam results
                </h1>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200/80 bg-indigo-50/90 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                  <Sparkles className="h-3.5 w-3.5" />
                  Live
                </span>
              </div>
              <p className="mt-1 flex items-center gap-2 text-sm text-slate-600">
                <GraduationCap className="h-4 w-4 shrink-0 text-blue-600" />
                <span className="truncate">{subjectName}</span>
              </p>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
                View your online exam attempts, submission times, and marks when faculty has evaluated them.
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <motion.button
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => void fetchData()}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </motion.button>
            </div>
          </div>
        </motion.div>

        {error ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-800 shadow-sm"
          >
            {error}
          </motion.div>
        ) : null}

        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Attempts",
              value: rows.length,
              sub: "Total exams taken",
              icon: ClipboardList,
              accent: "from-blue-500 to-indigo-600",
            },
            {
              label: "Evaluated",
              value: evaluatedCount,
              sub: "Marks published",
              icon: CheckCircle2,
              accent: "from-emerald-500 to-teal-600",
            },
            {
              label: "Pending",
              value: pendingCount,
              sub: "Awaiting grade",
              icon: Clock,
              accent: "from-amber-500 to-orange-500",
            },
            {
              label: "Average",
              value: averageMarks != null ? averageMarks : "—",
              sub: evaluatedCount > 0 ? "Across graded items" : "No grades yet",
              icon: Award,
              accent: "from-violet-500 to-purple-600",
            },
          ].map((card, i) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i, duration: 0.25 }}
              whileHover={{ y: -4, scale: 1.01 }}
              className="faculty-surface rounded-2xl p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
                  <p className="mt-2 text-3xl font-extrabold text-slate-900">{card.value}</p>
                  <p className="mt-1 text-xs text-slate-500">{card.sub}</p>
                </div>
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${card.accent} text-white shadow-md shadow-slate-900/10`}
                >
                  <card.icon className="h-5 w-5" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="faculty-surface rounded-2xl p-10 text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
            <p className="text-sm font-medium text-slate-600">Loading your exam results…</p>
          </div>
        ) : rows.length === 0 ? (
          subjectId ? null : (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="faculty-surface rounded-2xl p-10 text-center"
            >
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <FileBadge2 className="h-7 w-7" />
              </div>
              <p className="text-lg font-semibold text-slate-900">No exam submissions yet</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
                When you complete an exam for a subject, your attempts and marks will appear here.
              </p>
              <button
                type="button"
                onClick={() => navigate("/student/subjects")}
                className="mt-6 inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:from-blue-700 hover:to-indigo-700"
              >
                Browse subjects
              </button>
            </motion.div>
          )
        ) : (
          <>
            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
              {rows.map((row, idx) => {
                const marks = row.marks == null ? null : Number(row.marks);
                const evaluated = marks != null && Number.isFinite(marks);
                const expLabel = experimentTitleById[String(row.exp_id || "")] || row.exp_id || "";
                const expTitleOnly = expLabel ? (expLabel.includes(" · ") ? expLabel.split(" · ").slice(1).join(" · ") : expLabel) : "";
                const rawExamTitle = row.exam_id ? examTitleById[String(row.exam_id)] : "";
                const examTitle = rawExamTitle || expTitleOnly || "Online Exam";
                return (
                  <motion.div
                    key={row.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.06 * idx }}
                    className="faculty-surface overflow-hidden rounded-2xl border border-slate-200/80 p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Exam</p>
                        <p className="font-semibold text-slate-900">{examTitle}</p>
                        <p className="mt-1 text-xs text-slate-500 line-clamp-2">{expLabel}</p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          evaluated ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {evaluated ? "Graded" : "Pending"}
                      </span>
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
                      <span className="text-slate-500">{formatDateTime(row.submitted_at)}</span>
                      <span className="font-bold text-slate-900">{evaluated ? marks : "—"}</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Desktop table */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="hidden overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm md:block"
            >
              <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-indigo-50/40 px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-800">Submission history</h2>
                <p className="text-xs text-slate-500">Newest attempts first</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-5 py-3">Exam</th>
                      <th className="px-5 py-3">Experiment</th>
                      <th className="px-5 py-3">Submitted</th>
                      <th className="px-5 py-3">Marks</th>
                      <th className="px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row) => {
                      const marks = row.marks == null ? null : Number(row.marks);
                      const evaluated = marks != null && Number.isFinite(marks);
                      const expLabel = experimentTitleById[String(row.exp_id || "")] || row.exp_id || "";
                      const expTitleOnly = expLabel ? (expLabel.includes(" · ") ? expLabel.split(" · ").slice(1).join(" · ") : expLabel) : "";
                      const rawExamTitle = row.exam_id ? examTitleById[String(row.exam_id)] : "";
                      const examTitle = rawExamTitle || expTitleOnly || "Online Exam";
                      return (
                        <tr
                          key={row.id}
                          className="transition-colors hover:bg-indigo-50/40"
                        >
                          <td className="px-5 py-3.5 font-medium text-slate-900">{examTitle}</td>
                          <td className="max-w-[220px] px-5 py-3.5 text-slate-600">
                            <span className="line-clamp-2" title={expLabel}>
                              {expLabel}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-3.5 text-slate-600">
                            {formatDateTime(row.submitted_at)}
                          </td>
                          <td className="px-5 py-3.5 font-semibold tabular-nums text-slate-900">
                            {evaluated ? marks : "—"}
                          </td>
                          <td className="px-5 py-3.5">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                evaluated
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {evaluated ? "Evaluated" : "Pending"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
