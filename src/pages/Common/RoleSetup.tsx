import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Building2, Calendar, Check, ChevronDown, GraduationCap, ShieldCheck } from "lucide-react";
import {
  clearPendingRole,
  getRoleHomePath,
  requiresRoleSetup,
  applyPostAuthRolePreparation,
  resolveRoleFromSources,
  type AppRole,
} from "@/lib/authFlow";
import { formatDepartmentNameUpper } from "@/utils/departmentLabel";

export default function RoleSetup() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string>("");
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [department, setDepartment] = useState(
    formatDepartmentNameUpper(
      localStorage.getItem("department") ||
        localStorage.getItem("admin_department") ||
        localStorage.getItem("dept") ||
        "",
      ""
    )
  );
  const [year, setYear] = useState(localStorage.getItem("year") || "");
  const [semester, setSemester] = useState(localStorage.getItem("semester") || "");

  const requiresDepartment =
    role === "student" || role === "faculty" || role === "admin";
  const requiresYearAndSemester = role === "student" || role === "faculty";
  const years = useMemo(() => ["1", "2", "3", "4"], []);
  const semesters = useMemo(
    () => ["1", "2", "3", "4", "5", "6", "7", "8"],
    []
  );

  useEffect(() => {
    let mounted = true;

    const loadSetupData = async () => {
      try {
        setLoading(true);
        setError("");

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!mounted) return;
        if (!session?.user) {
          navigate("/login", { replace: true });
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role, department, year, semester")
          .eq("id", session.user.id)
          .single();

        if (!mounted) return;
        const resolvedRole = resolveRoleFromSources(
          profile?.role,
          session.user.user_metadata?.role,
          localStorage.getItem("pendingRole")
        );

        if (!resolvedRole) {
          navigate("/login", { replace: true });
          return;
        }

        if (profileError) {
          console.error("RoleSetup profile fetch fallback:", profileError.message);
        }

        setRole(resolvedRole);
        setUserId(session.user.id);

        if (!requiresRoleSetup(resolvedRole, profile)) {
          applyPostAuthRolePreparation(resolvedRole);
          navigate(getRoleHomePath(resolvedRole), { replace: true });
          return;
        }

        if (profile?.department) {
          setDepartment(formatDepartmentNameUpper(profile.department, ""));
        }
        if (profile?.year) {
          setYear(String(profile.year));
        }
        if (profile?.semester) {
          setSemester(String(profile.semester));
        }

        const { data: subjectRows, error: departmentsError } = await supabase
          .from("subjects")
          .select("department")
          .not("department", "is", null);

        if (!mounted) return;
        if (departmentsError) {
          setError(departmentsError.message);
          setLoading(false);
          return;
        }

        const uniqueDepartments = Array.from(
          new Set(
            (subjectRows || [])
              .map((row) => row.department)
              .filter((d): d is string => Boolean(d))
              .map((d) => formatDepartmentNameUpper(d, ""))
              .filter(Boolean)
          )
        ).sort((a, b) => a.localeCompare(b));

        setDepartments(uniqueDepartments);
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "Failed to load setup data");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadSetupData();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (requiresDepartment && !department) {
      setError("Please select a department");
      return;
    }

    if (requiresYearAndSemester && (!year || !semester)) {
      setError("Please select year and semester");
      return;
    }

    if (!userId) {
      setError("Unable to resolve user. Please login again.");
      return;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        department: requiresDepartment ? formatDepartmentNameUpper(department, "") : null,
        year: requiresYearAndSemester ? year : null,
        semester: requiresYearAndSemester ? semester : null,
      })
      .eq("id", userId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    if (requiresDepartment) {
      const normalizedDepartment = formatDepartmentNameUpper(department, "");
      localStorage.setItem("department", normalizedDepartment);
      localStorage.setItem("dept", normalizedDepartment);
      localStorage.setItem("admin_department", normalizedDepartment);
    } else {
      localStorage.removeItem("department");
      localStorage.removeItem("dept");
      localStorage.removeItem("admin_department");
    }

    if (requiresYearAndSemester) {
      localStorage.setItem("year", year);
      localStorage.setItem("semester", semester);
    } else {
      localStorage.removeItem("year");
      localStorage.removeItem("semester");
    }

    clearPendingRole();
    if (role === "admin") {
      localStorage.removeItem("force_admin_department_select");
    }
    if (role === "faculty") {
      localStorage.removeItem("faculty_subject_id");
      localStorage.removeItem("faculty_subject_name");
    }
    if (role) {
      navigate(getRoleHomePath(role), { replace: true });
      return;
    }
    navigate("/login", { replace: true });
  }

  if (loading) {
    return (
      <div className="faculty-bg-vibrant min-h-screen text-slate-900">
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
          <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center justify-between gap-3 px-4 md:px-7">
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <span className="text-slate-500">Account</span>
              <span className="text-slate-300">/</span>
              <span>Setup</span>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1280px] px-4 py-7 md:px-7">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12">
              <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white/90 p-6 text-center shadow-[0_16px_36px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <p className="text-sm font-medium text-slate-600">Loading setup...</p>
        </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="faculty-bg-vibrant min-h-screen text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center justify-between gap-3 px-4 md:px-7">
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <span className="text-slate-500">Account</span>
            <span className="text-slate-300">/</span>
            <span>Setup</span>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1280px] px-4 py-7 md:px-7">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <form
        onSubmit={handleSubmit}
              className="mx-auto w-full max-w-xl rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-[0_16px_36px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-7"
      >
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-blue-700">
                <ShieldCheck className="h-3.5 w-3.5" />
                One-time setup
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Complete Setup</h1>
              <p className="mt-1 text-sm text-slate-500">
          Select your academic scope before entering dashboard.
        </p>
            </div>
            <div className="hidden h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 ring-1 ring-blue-200 sm:flex">
              <GraduationCap className="h-5 w-5 text-blue-700" />
            </div>
          </div>

          <div className="mt-6 space-y-4">
          {requiresDepartment && (
              <div>
                <label className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <Building2 className="h-3.5 w-3.5" />
                  Department
                </label>
                <SetupDropdown
                  value={department}
                  onChange={setDepartment}
                  placeholder="Select department"
                  options={departments.map((dep) => ({ value: dep, label: dep }))}
                />
            </div>
          )}

          {requiresYearAndSemester && (
            <>
              <div>
                  <label className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <Calendar className="h-3.5 w-3.5" />
                    Year
                  </label>
                <SetupDropdown
                  value={year}
                  onChange={setYear}
                  placeholder="Select year"
                  options={years.map((y) => ({ value: y, label: y }))}
                />
              </div>

              <div>
                  <label className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <Calendar className="h-3.5 w-3.5" />
                    Semester
                  </label>
                <SetupDropdown
                  value={semester}
                  onChange={setSemester}
                  placeholder="Select semester"
                  options={semesters.map((sem) => ({ value: sem, label: sem }))}
                />
              </div>
            </>
          )}
        </div>

          {error && (
            <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(37,99,235,0.2)] transition hover:from-blue-500 hover:to-indigo-500"
          >
            Continue
          </button>
      </form>
          </div>
        </div>
      </main>
    </div>
  );
}

type SetupDropdownOption = {
  value: string;
  label: string;
};

function SetupDropdown({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SetupDropdownOption[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const selected = options.find((option) => option.value === value) || null;

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        className={`group flex h-11 w-full items-center justify-between rounded-xl border bg-white px-3 text-sm transition ${
          open
            ? "border-blue-300 ring-2 ring-blue-100"
            : "border-slate-200 hover:border-blue-200"
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? "text-slate-800" : "text-slate-400"}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-slate-500 transition-transform duration-150 ${
            open ? "rotate-180 text-blue-600" : ""
          }`}
        />
      </button>

      {open ? (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_14px_32px_rgba(15,23,42,0.16)]">
          <div className="max-h-56 overflow-y-auto p-1.5">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition ${
                !value
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span>{placeholder}</span>
              {!value ? <Check className="h-4 w-4" /> : null}
            </button>
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition ${
                    active
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span>{option.label}</span>
                  {active ? <Check className="h-4 w-4" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
