import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { formatDateTime } from "@/lib/dateFormat";
import { computeExamPhase, parseEffectiveEndMs, parseStartMs } from "@/lib/examWindow";
import {
  BookOpen,
  CalendarDays,
  Clock3,
  ClipboardList,
  Copy,
  FileDown,
  FileText,
  PlusCircle,
  Share2,
} from "lucide-react";

type SubjectOption = {
  id: string;
  name: string;
};

type ExamRow = {
  id: string;
  title: string;
  room_id: string;
  start_time: string;
  end_time: string | null;
  duration_minutes?: number | null;
};

type ExamFilterTab = "all" | "active" | "upcoming" | "completed";

type SubjectJoinRow = {
  subject_id: string;
  subjects:
    | { id: string; name: string; department?: string | null }
    | { id: string; name: string; department?: string | null }[]
    | null;
};

function normalizeDepartmentKey(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const initialForm = {
  title: "",
  subject_id: "",
  duration_minutes: "",
  start_time: "",
  end_time: "",
};

function generateRoomId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "";
  for (let i = 0; i < 6; i += 1) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

async function createUniqueRoomId() {
  let roomId = generateRoomId();
  let exists = true;

  while (exists) {
    const { data, error } = await supabase
      .from("exams")
      .select("id")
      .eq("room_id", roomId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    exists = Boolean(data);
    if (exists) {
      roomId = generateRoomId();
    }
  }

  return roomId;
}

export default function FacultyExams() {
  const navigate = useNavigate();
  const selectedSubjectId = localStorage.getItem("faculty_subject_id");
  const selectedSubjectName = localStorage.getItem("faculty_subject_name") || "Selected Subject";
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [createdRoomId, setCreatedRoomId] = useState("");
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [copiedToken, setCopiedToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<ExamFilterTab>("all");

  const canSubmit = useMemo(() => {
    return (
      form.title.trim() &&
      form.subject_id &&
      form.duration_minutes &&
      form.start_time &&
      form.end_time
    );
  }, [form]);

  const loadData = useCallback(async () => {
    if (!selectedSubjectId) return;

    try {
      setLoading(true);
      setError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setSubjects([]);
        setExams([]);
        setLoading(false);
        return;
      }

      const [subjectsBundle, examsRes] = await Promise.all([
        (async () => {
          const profileRes = await supabase
            .from("profiles")
            .select("department")
            .eq("id", user.id)
            .maybeSingle();
          const facultyDepartment = normalizeDepartmentKey(profileRes.data?.department || "");
          const response = await supabase
            .from("faculty_subjects")
            .select(
              `
          subject_id,
          subjects(id, name, department)
        `
            )
            .eq("faculty_id", user.id);
          return { response, facultyDepartment };
        })(),
        supabase
          .from("exams")
          .select("id, title, room_id, start_time, end_time, duration_minutes")
          .eq("faculty_id", user.id)
          .eq("subject_id", selectedSubjectId)
          .order("created_at", { ascending: false }),
      ]);
      const subjectsRes = subjectsBundle.response;
      const facultyDepartment = subjectsBundle.facultyDepartment;

      if (subjectsRes.error) {
        setError(`Failed to load subjects: ${subjectsRes.error.message}`);
        setSubjects([]);
      } else {
        const mapped = ((subjectsRes.data || []) as SubjectJoinRow[])
          .map((row) => {
            const joined = Array.isArray(row.subjects) ? row.subjects[0] : row.subjects;
            if (!joined?.id || !joined?.name) return null;
            if (
              facultyDepartment &&
              normalizeDepartmentKey(joined.department || "") !== facultyDepartment
            ) {
              return null;
            }
            return { id: joined.id, name: joined.name };
          })
          .filter((item): item is SubjectOption => Boolean(item));
        const hasSelected = mapped.some((item) => item.id === selectedSubjectId);
        const nextSubjects =
          mapped.length === 0 && selectedSubjectId
            ? [{ id: selectedSubjectId, name: selectedSubjectName }]
            : !hasSelected && selectedSubjectId
              ? [{ id: selectedSubjectId, name: selectedSubjectName }, ...mapped]
              : mapped;
        setSubjects(nextSubjects);
        setForm((prev) => ({
          ...prev,
          subject_id:
            prev.subject_id ||
            (selectedSubjectId && nextSubjects.some((item) => item.id === selectedSubjectId)
              ? selectedSubjectId
              : prev.subject_id),
        }));
      }

      if (examsRes.error) {
        setError(`Failed to load exams: ${examsRes.error.message}`);
        setExams([]);
      } else {
        setExams((examsRes.data || []) as ExamRow[]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to load exams: ${message}`);
      setSubjects([]);
      setExams([]);
    } finally {
      setLoading(false);
    }
  }, [selectedSubjectId]);

  useEffect(() => {
    if (!selectedSubjectId) return;
    setForm((prev) => (prev.subject_id ? prev : { ...prev, subject_id: selectedSubjectId }));
  }, [selectedSubjectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleCreateExam(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setCopied(false);
    setCreatedRoomId("");
    setFormError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setFormError("Session expired. Please login again.");
        return;
      }

      setSubmitting(true);

      const durationMinutes = Number(form.duration_minutes);
      const startTime = new Date(form.start_time);
      const endTime = new Date(form.end_time);

      if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
        setFormError("Invalid start/end time");
        return;
      }

      if (endTime <= startTime) {
        setFormError("End time must be after start time");
        return;
      }

      const roomId = await createUniqueRoomId();
      const { data: createdExam, error: insertErr } = await supabase
        .from("exams")
        .insert({
          title: form.title.trim(),
          subject_id: form.subject_id,
          faculty_id: user.id,
          room_id: roomId,
          duration_minutes: durationMinutes,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
        })
        .select("room_id")
        .single();

      if (insertErr) {
        const errText = `${insertErr.code || ""} ${insertErr.message || ""}`.toLowerCase();
        if (
          insertErr.code === "23505" ||
          errText.includes("duplicate") ||
          errText.includes("unique")
        ) {
          setFormError("Room ID collision detected. Please try creating exam again.");
          return;
        }
        if (insertErr.code === "42501" || errText.includes("row-level security")) {
          setFormError(
            "Permission denied by database policy while creating exam. Check Supabase RLS for exams insert (faculty role)."
          );
          return;
        }
        setFormError(`Failed to create exam: ${insertErr.message}`);
        return;
      }

      setCreatedRoomId((createdExam?.room_id || roomId).toUpperCase());
      setForm(initialForm);
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setFormError(`Failed to create exam: ${message}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopyRoomId() {
    if (!createdRoomId) return;
    try {
      await navigator.clipboard.writeText(createdRoomId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setFormError("Unable to copy room ID");
    }
  }

  function buildExamInviteLink(roomId: string) {
    if (!roomId) return "";
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/exam/login?room=${encodeURIComponent(roomId.trim().toUpperCase())}`;
  }

  async function handleCopyInviteLink(roomId: string, examId?: string) {
    const link = buildExamInviteLink(roomId);
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
      if (examId) {
        setCopiedToken(`link-${examId}`);
      }
      window.setTimeout(() => setLinkCopied(false), 1800);
      window.setTimeout(() => setCopiedToken(""), 1800);
    } catch {
      setFormError("Unable to copy invite link");
    }
  }

  async function handleCopyRoomIdFromRow(roomId: string, examId: string) {
    if (!roomId) return;
    try {
      await navigator.clipboard.writeText(String(roomId).trim().toUpperCase());
      setCopiedToken(`room-${examId}`);
      window.setTimeout(() => setCopiedToken(""), 1800);
    } catch {
      setFormError("Unable to copy room ID");
    }
  }

  async function handleShareInviteLink(roomId: string) {
    const link = buildExamInviteLink(roomId);
    if (!link) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Exam Room Link",
          text: `Join exam room ${roomId}`,
          url: link,
        });
        return;
      }
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1800);
    } catch {
      // User cancelled share or clipboard failed; keep quiet.
    }
  }

  const examRows = useMemo(() => {
    const now = Date.now();
    return exams.map((exam) => {
      const phase = computeExamPhase(now, {
        start_time: exam.start_time,
        end_time: exam.end_time,
        duration_minutes: exam.duration_minutes,
      });
      const statusLabel =
        phase === "active"
          ? "Active"
          : phase === "completed"
            ? "Completed"
            : phase === "scheduled"
              ? "Not Started"
              : "Incomplete";
      const statusKey: "active" | "upcoming" | "completed" =
        phase === "active"
          ? "active"
          : phase === "completed"
            ? "completed"
            : "upcoming";
      const startMs = parseStartMs(exam.start_time);
      const endMs = parseEffectiveEndMs({
        start_time: exam.start_time,
        end_time: exam.end_time,
        duration_minutes: exam.duration_minutes,
      });
      const duration =
        startMs != null && endMs != null
          ? Math.max(0, Math.round((endMs - startMs) / 60000))
          : 0;
      return {
        ...exam,
        statusLabel,
        statusKey,
        duration,
      };
    });
  }, [exams]);

  const filteredExamRows = useMemo(() => {
    if (activeFilter === "all") return examRows;
    return examRows.filter((exam) => exam.statusKey === activeFilter);
  }, [examRows, activeFilter]);

  const examInsights = useMemo(() => {
    const active = examRows.filter((exam) => exam.statusKey === "active").length;
    const upcoming = examRows.filter((exam) => exam.statusKey === "upcoming").length;
    const completed = examRows.filter((exam) => exam.statusKey === "completed").length;
    return {
      total: examRows.length,
      active,
      upcoming,
      completed,
    };
  }, [examRows]);

  const activityFeed = useMemo(() => {
    return examRows.slice(0, 5).map((exam) => {
      if (exam.statusKey === "active") {
        return {
          id: `${exam.id}-active`,
          label: `${exam.title} is currently active`,
          timestamp: formatDateTime(exam.start_time),
          accent: "text-emerald-600 border-emerald-200 bg-emerald-50",
        };
      }
      if (exam.statusKey === "completed") {
        return {
          id: `${exam.id}-completed`,
          label: `${exam.title} was completed`,
          timestamp: formatDateTime(exam.end_time),
          accent: "text-slate-600 border-slate-200 bg-slate-50",
        };
      }
      return {
        id: `${exam.id}-upcoming`,
        label: `${exam.title} has been scheduled`,
        timestamp: formatDateTime(exam.start_time),
        accent: "text-blue-700 border-blue-200 bg-blue-50",
      };
    });
  }, [examRows]);

  const upcomingTimeline = useMemo(() => {
    const now = Date.now();
    return examRows
      .filter((exam) => {
        const endMs = parseEffectiveEndMs({
          start_time: exam.start_time,
          end_time: exam.end_time,
          duration_minutes: exam.duration_minutes,
        });
        if (endMs == null) return exam.statusKey !== "completed";
        return endMs >= now;
      })
      .sort(
        (a, b) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      )
      .slice(0, 4);
  }, [examRows]);

  const filterTabs: { id: ExamFilterTab; label: string; count: number }[] = [
    { id: "all", label: "All", count: examRows.length },
    { id: "active", label: "Active", count: examInsights.active },
    { id: "upcoming", label: "Upcoming", count: examInsights.upcoming },
    { id: "completed", label: "Completed", count: examInsights.completed },
  ];

  return (
    <div className="max-w-[1380px] text-slate-800">
      {error ? (
        <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-2xl font-semibold text-transparent">
          Faculty Exam Console
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Create and manage internal exams for {selectedSubjectName}.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
        {/* LEFT COLUMN */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Create Exam</h2>
            <form onSubmit={handleCreateExam}>
              {createdRoomId ? (
                <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-700">
                  <p className="font-semibold">Exam Created Successfully</p>
                  <div className="mt-1 flex items-center gap-2">
                    <p>
                      Room ID: <span className="font-mono font-bold">{createdRoomId}</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleCopyRoomId()}
                      className="rounded-lg border border-emerald-200 bg-white px-2 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCopyInviteLink(createdRoomId)}
                      className="rounded-lg border border-emerald-200 bg-white px-2 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
                    >
                      {linkCopied ? "Link Copied" : "Copy Link"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleShareInviteLink(createdRoomId)}
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      Share
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="mb-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Basic Information
                </p>
                <label className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-600">
                  <FileText className="h-3.5 w-3.5 text-slate-500" />
                  Exam Title
                </label>
                <input
                  type="text"
                  placeholder="Exam Title"
                  className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 placeholder:text-slate-400"
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  required
                />

                <label className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-600">
                  <BookOpen className="h-3.5 w-3.5 text-slate-500" />
                  Subject
                </label>
                <select
                  className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800"
                  value={form.subject_id}
                  onChange={(e) => setForm((prev) => ({ ...prev, subject_id: e.target.value }))}
                  required
                >
                  <option value="">Select Subject</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-1">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Exam Configuration
                </p>
                <label className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-600">
                  <Clock3 className="h-3.5 w-3.5 text-slate-500" />
                  Duration (minutes)
                </label>
                <input
                  type="number"
                  min={1}
                  placeholder="Duration (minutes)"
                  className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 placeholder:text-slate-400"
                  value={form.duration_minutes}
                  onChange={(e) => setForm((prev) => ({ ...prev, duration_minutes: e.target.value }))}
                  required
                />

                <label className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-600">
                  <CalendarDays className="h-3.5 w-3.5 text-slate-500" />
                  Start Time
                </label>
                <input
                  type="datetime-local"
                  className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800"
                  value={form.start_time}
                  onChange={(e) => setForm((prev) => ({ ...prev, start_time: e.target.value }))}
                  required
                />

                <label className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-600">
                  <CalendarDays className="h-3.5 w-3.5 text-slate-500" />
                  End Time
                </label>
                <input
                  type="datetime-local"
                  className="mb-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800"
                  value={form.end_time}
                  onChange={(e) => setForm((prev) => ({ ...prev, end_time: e.target.value }))}
                  required
                />
              </div>

              {formError ? (
                <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  {formError}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={!canSubmit || submitting}
                className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-60"
              >
                {submitting ? "Creating..." : "Create Exam"}
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-slate-900">My Exams List</h2>
              <div className="flex flex-wrap items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
                {filterTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveFilter(tab.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      activeFilter === tab.id
                        ? "bg-blue-600 text-white"
                        : "bg-transparent text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {tab.label} ({tab.count})
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="space-y-3">
                <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
                <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
                <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
              </div>
            ) : filteredExamRows.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-10 text-center text-slate-600">
                <ClipboardList className="mx-auto mb-2 h-6 w-6 text-slate-400" />
                <p className="text-sm font-semibold text-slate-700">No Exams Created Yet</p>
                <p className="mt-1 text-sm text-slate-500">Create your first exam for this subject.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-slate-700">
                  <thead>
                    <tr className="sticky top-0 border-b border-slate-200 bg-slate-50 text-left">
                      <th className="py-2 pr-4 text-slate-600">Exam Title</th>
                      <th className="py-2 pr-4 text-slate-600">Room ID / Link</th>
                      <th className="py-2 pr-4 text-slate-600">Subject</th>
                      <th className="py-2 pr-4 text-slate-600">Duration</th>
                      <th className="py-2 pr-4 text-slate-600">Start Time</th>
                      <th className="py-2 pr-4 text-slate-600">Status</th>
                      <th className="py-2 pr-4 text-slate-600">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExamRows.map((exam) => (
                      <tr
                        key={exam.id}
                        className="border-b border-slate-100 text-slate-700 transition-colors hover:bg-blue-50/60"
                      >
                        <td className="py-2 pr-4 text-slate-900">{exam.title}</td>
                        <td className="py-2 pr-4">
                          {exam.statusKey === "completed" ? (
                            <span className="text-xs text-slate-500">Exam ended</span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void handleCopyRoomIdFromRow(exam.room_id, exam.id)}
                                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-mono font-semibold text-slate-700 transition hover:bg-slate-50"
                                title="Click to copy room ID"
                              >
                                {copiedToken === `room-${exam.id}` ? "Copied" : exam.room_id}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleCopyInviteLink(exam.room_id, exam.id)}
                                className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                                title="Click to copy invite link"
                              >
                                {copiedToken === `link-${exam.id}` ? "Copied Link" : "Copy Link"}
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-slate-600">{selectedSubjectName}</td>
                        <td className="py-2 pr-4 text-slate-600">{exam.duration} min</td>
                        <td className="py-2 pr-4">{formatDateTime(exam.start_time)}</td>
                        <td className="py-2 pr-4">
                          <StatusBadge statusKey={exam.statusKey} />
                        </td>
                        <td className="py-2 pr-4">
                          <div className="flex gap-2">
                            <button
                              onClick={() => navigate(`/faculty/exams/${exam.id}`)}
                              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-blue-700 transition hover:bg-blue-100"
                            >
                              View Submissions
                            </button>
                            <button
                              onClick={() => navigate(`/faculty/exam-monitor/${exam.id}`)}
                              className="rounded-lg border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-100"
                            >
                              Live Monitor
                            </button>
                            <button
                              onClick={() => void handleCopyInviteLink(exam.room_id, exam.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1 text-indigo-700 transition hover:bg-indigo-100"
                            >
                              <Copy className="h-3.5 w-3.5" />
                              Link
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-6">
          <div className="faculty-glass faculty-gradient-ring rounded-2xl p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Exam Insights</h3>
            <div className="grid grid-cols-2 gap-3">
              <InsightCard label="Total Exams" value={examInsights.total} colorClass="text-blue-600" />
              <InsightCard label="Active Exams" value={examInsights.active} colorClass="text-emerald-600" />
              <InsightCard label="Upcoming Exams" value={examInsights.upcoming} colorClass="text-amber-600" />
              <InsightCard label="Completed Exams" value={examInsights.completed} colorClass="text-indigo-600" />
            </div>
          </div>

          <div className="faculty-glass faculty-gradient-ring rounded-2xl p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Exam Activity Feed</h3>
            <div className="space-y-2">
              {activityFeed.length === 0 ? (
                <p className="text-sm text-slate-500">No exam activity yet.</p>
              ) : (
                activityFeed.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                  >
                    <p className="text-sm text-slate-700">{item.label}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.timestamp}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="faculty-glass faculty-gradient-ring rounded-2xl p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Exam Timeline</h3>
            <div className="space-y-2">
              {upcomingTimeline.length === 0 ? (
                <p className="text-sm text-slate-500">No upcoming exams.</p>
              ) : (
                upcomingTimeline.map((exam) => (
                  <div key={`timeline-${exam.id}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {new Date(exam.start_time).toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-800">{exam.title}</p>
                    <p className="text-xs text-slate-500">{selectedSubjectName}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="faculty-glass faculty-gradient-ring rounded-2xl p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Quick Actions</h3>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="w-full rounded-lg border border-blue-200 px-3 py-2 text-left text-sm text-blue-700 transition hover:bg-blue-50"
              >
                <span className="inline-flex items-center gap-2">
                  <PlusCircle className="h-4 w-4" />
                  Create Exam
                </span>
              </button>
              <button
                type="button"
                onClick={() => setFormError("Duplicate exam UI will be available in a future update.")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
              >
                <span className="inline-flex items-center gap-2">
                  <Copy className="h-4 w-4" />
                  Duplicate Exam
                </span>
              </button>
              <button
                type="button"
                onClick={() => setFormError("Import exam UI will be available in a future update.")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
              >
                <span className="inline-flex items-center gap-2">
                  <FileDown className="h-4 w-4" />
                  Import Exam
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InsightCard({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: number;
  colorClass: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 transition hover:-translate-y-0.5">
      <p className={`text-xl font-bold ${colorClass}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </div>
  );
}

function StatusBadge({
  statusKey,
}: {
  statusKey: "active" | "upcoming" | "completed";
}) {
  const labelMap = {
    active: "Active",
    upcoming: "Upcoming",
    completed: "Completed",
  } as const;
  const classMap = {
    active: "border border-emerald-200 bg-emerald-50 text-emerald-700",
    upcoming: "border border-blue-200 bg-blue-50 text-blue-700",
    completed: "border border-slate-200 bg-slate-50 text-slate-600",
  } as const;

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        classMap[statusKey] || classMap.upcoming
      }`}
    >
      {labelMap[statusKey] || labelMap.upcoming}
    </span>
  );
}
