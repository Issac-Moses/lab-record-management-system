import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Search, Users } from "lucide-react";
import { getFacultyStudentsListResultUnified } from "@/services/facultyDataService";
import { formatDepartmentName } from "@/utils/departmentLabel";
import { supabase } from "@/lib/supabase";

function isUuidLike(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return false;
  if (text.startsWith("roster-")) return true;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text);
}

function safeStudentName(value) {
  const text = String(value || "").trim();
  return !text || isUuidLike(text) ? "Student" : text;
}

function safeRegisterNo(value) {
  const text = String(value || "").trim();
  return !text || isUuidLike(text) ? "-" : text;
}

function isResolvedStudentRow(row) {
  if (row?._profileUnavailable) return false;
  return safeStudentName(row?.student_name) !== "Student" && safeRegisterNo(row?.register_no) !== "-";
}

export default function StudentsList() {
  const subjectId = localStorage.getItem("faculty_subject_id");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [semesterFilter, setSemesterFilter] = useState("all");
  const [warning, setWarning] = useState("");
  const [error, setError] = useState(null);
  const MANUAL_API_BASE_URL = import.meta.env.VITE_MANUAL_API_URL || "http://localhost:7001";

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        let result = null;
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (subjectId && token) {
          try {
            const response = await fetch(
              `${MANUAL_API_BASE_URL}/api/manual/faculty/students-all/${encodeURIComponent(subjectId)}`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            );
            const payload = await response.json().catch(() => null);
            if (response.ok && payload?.success && Array.isArray(payload?.data)) {
              const rows = payload.data.map((row) => ({
                id: String(row?.id || ""),
                student_name: String(row?.name || "").trim(),
                register_no: String(row?.register_no || "").trim(),
                department: String(row?.department || "").trim() || "-",
                year: row?.year ?? "-",
                semester: row?.semester ?? "-",
                subject: localStorage.getItem("faculty_subject_name") || "Selected Subject",
                experiment:
                  String(row?.experiment || row?.experiment_title || row?.title || "").trim() || "-",
                experiment_title:
                  String(row?.experiment_title || row?.experiment || row?.title || "").trim() || "-",
                submission_status: String(
                  row?.submission_status || row?.status || row?.submissionStatus || "not_started"
                ).toLowerCase(),
                marks:
                  row?.marks ??
                  row?.faculty_marks ??
                  row?.final_marks ??
                  row?.ai_marks ??
                  null,
              }));
              const hasRealStatus = rows.some((row) =>
                ["submitted", "evaluated", "approved", "pending", "draft"].includes(
                  String(row?.submission_status || "").toLowerCase()
                )
              );
              const hasRealMarks = rows.some((row) => Number(row?.marks) > 0);
              if (rows.length > 0 && (hasRealStatus || hasRealMarks)) {
                result = { rows, warning: null };
              }
            }
          } catch (manualErr) {
            console.warn(
              "[StudentsList] Manual API unavailable (CORS/offline); using Supabase:",
              manualErr?.message || manualErr
            );
          }
        }

        if (!result) {
          result = await getFacultyStudentsListResultUnified(subjectId);
        }
        if (alive) {
          setRows(Array.isArray(result?.rows) ? result.rows : []);
          setWarning(String(result?.warning || ""));
        }
      } catch (err) {
        console.error("Failed to load students:", err);
        if (alive) setError("Failed to load student data. Please try again.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [subjectId]);

  const subjectOptions = useMemo(() => {
    const set = new Set(rows.map((row) => row.subject).filter(Boolean));
    return ["all", ...Array.from(set)];
  }, [rows]);

  const semesterOptions = useMemo(() => {
    const set = new Set(rows.map((row) => String(row.semester || "-")));
    return ["all", ...Array.from(set)];
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (!isResolvedStudentRow(row)) return false;
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        safeStudentName(row.student_name).toLowerCase().includes(q) ||
        safeRegisterNo(row.register_no)
          .toLowerCase()
          .includes(q);
      const matchesSubject = subjectFilter === "all" || row.subject === subjectFilter;
      const matchesSemester =
        semesterFilter === "all" || String(row.semester || "-") === semesterFilter;
      return matchesSearch && matchesSubject && matchesSemester;
    });
  }, [rows, search, subjectFilter, semesterFilter]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="faculty-shimmer h-8 w-44 rounded bg-slate-200" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="faculty-shimmer h-11 rounded-lg border border-slate-200 bg-white" />
          <div className="faculty-shimmer h-11 rounded-lg border border-slate-200 bg-white" />
          <div className="faculty-shimmer h-11 rounded-lg border border-slate-200 bg-white" />
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="faculty-shimmer h-12 border-b border-slate-200 bg-slate-50" />
          <div className="space-y-2 p-4">
            {Array.from({ length: 7 }).map((_, idx) => (
              <div
                key={`students-table-skeleton-${idx}`}
                className="faculty-shimmer h-10 rounded-lg bg-slate-100"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
        <AlertCircle className="mx-auto mb-2 h-5 w-5 text-rose-600" />
        <p className="mb-1 text-sm font-semibold text-rose-700">Unable to load data</p>
        <p className="mb-4 text-sm text-rose-600">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm text-rose-700 transition-colors hover:bg-rose-100"
        >
          Reload
        </button>
      </div>
    );
  }

  return (
    <div className="text-slate-800">
      <div className="faculty-glass faculty-gradient-ring mb-6 flex items-center justify-between gap-3 rounded-3xl p-6">
        <div className="flex items-center gap-3">
          <Users className="h-7 w-7 text-blue-600" />
          <div>
            <h1 className="bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-3xl font-bold text-transparent">
              Students List
            </h1>
            <p className="text-sm text-slate-600">Monitor enrollment, status, and evaluation readiness.</p>
          </div>
        </div>
        <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs text-slate-600">
          {filtered.length} visible
        </span>
      </div>

      <div className="faculty-surface mb-6 grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800"
          />
        </div>
        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800"
        >
          {subjectOptions.map((subject) => (
            <option key={subject} value={subject}>
              {subject === "all" ? "All Subjects" : subject}
            </option>
          ))}
        </select>
        <select
          value={semesterFilter}
          onChange={(e) => setSemesterFilter(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800"
        >
          {semesterOptions.map((semester) => (
            <option key={semester} value={semester}>
              {semester === "all" ? "All Semesters" : `Semester ${semester}`}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">
          No resolved students found for this subject.
        </div>
      ) : (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="faculty-surface overflow-x-auto"
      >
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr>
                <th className="text-left px-4 py-3">Student Name</th>
                <th className="text-left px-4 py-3">Register Number</th>
                <th className="text-left px-4 py-3">Department</th>
                <th className="text-left px-4 py-3">Semester</th>
                <th className="text-left px-4 py-3">Subject</th>
                <th className="text-left px-4 py-3">Experiment</th>
                <th className="text-left px-4 py-3">Submission Status</th>
                <th className="text-left px-4 py-3">Marks</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 odd:bg-white even:bg-slate-50/40 transition-colors hover:bg-blue-50/60">
                  <td className="px-4 py-3">
                    {safeStudentName(row.student_name)}
                  </td>
                  <td className="px-4 py-3">{safeRegisterNo(row.register_no)}</td>
                  <td className="px-4 py-3">{formatDepartmentName(row.department, "-")}</td>
                  <td className="px-4 py-3">{row.semester || "-"}</td>
                  <td className="px-4 py-3">{row.subject || "-"}</td>
                  <td className="px-4 py-3">{row.experiment || row.experiment_title || "-"}</td>
                  <td className="px-4 py-3">
                    {(() => {
                      const s = (row.submission_status || "not_started").toLowerCase();
                      const labels = {
                        evaluated: "Evaluated",
                        submitted: "Submitted",
                        pending: "Pending",
                        not_started: "Not Started",
                        draft: "Draft",
                        locked: "Not Started",
                      };
                      const colors = {
                        evaluated: "border border-emerald-200 bg-emerald-50 text-emerald-700",
                        submitted: "border border-blue-200 bg-blue-50 text-blue-700",
                        pending: "border border-indigo-200 bg-indigo-50 text-indigo-700",
                        not_started: "border border-slate-200 bg-slate-50 text-slate-600",
                        draft: "border border-slate-200 bg-slate-50 text-slate-600",
                        locked: "border border-slate-200 bg-slate-50 text-slate-600",
                      };
                      return (
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colors[s] || colors.not_started}`}>
                          {labels[s] || s.replace(/_/g, " ")}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3">{row.marks ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}
    </div>
  );
}
