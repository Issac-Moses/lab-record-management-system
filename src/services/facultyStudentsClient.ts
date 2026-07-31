import { supabase } from "@/lib/supabase";

const MANUAL_API_BASE_URL =
  import.meta.env.VITE_MANUAL_API_URL || "http://localhost:7001";

export type FacultyScopedStudent = {
  id: string;
  name: string | null;
  email?: string | null;
  register_no: string | null;
  department: string | null;
  year: string | null;
  semester: string | null;
};

async function fallbackFetchStudents(ids: string[]): Promise<FacultyScopedStudent[]> {
  if (!ids.length) return [];

  const [profilesById, profilesByRegister, studentsById, studentsByRegister] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,email,name,register_no,department,year,semester,role")
      .in("id", ids),
    supabase
      .from("profiles")
      .select("id,email,name,register_no,department,year,semester,role")
      .in("register_no", ids),
    supabase
      .from("students")
      .select("id,email,name,department,semester")
      .in("id", ids),
    supabase
      .from("students")
      .select("id,email,name,department,semester")
      .in("email", ids),
  ]);

  const combined = [
    ...((profilesById.data || []).filter((row) => !row.role || row.role === "student")),
    ...((profilesByRegister.data || []).filter((row) => !row.role || row.role === "student")),
    ...((studentsById.data || []).map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      register_no: null,
      department: row.department,
      year: null,
      semester: row.semester,
    })) || []),
    ...((studentsByRegister.data || []).map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      register_no: null,
      department: row.department,
      year: null,
      semester: row.semester,
    })) || []),
  ] as FacultyScopedStudent[];

  const byKey = new Map<string, FacultyScopedStudent>();
  for (const row of combined) {
    const idKey = String(row?.id || "").trim();
    const registerKey = String(row?.register_no || "").trim();
    if (idKey && ids.includes(idKey)) byKey.set(idKey, row);
    if (registerKey && ids.includes(registerKey)) byKey.set(registerKey, row);
  }
  return Array.from(new Set(byKey.values()));
}

export async function fetchFacultyScopedStudents(
  subjectId: string,
  studentIds: string[]
): Promise<FacultyScopedStudent[]> {
  const ids = Array.from(
    new Set(
      (Array.isArray(studentIds) ? studentIds : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );

  if (!subjectId || ids.length === 0) {
    return [];
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const token = session?.access_token;
  if (!token) {
    return fallbackFetchStudents(ids);
  }

  const params = new URLSearchParams({
    student_ids: ids.join(","),
  });

  const response = await fetch(
    `${MANUAL_API_BASE_URL}/api/manual/faculty/students/${encodeURIComponent(
      subjectId
    )}?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    return fallbackFetchStudents(ids);
  }

  const payload = await response.json();
  if (!payload?.success || !Array.isArray(payload?.data)) {
    return fallbackFetchStudents(ids);
  }

  return payload.data as FacultyScopedStudent[];
}
