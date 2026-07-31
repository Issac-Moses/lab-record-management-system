import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BookOpen,
  FilePlus2,
  Loader2,
  LogOut,
  GraduationCap,
  ArrowRight,
  ClipboardList,
  ChevronRight,
  Users,
  BarChart3,
  Clock,
  Plus,
  Sparkles,
  Building2,
  FlaskConical,
  FileText,
  ExternalLink,
  Zap,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { clearAllUserScope } from "@/lib/clientSession";

type FacultySubject = {
  subject_id: string;
  subjects: {
    id: string;
    name: string;
    code: string | null;
    year: string | null;
    semester: string | null;
    department: string | null;
  };
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

function isSameDept(d1: string | null | undefined, d2: string | null | undefined): boolean {
  const k1 = normalizeDepartmentKey(d1);
  const k2 = normalizeDepartmentKey(d2);
  if (!k1 || !k2) return true;
  if (k1 === k2) return true;
  if ((k1.includes("it") || k1.includes("information")) && (k2.includes("it") || k2.includes("information"))) return true;
  if ((k1.includes("cs") || k1.includes("computer")) && (k2.includes("cs") || k2.includes("computer"))) return true;
  if (k1.includes("aids") && k2.includes("aids")) return true;
  return k1.includes(k2) || k2.includes(k1);
}

export default function FacultySubjectSelect() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hasAutoNavigatedRef = useRef(false);
  const [subjects, setSubjects] = useState<FacultySubject[]>([]);
  const [facultyProfile, setFacultyProfile] = useState<{
    name: string;
    department: string;
    year: string;
    semester: string;
    role: string;
  }>({ name: "Faculty", department: "", year: "", semester: "", role: "faculty" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const shouldAutoSelect = searchParams.get("auto") === "1";

  useEffect(() => {
    async function load() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          navigate("/login");
          return;
        }

        const profileRes = await supabase
          .from("profiles")
          .select("name, department, year, semester, role")
          .eq("id", user.id)
          .maybeSingle();

        const userRole = String(profileRes.data?.role || "faculty").toLowerCase();
        const userDept = String(profileRes.data?.department || "").trim();

        if (profileRes.data) {
          setFacultyProfile({
            name: profileRes.data.name || "Faculty Member",
            department: userDept,
            year: String(profileRes.data.year || ""),
            semester: String(profileRes.data.semester || ""),
            role: userRole,
          });
        }

        const facultyDepartment = normalizeDepartmentKey(userDept);

        // Fetch explicitly assigned subjects
        const { data: mappedData, error: fetchError } = await supabase
          .from("faculty_subjects")
          .select(
            `
            subject_id,
            subjects (
              id,
              name,
              code,
              year,
              semester,
              department
            )
          `
          )
          .eq("faculty_id", user.id);

        if (fetchError) {
          setError(fetchError.message);
          setLoading(false);
          return;
        }

        const mappedList = ((mappedData || []) as unknown as FacultySubject[]).filter((row) => {
          if (!row?.subject_id || !row?.subjects?.id || !row?.subjects?.name) return false;
          if (facultyDepartment && !isSameDept(facultyDepartment, row.subjects.department)) {
            return false;
          }
          return true;
        });

        let finalSubjects: FacultySubject[] = [...mappedList];

        // If user is Admin / HOD, also load all subjects belonging to their department
        if (userRole === "admin" || userRole === "hod") {
          const { data: allDeptSubjects } = await supabase
            .from("subjects")
            .select("id, name, code, year, semester, department");

          const existingIds = new Set(mappedList.map((s) => String(s.subjects?.id || s.subject_id)));

          (allDeptSubjects || []).forEach((sub) => {
            if (isSameDept(facultyDepartment, sub.department) && !existingIds.has(String(sub.id))) {
              finalSubjects.push({
                subject_id: String(sub.id),
                subjects: {
                  id: String(sub.id),
                  name: String(sub.name),
                  code: sub.code ? String(sub.code) : null,
                  year: sub.year ? String(sub.year) : null,
                  semester: sub.semester ? String(sub.semester) : null,
                  department: sub.department ? String(sub.department) : null,
                },
              });
            }
          });
        }

        if (shouldAutoSelect && !hasAutoNavigatedRef.current && finalSubjects.length === 1 && userRole !== "admin") {
          const onlySubject = finalSubjects[0];
          const subjectId = String(onlySubject?.subject_id || onlySubject?.subjects?.id || "").trim();
          const subjectName = String(onlySubject?.subjects?.name || "").trim();
          if (subjectId && subjectName) {
            hasAutoNavigatedRef.current = true;
            localStorage.setItem("faculty_subject_id", subjectId);
            localStorage.setItem("faculty_subject_name", subjectName);
            navigate("/faculty", { replace: true });
            return;
          }
        }

        setSubjects(finalSubjects);
        setLoading(false);
      } catch (err) {
        console.error("Failed to load subjects:", err);
        setError("Failed to load subjects. Please try again.");
        setLoading(false);
      }
    }

    load();
  }, [navigate, shouldAutoSelect]);

  function selectSubject(subjectId: string, subjectName: string) {
    localStorage.setItem("faculty_subject_id", subjectId);
    localStorage.setItem("faculty_subject_name", subjectName);
    navigate("/faculty", { replace: true });
  }

  function openSubjectRoute(subjectId: string, subjectName: string, path: string) {
    localStorage.setItem("faculty_subject_id", subjectId);
    localStorage.setItem("faculty_subject_name", subjectName);
    navigate(path);
  }

  const isAdminOrHod = facultyProfile.role === "admin" || facultyProfile.role === "hod" || facultyProfile.name.includes("HOD");

  if (loading) {
    return (
      <div className="faculty-bg-vibrant flex min-h-screen items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="faculty-glass faculty-gradient-ring flex flex-col items-center gap-4 rounded-3xl px-10 py-10 shadow-lg"
        >
          <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 p-3.5 shadow-md">
            <GraduationCap className="h-8 w-8 text-white" />
          </div>
          <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
          <p className="text-sm font-semibold text-slate-700">Loading department subjects…</p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="faculty-bg-vibrant flex min-h-screen items-center justify-center px-4">
        <div className="rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-lg max-w-md">
          <p className="mb-4 text-sm font-bold text-rose-700">{error}</p>
          <button
            onClick={() => {
              setError(null);
              navigate(0);
            }}
            className="rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-rose-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Main Workspace Body ── */}
      <div>
        {/* Header Hero Banner */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="rounded-3xl border border-slate-200/80 bg-white p-6 md:p-8 shadow-sm mb-8 relative overflow-hidden"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shrink-0">
                <BookOpen className="h-7 w-7" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-2xl font-extrabold text-slate-900 md:text-3xl">
                    {isAdminOrHod ? "Department & Faculty Control Center" : "Subject Management Console"}
                  </h1>
                  {isAdminOrHod && (
                    <span className="rounded-full bg-indigo-50 border border-indigo-200 px-3 py-0.5 text-xs font-extrabold text-indigo-700 uppercase">
                      HOD / Admin Scope
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-slate-500 max-w-2xl">
                  {isAdminOrHod
                    ? `Welcome ${facultyProfile.name}. Select overall Information Technology department management or choose a specific laboratory subject below.`
                    : "Select an assigned laboratory subject to manage experiments, evaluate student record submissions, and set lab deadlines."}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-center">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Available Subjects</p>
                <p className="text-xl font-extrabold text-indigo-600">{subjects.length}</p>
              </div>
              {facultyProfile.department && (
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-center">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Department Scope</p>
                  <p className="text-sm font-extrabold text-slate-800 uppercase">{facultyProfile.department}</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* ── Primary Action Card 1: HOD / Admin Overall Department Overview Portal ── */}
        {isAdminOrHod && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.2 }}
            className="mb-8 rounded-3xl border border-indigo-200/90 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 p-6 md:p-8 text-white shadow-lg relative overflow-hidden"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 text-blue-300 shrink-0">
                  <Building2 className="h-7 w-7 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="rounded-full bg-blue-500/20 border border-blue-400/30 px-3 py-0.5 text-xs font-bold text-blue-200 uppercase">
                      Overall Department Scope
                    </span>
                  </div>
                  <h2 className="text-2xl font-extrabold text-white">
                    Overall {facultyProfile.department ? facultyProfile.department.toUpperCase() : "IT"} Department Portal
                  </h2>
                  <p className="mt-1 text-sm text-slate-300 max-w-2xl">
                    View overall class rosters, student performance, department practicals, faculty assignments, grade reports, and administrative management tools across Information Technology.
                  </p>
                </div>
              </div>

              <div className="shrink-0">
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate("/admin")}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-3.5 text-sm font-extrabold text-white shadow-md hover:from-blue-600 hover:to-indigo-600 transition cursor-pointer"
                >
                  <span>Open Overall Department Portal</span>
                  <ArrowRight className="h-5 w-5" />
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Global Management Actions Card Grid ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.2 }}
          className="mb-8 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm"
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Department Workspace Actions</h2>
              <p className="text-xs text-slate-500">Management tools & consoles available across all your subjects</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {/* Deadlines */}
            <motion.button
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate("/faculty/experiments")}
              className="group flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 text-left shadow-xs transition-all hover:bg-white hover:border-indigo-300 hover:shadow-md cursor-pointer"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <Clock className="h-5 w-5" />
                </div>
                <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 transition-colors" />
              </div>
              <div>
                <span className="font-bold text-slate-900 text-sm block">Lab Deadlines</span>
                <span className="text-xs text-slate-500 line-clamp-1 mt-0.5">Set due dates & submission rules</span>
              </div>
            </motion.button>

            {/* Add Experiment */}
            <motion.button
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate("/faculty/add-experiment")}
              className="group flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 text-left shadow-xs transition-all hover:bg-white hover:border-blue-300 hover:shadow-md cursor-pointer"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Plus className="h-5 w-5" />
                </div>
                <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
              </div>
              <div>
                <span className="font-bold text-slate-900 text-sm block">Add New Experiment</span>
                <span className="text-xs text-slate-500 line-clamp-1 mt-0.5">Publish new lab practical tasks</span>
              </div>
            </motion.button>

            {/* Exam Console */}
            <motion.button
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate("/faculty/exams")}
              className="group flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 text-left shadow-xs transition-all hover:bg-white hover:border-amber-300 hover:shadow-md cursor-pointer"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                  <ClipboardList className="h-5 w-5" />
                </div>
                <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-amber-600 transition-colors" />
              </div>
              <div>
                <span className="font-bold text-slate-900 text-sm block">Exam Console</span>
                <span className="text-xs text-slate-500 line-clamp-1 mt-0.5">Conduct & monitor online lab exams</span>
              </div>
            </motion.button>

            {/* Templates */}
            <motion.button
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate("/faculty/templates")}
              className="group flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 text-left shadow-xs transition-all hover:bg-white hover:border-violet-300 hover:shadow-md cursor-pointer"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600 group-hover:bg-violet-600 group-hover:text-white transition-colors">
                  <FilePlus2 className="h-5 w-5" />
                </div>
                <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-violet-600 transition-colors" />
              </div>
              <div>
                <span className="font-bold text-slate-900 text-sm block">Code Templates</span>
                <span className="text-xs text-slate-500 line-clamp-1 mt-0.5">Starter code & record templates</span>
              </div>
            </motion.button>

            {/* Students Roster */}
            <motion.button
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate("/faculty/students")}
              className="group flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 text-left shadow-xs transition-all hover:bg-white hover:border-sky-300 hover:shadow-md cursor-pointer"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600 group-hover:bg-sky-600 group-hover:text-white transition-colors">
                  <Users className="h-5 w-5" />
                </div>
                <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-sky-600 transition-colors" />
              </div>
              <div>
                <span className="font-bold text-slate-900 text-sm block">Students Roster</span>
                <span className="text-xs text-slate-500 line-clamp-1 mt-0.5">Enrolled student profiles & attendance</span>
              </div>
            </motion.button>

            {/* Analytics */}
            <motion.button
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate("/faculty/reports")}
              className="group flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 text-left shadow-xs transition-all hover:bg-white hover:border-emerald-300 hover:shadow-md cursor-pointer"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
              </div>
              <div>
                <span className="font-bold text-slate-900 text-sm block">Analytics & Reports</span>
                <span className="text-xs text-slate-500 line-clamp-1 mt-0.5">Class performance & grade reports</span>
              </div>
            </motion.button>
          </div>
        </motion.div>

        {/* ── Assigned Subjects Cards Grid ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.2 }}
          className="mb-8 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm"
        >
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <BookOpen className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {isAdminOrHod ? `Department Laboratory Subjects (${subjects.length})` : `Your Assigned Subjects (${subjects.length})`}
                </h2>
                <p className="text-xs text-slate-500">
                  Select a laboratory subject below to manage experiments, evaluate submissions, and track class progress
                </p>
              </div>
            </div>
          </div>

          {subjects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
              <Building2 className="mx-auto h-10 w-10 text-slate-400 mb-2" />
              <h3 className="font-bold text-slate-700">No Subjects Found</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                No laboratory subjects found in {facultyProfile.department || "your department"}.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {subjects.map((item, idx) => {
                const sub = item.subjects;
                const subId = String(item.subject_id || sub?.id || "").trim();
                const subName = String(sub?.name || "Laboratory Subject").trim();
                const subCode = String(sub?.code || "").trim();
                const dept = String(sub?.department || "").trim();
                const yr = String(sub?.year || "").trim();
                const sem = String(sub?.semester || "").trim();

                return (
                  <motion.div
                    key={subId || idx}
                    whileHover={{ y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="flex flex-col justify-between rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs hover:border-blue-300 hover:shadow-lg transition-all"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm shrink-0">
                          <FlaskConical className="h-6 w-6" />
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 justify-end">
                          {dept && (
                            <span className="rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 uppercase">
                              {dept}
                            </span>
                          )}
                          {yr && (
                            <span className="rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                              Yr {yr}
                            </span>
                          )}
                          {sem && (
                            <span className="rounded-full bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                              Sem {sem}
                            </span>
                          )}
                        </div>
                      </div>

                      <h3 className="text-base font-extrabold text-slate-900 line-clamp-2">{subName}</h3>
                      {subCode && <p className="text-xs font-semibold text-indigo-600 mt-0.5">{subCode}</p>}
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-100 space-y-2">
                      <button
                        type="button"
                        onClick={() => selectSubject(subId, subName)}
                        className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:from-blue-700 hover:to-indigo-700 cursor-pointer"
                      >
                        <span>Open Subject Workspace</span>
                        <ArrowRight className="h-4 w-4" />
                      </button>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => openSubjectRoute(subId, subName, "/faculty/experiments")}
                          className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100 hover:text-blue-700 transition cursor-pointer"
                        >
                          <FlaskConical className="h-3.5 w-3.5 text-blue-600" />
                          <span>Experiments</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openSubjectRoute(subId, subName, "/faculty/exams")}
                          className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100 hover:text-amber-700 transition cursor-pointer"
                        >
                          <ClipboardList className="h-3.5 w-3.5 text-amber-500" />
                          <span>Exam Console</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openSubjectRoute(subId, subName, "/faculty/templates")}
                          className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100 hover:text-violet-700 transition cursor-pointer"
                        >
                          <FilePlus2 className="h-3.5 w-3.5 text-violet-600" />
                          <span>Templates</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openSubjectRoute(subId, subName, "/faculty/students")}
                          className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100 hover:text-emerald-700 transition cursor-pointer"
                        >
                          <Users className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Students</span>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
