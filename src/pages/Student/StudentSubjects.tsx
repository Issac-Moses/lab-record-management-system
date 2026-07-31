import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getSelectedSubjectFromStorage,
  setSelectedSubjectInStorage,
  useSubjects,
} from "../../context/SubjectContext";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { BookOpen, ArrowRight, Sparkles, GraduationCap, Search } from "lucide-react";
import { SubjectsSkeleton } from "@/components/ui/StudentSkeletons";
import EmptyState from "@/components/ui/EmptyState";
import ErrorScreen from "@/components/ui/ErrorScreen";

export default function StudentSubjects() {
  const navigate = useNavigate();
  const { subjects, loading, error, department, semester, year, refetch } = useSubjects();
  const [studentName, setStudentName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSubjects = useMemo(() => {
    const list = subjects || [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((sub) => {
      const name = String(sub.name || "").toLowerCase();
      const code = String(sub.code || "").toLowerCase();
      return name.includes(q) || code.includes(q);
    });
  }, [subjects, searchQuery]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  /** Subject is chosen once per session; if already set, do not show the picker (use Sign out to change). */
  useEffect(() => {
    const { subjectId, subjectName } = getSelectedSubjectFromStorage();
    if (subjectId) {
      navigate(
        `/student?subject=${encodeURIComponent(subjectId)}&subjectName=${encodeURIComponent(subjectName || "Subject")}`,
        { replace: true }
      );
    }
  }, [navigate]);

  useEffect(() => {
    let active = true;
    const loadName = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !active) return;
      const { data } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", user.id)
        .maybeSingle();
      if (!active) return;
      const resolved = String(data?.name || user.user_metadata?.name || "").trim();
      setStudentName(resolved);
    };
    void loadName();
    return () => {
      active = false;
    };
  }, []);

  const selectSubject = (subjectId: string, subjectName: string) => {
    setSelectedSubjectInStorage(subjectId, subjectName);
    navigate(`/student?subject=${encodeURIComponent(subjectId)}&subjectName=${encodeURIComponent(subjectName)}`);
  };

  if (loading) {
    return <SubjectsSkeleton />;
  }

  if (error) {
    return <ErrorScreen message={error} onRetry={refetch} />;
  }

  if (!subjects || subjects.length === 0) {
    return (
      <div className="student-page-enter faculty-bg-vibrant min-h-screen px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto w-full max-w-[1380px] rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <EmptyState
          message="No subjects found"
          description={`No subjects are configured for ${department || "your department"} • Year ${year || "N/A"} • Semester ${semester || "N/A"}. Please contact your faculty/admin if this continues.`}
          action={{
            label: "Try again",
            onClick: refetch,
          }}
        />
        </div>
      </div>
    );
  }

  return (
    <div className="student-page-enter faculty-bg-vibrant min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto w-full max-w-[1380px]">
      {/* Hero header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="faculty-glass faculty-gradient-ring relative mb-6 overflow-hidden rounded-3xl p-6 md:p-8"
      >
        {/* Decorative gradient orb */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-gradient-to-br from-blue-200/60 to-indigo-200/50 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-gradient-to-tr from-indigo-200/50 to-blue-100/50 blur-3xl" />

        <div className="relative flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/25">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <div className="space-y-2">
            <h1 className="bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-2xl font-bold text-transparent md:text-3xl">
              {greeting}{studentName ? `, ${studentName}` : ""}!
            </h1>
            <p className="text-sm text-slate-600">
              Choose your subject to continue.
            </p>
            {department && (
              <div className="mt-1 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3.5 py-1.5">
                <GraduationCap className="h-3.5 w-3.5 text-blue-600" />
                <span className="text-xs font-semibold text-blue-700">
                  {department} &bull; Year {year} &bull; Semester {semester}
                </span>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      <div className="mb-6">
        <label className="sr-only" htmlFor="student-subject-search">
          Filter subjects
        </label>
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            id="student-subject-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or code..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-800 shadow-sm outline-none ring-blue-500/30 placeholder:text-slate-400 focus:border-blue-400 focus:ring-2"
          />
        </div>
      </div>

      {/* Subject Cards Grid */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {filteredSubjects.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
            No subjects match &quot;{searchQuery.trim()}&quot;.{" "}
            <button
              type="button"
              className="font-semibold text-blue-600 hover:underline"
              onClick={() => setSearchQuery("")}
            >
              Clear search
            </button>
          </div>
        ) : (
          filteredSubjects.map((sub, index) => (
              <motion.div
                key={sub.id}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06, duration: 0.2, ease: "easeOut" }}
                whileHover={{ y: -3, scale: 1.01, transition: { duration: 0.18 } }}
                whileTap={{ scale: 0.98 }}
                className="group faculty-surface relative overflow-hidden rounded-2xl border border-slate-200 shadow-lg hover:border-blue-200 hover:shadow-[0_10px_24px_rgba(37,99,235,0.12)]"
              >
                {/* Accent stripe */}
                <div className="h-1 w-full bg-gradient-to-r from-blue-600 to-indigo-600" />

                {/* Shine overlay */}
                <div className="pointer-events-none absolute inset-0 bg-card-shine" />

                {/* Faded index counter */}
                <span className="pointer-events-none absolute right-5 top-5 select-none text-5xl font-black text-slate-200/60">
                  {String(index + 1).padStart(2, "0")}
                </span>

                <div className="relative p-6">
                  {/* Icon */}
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 ring-1 ring-slate-200 transition-all group-hover:from-blue-200 group-hover:to-indigo-200 group-hover:shadow-lg group-hover:shadow-blue-500/10">
                    <BookOpen className="h-5 w-5 text-blue-600" />
                  </div>

                  {/* Subject Name */}
                  <h2 className="mb-1 text-lg font-semibold text-slate-900 transition-colors group-hover:text-blue-700">
                    {sub.name}
                  </h2>

                  {/* Subject Code */}
                  <p className="mb-5 text-sm text-slate-500">
                    {sub.code || "N/A"}
                  </p>

                  {/* Meta info */}
                  <div className="border-t border-slate-200 pt-4">
                    <div className="mb-4 flex items-center justify-between">
                      <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        {sub.credits || 0} Credits
                      </span>
                      <span className="text-xs text-slate-500">Lab Ready</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => selectSubject(sub.id, sub.name)}
                      className="student-btn-primary w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-500/30"
                    >
                      <span className="inline-flex items-center gap-2">
                        Select Subject
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </button>
                  </div>
                </div>
              </motion.div>
          ))
        )}
      </div>
      </div>
    </div>
  );
}
