import { useEffect, useMemo, useState } from "react";
import AdminShell from "@/layouts/AdminShell";
import ShellCard from "@/components/admin/ShellCard";
import DataTable from "@/components/admin/DataTable";
import StudentCard from "@/components/admin/StudentCard";
import EmptyState from "@/components/admin/EmptyState";
import FadeSwitch from "@/components/admin/FadeSwitch";
import StudentDetailsModal from "@/components/admin/StudentDetailsModal";
import { getStudentsPageData } from "@/services/adminDataService";
import { requestAdminApi, parseAdminApiError } from "@/services/adminApiClient";
import { supabase } from "@/lib/supabase";

function normalizeDepartmentKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeYearValue(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  const digitMatch = raw.match(/\b([1-4])\b/);
  if (digitMatch?.[1]) return digitMatch[1];
  const compact = raw.replace(/[^a-z0-9]/g, "");
  if (compact === "i" || compact === "first" || compact === "1st" || compact === "year1") return "1";
  if (compact === "ii" || compact === "second" || compact === "2nd" || compact === "year2") return "2";
  if (compact === "iii" || compact === "third" || compact === "3rd" || compact === "year3") return "3";
  if (compact === "iv" || compact === "fourth" || compact === "4th" || compact === "year4") return "4";
  return "";
}

function normalizeSemesterValue(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  const digitAnywhere = raw.match(/([1-8])/);
  if (digitAnywhere?.[1]) return digitAnywhere[1];
  const compact = raw.replace(/[^a-z0-9]/g, "");
  const token = compact
    .replace(/^semester/, "")
    .replace(/^sem/, "")
    .replace(/^s/, "")
    .replace(/(st|nd|rd|th)$/i, "");
  const romanMap = {
    i: "1",
    ii: "2",
    iii: "3",
    iv: "4",
    v: "5",
    vi: "6",
    vii: "7",
    viii: "8",
  };
  if (romanMap[token]) return romanMap[token];
  return "";
}

function semesterAllowedForYear(selectedYear, selectedSemester) {
  if (selectedYear === "all" || selectedSemester === "all") return true;
  const map = {
    "1": new Set(["1", "2"]),
    "2": new Set(["3", "4"]),
    "3": new Set(["5", "6"]),
    "4": new Set(["7", "8"]),
  };
  return Boolean(map[String(selectedYear || "")]?.has(String(selectedSemester || "")));
}

export default function Students() {
  const [query, setQuery] = useState("");
  const [year, setYear] = useState("all");
  const [semester, setSemester] = useState("all");
  const [view, setView] = useState("grid");
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adminDept, setAdminDept] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("view");
  const [modalStudent, setModalStudent] = useState(null);
  const [semesterScopedStudentIds, setSemesterScopedStudentIds] = useState(null);
  const [semesterScopeLoading, setSemesterScopeLoading] = useState(false);

  useEffect(() => {
    let alive = true;

    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session || !alive) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("department")
        .eq("id", sessionData.session.user.id)
        .maybeSingle();

      const dept = String(profile?.department || "").trim();
      if (!alive) return;
      setAdminDept(dept);

      const result = await getStudentsPageData(dept || undefined);
      if (alive) {
        setData(result);
        setLoading(false);
      }
    }

    load();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadSemesterScopeIds() {
      if (semester === "all") {
        if (alive) {
          setSemesterScopedStudentIds(null);
          setSemesterScopeLoading(false);
        }
        return;
      }

      setSemesterScopeLoading(true);
      try {
        const { data: rows, error } = await supabase
          .from("student_subjects")
          .select("student_id, subjects!inner(id, semester, year, department)")
          .not("student_id", "is", null)
          .limit(20000);
        if (error) throw error;

        const targetSemester = String(semester || "").trim();
        const targetYear = String(year || "").trim();
        const targetDept = normalizeDepartmentKey(adminDept);
        const scopedIds = new Set();

        (Array.isArray(rows) ? rows : []).forEach((row) => {
          const subject = row?.subjects;
          if (!subject) return;
          const subjectSemester = normalizeSemesterValue(subject.semester);
          if (subjectSemester !== targetSemester) return;

          if (targetYear !== "all") {
            const subjectYear = normalizeYearValue(subject.year);
            if (subjectYear !== targetYear) return;
          }

          if (targetDept) {
            const subjectDept = normalizeDepartmentKey(subject.department);
            if (subjectDept && subjectDept !== targetDept) return;
          }

          const studentId = String(row?.student_id || "").trim();
          if (studentId) scopedIds.add(studentId);
        });

        if (!alive) return;
        setSemesterScopedStudentIds(scopedIds);
      } catch (error) {
        console.error("Semester scope mapping load failed:", error);
        if (!alive) return;
        // Fallback to year-only visibility instead of blank list if mapping query fails.
        setSemesterScopedStudentIds(null);
      } finally {
        if (alive) setSemesterScopeLoading(false);
      }
    }

    loadSemesterScopeIds();
    return () => {
      alive = false;
    };
  }, [semester, year, adminDept]);

  const filtered = useMemo(() => {
    if (!semesterAllowedForYear(year, semester)) return [];
    return data
      .filter((row) => {
      const q = query.trim().toLowerCase();
      const queryMatch = !q || row.name.toLowerCase().includes(q) || row.registerNo.toLowerCase().includes(q);
      const normalizedYear = normalizeYearValue(row.year);
      const yearMatch = year === "all" || normalizedYear === year;
      const semesterMatch =
        semester === "all" ||
        semesterScopedStudentIds === null ||
        semesterScopedStudentIds.has(String(row.id || "").trim());
      return queryMatch && yearMatch && semesterMatch;
    })
      .sort((a, b) => {
        const yearOrder = Number(a.year || 0) - Number(b.year || 0);
        if (yearOrder !== 0) return yearOrder;
        const semOrder = Number(a.semester || 0) - Number(b.semester || 0);
        if (semOrder !== 0) return semOrder;
        return String(a.name || "").localeCompare(String(b.name || ""));
      });
  }, [data, query, semester, year, semesterScopedStudentIds]);

  async function reloadStudents() {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("department")
      .eq("id", sessionData.session.user.id)
      .maybeSingle();
    const dept = String(profile?.department || "").trim();
    const result = await getStudentsPageData(dept || undefined);
    setData(result);
  }

  function handleViewStudent(student) {
    setModalStudent({
      ...student,
      register_no: student.register_no || student.registerNo || "",
    });
    setModalMode("view");
    setModalOpen(true);
  }

  function handleEditStudent(student) {
    setModalStudent({
      ...student,
      register_no: student.register_no || student.registerNo || "",
    });
    setModalMode("edit");
    setModalOpen(true);
  }

  async function handleRemoveStudent(student) {
    const confirmDelete = window.confirm(`Remove student "${student.name}"?`);
    if (!confirmDelete) return;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        window.alert("Session expired. Please login again.");
        return;
      }
      const { response } = await requestAdminApi("admin/remove-user", {
        method: "DELETE",
        payload: { user_id: student.id },
        token,
      });
      if (!response.ok) {
        const message = await parseAdminApiError(response, "Failed to remove student");
        throw new Error(message);
      }
      await reloadStudents();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Failed to remove student");
    }
  }

  async function handleModalSave(form) {
    if (!modalStudent) return;
    try {
      const updatePayload = {
        name: String(form.name || "").trim(),
        email: String(form.email || "").trim(),
        register_no: String(form.register_no || "").trim(),
        department: String(form.department || "").trim(),
      };
      const { error } = await supabase.from("profiles").update(updatePayload).eq("id", modalStudent.id);
      if (error) throw error;
      setModalOpen(false);
      setModalStudent(null);
      await reloadStudents();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Failed to update student");
    }
  }

  return (
    <AdminShell title="Students">
      <StudentDetailsModal
        open={modalOpen}
        mode={modalMode}
        student={modalStudent}
        onClose={() => {
          setModalOpen(false);
          setModalStudent(null);
        }}
        onSave={handleModalSave}
      />
      <div className="col-span-12">
        <ShellCard title={adminDept ? `Student Manager — ${adminDept}` : "Student Manager"}>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search students..."
              className="min-w-56 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
            />
            <select value={year} onChange={(e) => setYear(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
              <option value="all">All Years</option>
              <option value="1">Year 1</option>
              <option value="2">Year 2</option>
              <option value="3">Year 3</option>
              <option value="4">Year 4</option>
            </select>
            <select value={semester} onChange={(e) => setSemester(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
              <option value="all">All Semesters</option>
              <option value="1">Sem 1</option>
              <option value="2">Sem 2</option>
              <option value="3">Sem 3</option>
              <option value="4">Sem 4</option>
              <option value="5">Sem 5</option>
              <option value="6">Sem 6</option>
              <option value="7">Sem 7</option>
              <option value="8">Sem 8</option>
            </select>
            <div className="ml-auto flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button onClick={() => setView("grid")} className={`rounded-lg px-2 py-1 text-xs transition ${view === "grid" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>Grid</button>
              <button onClick={() => setView("table")} className={`rounded-lg px-2 py-1 text-xs transition ${view === "table" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>Table</button>
            </div>
          </div>

          <FadeSwitch
            loading={loading || semesterScopeLoading}
            skeleton={
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, idx) => (
                  <div key={`student-skeleton-${idx}`} className="faculty-shimmer h-52 animate-pulse rounded-2xl border border-slate-200 bg-white" />
                ))}
              </div>
            }
          >
            {view === "grid" ? (
              filtered.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {filtered.map((student) => (
                    <StudentCard
                      key={student.id}
                      student={student}
                      onView={handleViewStudent}
                      onEdit={handleEditStudent}
                      onRemove={handleRemoveStudent}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title={data.length === 0 ? "No students available" : "No students match current filters"}
                  description={
                    data.length === 0
                      ? "Student records will appear here after they are added to the system."
                      : "Try changing department, year, semester, or search text."
                  }
                />
              )
            ) : filtered.length > 0 ? (
              <DataTable
                columns={[
                  { key: "registerNo", label: "Roll No" },
                  { key: "name", label: "Name" },
                  { key: "department", label: "Dept" },
                  { key: "year", label: "Year" },
                  { key: "semester", label: "Semester" },
                  { key: "avgGrade", label: "Avg Grade" },
                  { key: "status", label: "Status" },
                ]}
                data={filtered}
              />
            ) : (
              <EmptyState
                title={data.length === 0 ? "No students available" : "No students match current filters"}
                description={
                  data.length === 0
                    ? "Student records will appear here after they are added to the system."
                    : "Try changing department, year, semester, or search text."
                }
              />
            )}
          </FadeSwitch>
        </ShellCard>
      </div>
    </AdminShell>
  );
}

