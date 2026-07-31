import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

type FacultySubject = {
  id: string;
  name: string;
  code: string | null;
  year: string | null;
  semester: string | null;
  department: string | null;
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

export function useFacultySubjects() {
  const { user } = useAuth();
  const [subjects, setSubjects] = useState<FacultySubject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setSubjects([]);
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      const profileRes = await supabase
        .from("profiles")
        .select("department, year, semester")
        .eq("id", user.id)
        .maybeSingle();
      const facultyDepartment = normalizeDepartmentKey(profileRes.data?.department || "");
      const facultyYear = String(profileRes.data?.year || "").trim();
      const facultySemester = String(profileRes.data?.semester || "").trim();

      const { data, error } = await supabase
        .from("faculty_subjects")
        .select(`
          subject_id,
          subjects (
            id,
            name,
            code,
            year,
            semester,
            department
          )
        `)
        .eq("faculty_id", user.id);

      if (error || !data) {
        setSubjects([]);
        setLoading(false);
        return;
      }

      const mapped: FacultySubject[] = data
        .map((row: any) => row.subjects)
        .filter(Boolean)
        .filter((subject: FacultySubject) => {
          if (!facultyDepartment) return true;
          if (normalizeDepartmentKey(subject.department) !== facultyDepartment) return false;
          if (facultyYear && String(subject.year || "").trim() !== facultyYear) return false;
          if (facultySemester && String(subject.semester || "").trim() !== facultySemester) return false;
          return true;
        });

      setSubjects(mapped);
      setLoading(false);
    }

    load();
  }, [user]);

  return { subjects, loading };
}
