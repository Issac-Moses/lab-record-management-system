import { useCallback, useEffect, useMemo, useState } from "react";
import AdminShell from "@/layouts/AdminShell";
import ShellCard from "@/components/admin/ShellCard";
import EmptyState from "@/components/admin/EmptyState";
import { supabase } from "@/lib/supabase";
import { formatDepartmentName, formatDepartmentNameUpper } from "@/utils/departmentLabel";

type StudentRow = {
  student_id: string;
  full_name: string;
  register_no: string;
  department: string;
  year: string;
  semester: string;
  total_experiments: number;
  completed: number;
  total_marks: number;
};

function toNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function normalizeDept(value: string): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function departmentMatches(raw: unknown, selected: string): boolean {
  const a = normalizeDept(formatDepartmentNameUpper(raw || "", ""));
  const b = normalizeDept(selected || "");
  if (!b) return true;
  return a === b;
}

function isFacultyLikeName(value: string): boolean {
  const name = String(value || "").trim().toLowerCase();
  if (!name) return true;
  return /^(mr|mrs|ms|miss|dr|prof|sir)\b/.test(name);
}

function isValidRegisterNo(value: unknown): boolean {
  const registerNo = String(value || "").trim();
  if (!registerNo) return false;
  const lowered = registerNo.toLowerCase();
  return lowered !== "-" && lowered !== "null" && lowered !== "undefined";
}

export default function AdminStudents() {
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [department, setDepartment] = useState("");
  const [allowedDepartments, setAllowedDepartments] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("ALL");
  const [semesterFilter, setSemesterFilter] = useState("ALL");
  const [diagnostics, setDiagnostics] = useState({
    profilesTotal: 0,
    profilesScoped: 0,
    experimentRows: 0,
  });

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

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const profilesQuery = supabase
        .from("profiles")
        .select("id, name, register_no, department, year, semester, role")
        .eq("role", "student");
      const { data: profiles, error: profilesError } = await profilesQuery;
      if (profilesError) throw profilesError;

      const cleanProfiles = (profiles || []).filter((row) => {
        const name = String(row.name || "").trim();
        if (isFacultyLikeName(name)) return false;
        return isValidRegisterNo(row.register_no);
      });
      const scopedProfiles = cleanProfiles.filter((row) =>
        departmentMatches(row.department, department)
      );
      const studentIds = scopedProfiles.map((row) => String(row.id || "").trim()).filter(Boolean);

      let seRows: any[] = [];
      if (studentIds.length > 0) {
        const { data: seData, error: seError } = await supabase
          .from("student_experiments")
          .select("student_id, status, faculty_marks, ai_marks")
          .in("student_id", studentIds);
        if (seError) throw seError;
        seRows = seData || [];
      }

      const byStudent = new Map<string, StudentRow>();
      scopedProfiles.forEach((profile) => {
        const id = String(profile.id || "").trim();
        if (!id) return;
        byStudent.set(id, {
          student_id: id,
          full_name: String(profile.name || "Student").trim() || "Student",
          register_no: String(profile.register_no || "-"),
          department: formatDepartmentName(profile.department, "Unassigned"),
          year: String(profile.year || "-"),
          semester: String(profile.semester || "-"),
          total_experiments: 0,
          completed: 0,
          total_marks: 0,
        });
      });

      seRows.forEach((row) => {
        const sid = String(row.student_id || "").trim();
        if (!sid || !byStudent.has(sid)) return;
        const current = byStudent.get(sid)!;
        current.total_experiments += 1;
        const status = String(row.status || "").toLowerCase();
        if (status === "submitted" || status === "evaluated" || status === "approved") {
          current.completed += 1;
        }
        current.total_marks += toNumber(row.faculty_marks ?? row.ai_marks ?? 0);
      });

      setRows(Array.from(byStudent.values()).sort((a, b) => b.total_marks - a.total_marks));
      setDiagnostics({
        profilesTotal: cleanProfiles.length,
        profilesScoped: scopedProfiles.length,
        experimentRows: seRows.length,
      });
    } catch (loadError) {
      setRows([]);
      setError(loadError instanceof Error ? loadError.message : "Failed to load students.");
      setDiagnostics({ profilesTotal: 0, profilesScoped: 0, experimentRows: 0 });
    } finally {
      setLoading(false);
    }
  }, [department]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const yearOptions = useMemo(
    () => ["ALL", ...Array.from(new Set(rows.map((row) => String(row.year || "-")))).sort()],
    [rows]
  );
  const semesterOptions = useMemo(
    () => ["ALL", ...Array.from(new Set(rows.map((row) => String(row.semester || "-")))).sort()],
    [rows]
  );
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        row.full_name.toLowerCase().includes(q) ||
        row.register_no.toLowerCase().includes(q);
      const matchesYear = yearFilter === "ALL" || String(row.year || "-") === yearFilter;
      const matchesSemester =
        semesterFilter === "ALL" || String(row.semester || "-") === semesterFilter;
      return matchesSearch && matchesYear && matchesSemester;
    });
  }, [rows, search, yearFilter, semesterFilter]);
  const totalStudents = useMemo(() => filteredRows.length, [filteredRows]);

  return (
    <AdminShell title="Students">
      <div className="col-span-12">
        <ShellCard title="Admin Student Data (full_student_data)">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="grid w-full grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
              <select
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
              >
                {allowedDepartments.length === 0 ? (
                  <option value="">NO DEPARTMENT ASSIGNED</option>
                ) : (
                  allowedDepartments.map((dept) => (
                    <option key={dept} value={normalizeDept(dept)}>
                      {dept}
                    </option>
                  ))
                )}
              </select>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name / register no"
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
              />
              <select
                value={yearFilter}
                onChange={(event) => setYearFilter(event.target.value)}
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year === "ALL" ? "ALL YEARS" : `YEAR ${year}`}
                  </option>
                ))}
              </select>
              <select
                value={semesterFilter}
                onChange={(event) => setSemesterFilter(event.target.value)}
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
              >
                {semesterOptions.map((semester) => (
                  <option key={semester} value={semester}>
                    {semester === "ALL" ? "ALL SEMESTERS" : `SEMESTER ${semester}`}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void fetchData()}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
              >
                Refresh
              </button>
            </div>
            <span className="text-xs text-slate-600">{totalStudents} students</span>
          </div>

          <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
            Profiles (valid): {diagnostics.profilesTotal} · Scoped to department: {diagnostics.profilesScoped} · Student experiments rows: {diagnostics.experimentRows}
          </div>

          {error ? (
            <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          {loading ? (
            <p className="text-sm text-slate-500">Loading students...</p>
          ) : filteredRows.length === 0 ? (
            <EmptyState title="No records found" description="No student rows matched selected filters." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-slate-600">Full Name</th>
                    <th className="px-4 py-2.5 text-left text-slate-600">Register No</th>
                    <th className="px-4 py-2.5 text-left text-slate-600">Department</th>
                    <th className="px-4 py-2.5 text-left text-slate-600">Year</th>
                    <th className="px-4 py-2.5 text-left text-slate-600">Semester</th>
                    <th className="px-4 py-2.5 text-left text-slate-600">Total Experiments</th>
                    <th className="px-4 py-2.5 text-left text-slate-600">Completed</th>
                    <th className="px-4 py-2.5 text-left text-slate-600">Total Marks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredRows.map((row) => (
                    <tr key={row.student_id} className="bg-white">
                      <td className="px-4 py-2.5 text-slate-800">{row.full_name}</td>
                      <td className="px-4 py-2.5 text-slate-600">{row.register_no}</td>
                      <td className="px-4 py-2.5 text-slate-600">{formatDepartmentName(row.department, "Unassigned")}</td>
                      <td className="px-4 py-2.5 text-slate-600">{row.year}</td>
                      <td className="px-4 py-2.5 text-slate-600">{row.semester}</td>
                      <td className="px-4 py-2.5 text-slate-600">{row.total_experiments}</td>
                      <td className="px-4 py-2.5 text-slate-600">{row.completed}</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-800">{row.total_marks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ShellCard>
      </div>
    </AdminShell>
  );
}
