import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
// @ts-ignore – JS component without declaration file
import AdminShell from "@/layouts/AdminShell";
// @ts-ignore – JS component without declaration file
import ShellCard from "@/components/admin/ShellCard";
// @ts-ignore – JS component without declaration file
import EmptyState from "@/components/admin/EmptyState";
import { supabase } from "@/lib/supabase";
import { formatDepartmentName, formatDepartmentNameUpper } from "@/utils/departmentLabel";
// @ts-ignore – JS helper without declaration file
import { checkIsLate } from "@/utils/statusConfig";
// @ts-ignore – JS component without declaration file
import AdminProctorPanel from "@/pages/Admin/AdminProctorPanel.jsx";
import { Search, Filter, BookOpen, Calendar } from "lucide-react";

type SubmissionRow = {
  id: string;
  student_name: string;
  register_no: string;
  subject_id: string;
  subject_name: string;
  year: string;
  semester: string;
  experiment: string;
  status: string;
  marks: number;
  submitted_date: string;
  due_date?: string;
  department: string;
};

type SubjectOption = {
  id: string;
  name: string;
  code?: string;
  year?: string | number;
  semester?: string | number;
  department?: string;
};

function toNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatDate(value: string): string {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

function isFacultyLikeName(value: string): boolean {
  const name = String(value || "").trim().toLowerCase();
  if (!name) return false;
  if (/^(mr|mrs|ms|miss|dr|prof|sir)\b/.test(name)) return true;
  if (name.includes("faculty") || name.includes("admin")) return true;
  return false;
}

function isValidRegisterNo(value: unknown): boolean {
  const registerNo = String(value || "").trim();
  if (!registerNo) return false;
  const lowered = registerNo.toLowerCase();
  return lowered !== "-" && lowered !== "null" && lowered !== "undefined";
}

function normalizeYear(year: unknown): string {
  const y = String(year || "").trim();
  if (!y) return "";
  const match = y.match(/\d+/);
  return match ? match[0] : y;
}

function normalizeSemester(sem: unknown): string {
  const s = String(sem || "").trim();
  if (!s) return "";
  const match = s.match(/\d+/);
  return match ? match[0] : s;
}

function toCsv(rows: SubmissionRow[]): string {
  const headers = [
    "Student Name",
    "Register No",
    "Subject",
    "Year",
    "Semester",
    "Experiment",
    "Status",
    "Marks",
    "Submission Date",
    "Department",
  ];
  const body = rows.map((row) => [
    row.student_name,
    row.register_no,
    row.subject_name,
    row.year,
    row.semester,
    row.experiment,
    row.status,
    String(row.marks),
    row.submitted_date,
    row.department,
  ]);
  const lines = [headers, ...body].map((columns) =>
    columns
      .map((column) => `"${String(column || "").replace(/"/g, '""')}"`)
      .join(",")
  );
  return lines.join("\n");
}

function normalizeDeptString(value: unknown): string {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  const compact = normalized.replace(/\s+/g, "");
  const aliases: Record<string, string> = {
    it: "information technology",
    infotech: "information technology",
    informationtechnology: "information technology",
    aids: "artificial intelligence data science",
    artificialintelligenceanddatascience: "artificial intelligence data science",
    cse: "computer science and engineering",
    computerscienceandengineering: "computer science and engineering",
    csbs: "computer science and business systems",
  };
  return aliases[compact] || normalized;
}

function deptMatchRelaxed(studentDept: unknown, adminDept: unknown, subjectDept?: unknown): boolean {
  const b = normalizeDeptString(adminDept);
  if (!b) return true; // No admin department constraint
  const a = normalizeDeptString(studentDept);
  const c = normalizeDeptString(subjectDept);
  
  // If student profile department is missing or unassigned, include them by default so valid student work is never hidden
  if (!a && !c) return true;
  if (!a || a === "unassigned" || a === "null" || a === "undefined") return true;

  if (a && (a === b || a.includes(b) || b.includes(a))) return true;
  if (c && (c === b || c.includes(b) || b.includes(c))) return true;
  return false;
}

export default function AdminSubmissions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const reportTab = searchParams.get("tab") === "proctor" ? "proctor" : "submissions";
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [department, setDepartment] = useState("");
  const [allowedDepartments, setAllowedDepartments] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedSemester, setSelectedSemester] = useState<string>("");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    let active = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !active) return;
      const { data } = await supabase
        .from("profiles")
        .select("department")
        .eq("id", user.id)
        .maybeSingle();
      if (!active) return;
      const adminDept = formatDepartmentNameUpper(data?.department || "", "");
      if (adminDept) {
        setAllowedDepartments([adminDept]);
        setDepartment(adminDept);
      } else {
        setAllowedDepartments([]);
        setDepartment("");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Fetch subjects list for dropdown filtering
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("subjects")
        .select("id, name, code, year, semester, department")
        .order("year", { ascending: true })
        .order("name", { ascending: true });

      if (active && data) {
        setSubjects(data as SubjectOption[]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Filter subjects list based on selected Year/Semester/Dept
  const filteredSubjectsList = useMemo(() => {
    const list = subjects.filter((s) => {
      if (department && s.department && !deptMatchRelaxed(s.department, department)) {
        return false;
      }
      if (selectedYear && normalizeYear(s.year) !== selectedYear) {
        return false;
      }
      if (selectedSemester && normalizeSemester(s.semester) !== selectedSemester) {
        return false;
      }
      return true;
    });
    if (list.length === 0 && selectedYear) {
      return subjects.filter((s) => {
        if (department && s.department && !deptMatchRelaxed(s.department, department)) return false;
        return normalizeYear(s.year) === selectedYear;
      });
    }
    return list;
  }, [subjects, department, selectedYear, selectedSemester]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Build lookup map of subjects for canonical title & metadata resolution
      const { data: subjectsData } = await supabase
        .from("subjects")
        .select("id, name, code, year, semester, department");
      
      const subjectMap = new Map<string, SubjectOption>();
      if (Array.isArray(subjectsData)) {
        subjectsData.forEach((s) => subjectMap.set(String(s.id), s as SubjectOption));
      }

      // Fetch from direct submissions table, exam_submissions, AND full_student_data view for complete coverage
      const [subsRes, viewRes, examSubsRes] = await Promise.all([
        supabase
          .from("submissions")
          .select(`
            id,
            student_id,
            status,
            marks,
            faculty_marks,
            final_marks,
            ai_marks,
            updated_at,
            submitted_date,
            created_at,
            profiles ( id, name, full_name, register_no, department, year, semester ),
            experiments ( id, title, experiment_no, subject_id, subjects ( id, name, code, year, semester, department ) )
          `),
        supabase.from("full_student_data").select("*"),
        supabase.from("exam_submissions").select("*"),
      ]);

      const subMap = new Map<string, any>();

      if (Array.isArray(subsRes.data)) {
        subsRes.data.forEach((s: any) => {
          if (s.id) subMap.set(String(s.id), s);
        });
      }

      if (Array.isArray(viewRes.data)) {
        viewRes.data.forEach((v: any) => {
          const key = String(v.id || `${v.student_id}-${v.experiment_title || v.title}`);
          if (!subMap.has(key)) {
            subMap.set(key, v);
          }
        });
      }

      if (Array.isArray(examSubsRes.data)) {
        examSubsRes.data.forEach((ex: any) => {
          const key = String(ex.id || `exam-${ex.student_id}-${ex.exp_id}`);
          if (!subMap.has(key)) {
            subMap.set(key, {
              ...ex,
              status: ex.status || "submitted",
              submitted_date: ex.submitted_at || ex.created_at,
            });
          }
        });
      }

      const rawRows = Array.from(subMap.values());

      // Fetch profiles in bulk to cross-enrich student names & register numbers
      const studentIds = Array.from(
        new Set(rawRows.map((r: any) => String(r.student_id || "")).filter(Boolean))
      );

      const profileMap = new Map<string, any>();
      if (studentIds.length > 0) {
        const { data: profileList } = await supabase
          .from("profiles")
          .select("id, name, full_name, register_no, department, year, semester")
          .in("id", studentIds);
        if (Array.isArray(profileList)) {
          profileList.forEach((p: any) => {
            if (p.id) profileMap.set(String(p.id), p);
          });
        }
      }

      const mapped: SubmissionRow[] = rawRows
        .filter((row: any) => {
          const profile = profileMap.get(String(row.student_id)) || row.profiles || {};
          const experiment = row.experiments || {};
          const subjectFromExp = experiment.subjects || {};
          const studentDept = profile.department || row.department;
          const subjectDept = subjectFromExp.department;

          if (department && !deptMatchRelaxed(studentDept, department, subjectDept)) {
            return false;
          }
          const name = String(row.student_name || row.full_name || row.name || profile.full_name || profile.name || "").trim();
          if (isFacultyLikeName(name)) return false;
          return true;
        })
        .map((row: any, index: number) => {
          const profile = profileMap.get(String(row.student_id)) || row.profiles || {};
          const experiment = row.experiments || {};
          const subjectFromExp = experiment.subjects || {};

          const studentName = String(row.student_name || row.full_name || row.name || profile.full_name || profile.name || "Student").trim();
          const regNo = String(profile.register_no || row.register_no || row.register_number || "-").trim();
          
          const rawSubId = String(subjectFromExp.id || experiment.subject_id || row.subject_id || row.exp_id || "");
          const matchedSubjectObj = subjectMap.get(rawSubId);

          const subjectId = rawSubId || (matchedSubjectObj ? matchedSubjectObj.id : "");
          const subjectName = String(matchedSubjectObj?.name || subjectFromExp.name || row.subject_name || row.subject || "General Lab");
          
          const year = String(normalizeYear(matchedSubjectObj?.year || subjectFromExp.year || profile.year || row.year || "-"));
          const semester = String(normalizeSemester(matchedSubjectObj?.semester || subjectFromExp.semester || profile.semester || row.semester || "-"));
          
          const expTitle = String(experiment.title || row.experiment_title || row.experiment_name || row.title || "Experiment");
          const dueDate = String(experiment.due_date || row.due_date || "");
          const submittedDate = String(row.submitted_date || row.submission_date || row.updated_at || row.created_at || "");
          
          let status = String(row.status || "pending");
          if ((status.toLowerCase() === "submitted" || status.toLowerCase() === "evaluated" || status.toLowerCase() === "completed") && checkIsLate(submittedDate, dueDate)) {
            status = "submitted (late)";
          }
          const marks = toNumber(row.final_marks ?? row.faculty_marks ?? row.ai_marks ?? row.marks ?? 0);
          const dept = formatDepartmentName(profile.department || row.department, "Information Technology");

          return {
            id: String(row.id || `${row.student_id || "s"}-${index}`),
            student_name: studentName,
            register_no: regNo,
            subject_id: subjectId,
            subject_name: subjectName,
            year: year || "-",
            semester: semester || "-",
            experiment: expTitle,
            status,
            marks,
            submitted_date: submittedDate,
            due_date: dueDate,
            department: dept,
          };
        });

      setRows(mapped);
    } catch (loadError) {
      setRows([]);
      setError(loadError instanceof Error ? loadError.message : "Failed to load submissions.");
    } finally {
      setLoading(false);
    }
  }, [department]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const [statusFilter, setStatusFilter] = useState<string>("completed");

  // Client-side filtering by Year, Semester, Subject, Status, Search Query
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const statusLower = r.status.toLowerCase();
      const isSearching = Boolean(searchQuery.trim());
      if (
        !isSearching &&
        statusFilter === "completed" &&
        !(
          statusLower === "submitted" ||
          statusLower === "evaluated" ||
          statusLower === "completed" ||
          r.marks > 0
        )
      ) {
        return false;
      }

      // If a specific subject is selected, match by subject ID or subject name
      if (selectedSubjectId) {
        const selectedSubObj = subjects.find((s) => s.id === selectedSubjectId);
        const selectedSubName = selectedSubObj ? selectedSubObj.name.toLowerCase().trim() : "";
        const rowSubName = r.subject_name.toLowerCase().trim();
        const rowSubId = r.subject_id;
        const matchesSubject =
          (rowSubId && rowSubId === selectedSubjectId) ||
          (selectedSubName && (rowSubName === selectedSubName || rowSubName.includes(selectedSubName) || selectedSubName.includes(rowSubName)));
        if (!matchesSubject) return false;
      } else {
        // Apply Year / Semester filters when no specific subject is selected
        if (selectedYear && r.year && r.year !== "-" && r.year !== selectedYear) return false;
        if (selectedSemester && r.semester && r.semester !== "-" && r.semester !== selectedSemester) return false;
      }

      // Search Query
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const studentMatch = r.student_name.toLowerCase().includes(q);
        const regMatch = r.register_no.toLowerCase().includes(q);
        const expMatch = r.experiment.toLowerCase().includes(q);
        const subMatch = r.subject_name.toLowerCase().includes(q);
        if (!studentMatch && !regMatch && !expMatch && !subMatch) return false;
      }
      return true;
    });
  }, [rows, statusFilter, selectedYear, selectedSemester, selectedSubjectId, searchQuery, subjects]);

  // Give highest priority to completed experiments, higher marks/points, and recent submissions
  const sortedRows = useMemo(
    () =>
      filteredRows
        .slice()
        .sort((a, b) => {
          // Priority 1: Evaluated/Completed (3) > Submitted (2) > Pending (1)
          const getStatusPriority = (status: string, marks: number) => {
            const s = String(status || "").toLowerCase();
            if (s === "evaluated" || s === "completed") return 3;
            if (s === "submitted" || marks > 0) return 2;
            return 1;
          };

          const priA = getStatusPriority(a.status, a.marks);
          const priB = getStatusPriority(b.status, b.marks);
          if (priA !== priB) return priB - priA;

          // Priority 2: Higher marks/points first
          if (b.marks !== a.marks) return b.marks - a.marks;

          // Priority 3: Recent submission date first
          const dateA = new Date(a.submitted_date || 0).getTime();
          const dateB = new Date(b.submitted_date || 0).getTime();
          return dateB - dateA;
        }),
    [filteredRows]
  );

  const downloadCsv = () => {
    if (!sortedRows.length) {
      setError("No records found for CSV export.");
      return;
    }
    const csv = toCsv(sortedRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "admin_submissions_report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = () => {
    if (!sortedRows.length) {
      setError("No records found for PDF export.");
      return;
    }
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(12);
    doc.text("Admin Submissions Report", 14, 14);
    autoTable(doc, {
      startY: 20,
      head: [["Student Name", "Register No", "Subject", "Year / Sem", "Experiment", "Status", "Marks", "Date", "Dept"]],
      body: sortedRows.map((row) => [
        row.student_name,
        row.register_no,
        row.subject_name,
        `Yr ${row.year} / Sem ${row.semester}`,
        row.experiment,
        row.status,
        String(row.marks),
        formatDate(row.submitted_date),
        row.department,
      ]),
      styles: { fontSize: 8 },
    });
    doc.save("admin_submissions_report.pdf");
  };

  return (
    <AdminShell title="Reports">
      <div className="col-span-12 mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSearchParams({})}
          className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
            reportTab === "submissions"
              ? "border-blue-200 bg-blue-50 text-blue-800"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          Submissions
        </button>
        <button
          type="button"
          onClick={() => setSearchParams({ tab: "proctor" })}
          className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
            reportTab === "proctor"
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          Proctor
        </button>
      </div>

      {reportTab === "proctor" ? (
        <div className="col-span-12 space-y-4">
          <p className="text-sm text-slate-600">
            Live exam sessions and violation events for your deployment.
          </p>
          <AdminProctorPanel />
        </div>
      ) : (
      <div className="col-span-12">
        <ShellCard title="Academic Submissions & Experiment Audit">
          {/* FILTER CONTROLS */}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Department Selector */}
              <select
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">ALL DEPARTMENTS</option>
                {allowedDepartments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>

              {/* Year Selector */}
              <select
                value={selectedYear}
                onChange={(e) => {
                  setSelectedYear(e.target.value);
                  setSelectedSubjectId("");
                }}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">ALL YEARS</option>
                <option value="1">1st Year</option>
                <option value="2">2nd Year</option>
                <option value="3">3rd Year</option>
                <option value="4">4th Year</option>
              </select>

              {/* Semester Selector */}
              <select
                value={selectedSemester}
                onChange={(e) => {
                  setSelectedSemester(e.target.value);
                  setSelectedSubjectId("");
                }}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">ALL SEMESTERS</option>
                <option value="1">Semester 1</option>
                <option value="2">Semester 2</option>
                <option value="3">Semester 3</option>
                <option value="4">Semester 4</option>
                <option value="5">Semester 5</option>
                <option value="6">Semester 6</option>
                <option value="7">Semester 7</option>
                <option value="8">Semester 8</option>
              </select>

              {/* Status Filter Selector */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 rounded-lg border border-emerald-300 bg-emerald-50/50 px-3 text-sm font-semibold text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="completed">Completed / Submitted Only</option>
                <option value="all">All (Including Pending)</option>
              </select>

              {/* Subject Selector */}
              <select
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                className="h-10 max-w-[260px] truncate rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">ALL SUBJECTS ({filteredSubjectsList.length})</option>
                {filteredSubjectsList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.year ? `(Yr ${s.year})` : ""}
                  </option>
                ))}
              </select>

              {/* Search Bar */}
              <div className="relative flex items-center">
                <Search className="absolute left-3 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search student, reg no, experiment..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[220px]"
                />
              </div>

              <button
                type="button"
                onClick={() => void fetchData()}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 transition"
              >
                Refresh
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={downloadCsv}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 transition"
              >
                Download CSV
              </button>
              <button
                type="button"
                onClick={downloadPdf}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 transition"
              >
                Download PDF
              </button>
            </div>
          </div>

          {error ? (
            <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          {loading ? (
            <p className="text-sm text-slate-500">Loading academic submissions...</p>
          ) : sortedRows.length === 0 ? (
            <EmptyState title="No records found" description="No student submissions match the selected filters." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-xs">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Student Name</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Register No</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Subject</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">Yr / Sem</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Experiment</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">Marks</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Submission Date</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Department</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {sortedRows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-4 py-3 font-medium text-slate-900">{row.student_name}</td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-600">{row.register_no}</td>
                      <td className="px-4 py-3 text-slate-800 font-medium">
                        <span className="truncate max-w-[200px] block" title={row.subject_name}>
                          {row.subject_name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs font-semibold text-slate-600">
                        Yr {row.year} / S{row.semester}
                      </td>
                      <td className="px-4 py-3 text-slate-700 max-w-[220px] truncate" title={row.experiment}>
                        {row.experiment}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            row.status.toLowerCase() === "evaluated" || row.status.toLowerCase() === "completed"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : row.status.toLowerCase() === "submitted"
                                ? "bg-blue-50 text-blue-700 border border-blue-200"
                                : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-slate-800">
                        {row.marks > 0 ? `${row.marks}/10` : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{formatDate(row.submitted_date)}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{row.department}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ShellCard>
      </div>
      )}
    </AdminShell>
  );
}
