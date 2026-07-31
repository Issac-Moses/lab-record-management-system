export type AppRole = "student" | "faculty" | "admin";

export function resolveRole(candidate: unknown): AppRole | null {
  if (typeof candidate !== "string") {
    return null;
  }

  const normalized = candidate.trim().toLowerCase();
  if (normalized === "student" || normalized === "faculty" || normalized === "admin") {
    return normalized;
  }
  return null;
}

export function resolveRoleFromSources(...candidates: unknown[]): AppRole | null {
  for (const candidate of candidates) {
    const resolved = resolveRole(candidate);
    if (resolved) return resolved;
  }
  return null;
}

export function requiresRoleSetup(
  role: AppRole,
  profile: { department?: string | null; year?: string | null; semester?: string | null } | null,
  _requireAdminDepartment?: boolean
): boolean {
  const department = profile?.department ?? null;
  const year = profile?.year ?? null;
  const semester = profile?.semester ?? null;

  if (role === "admin") {
    return !department;
  }
  if (role === "faculty") {
    return !department;
  }
  return !department || !year || !semester;
}

export function getRoleHomePath(role: AppRole): string {
  if (role === "admin") return "/admin";
  if (role === "faculty") return "/faculty";
  return "/student";
}

export function clearPendingRole() {
  localStorage.removeItem("pendingRole");
}

export function applyPostAuthRolePreparation(role: AppRole) {
  clearPendingRole();

  if (role === "student" && localStorage.getItem("force_student_subject_select") === "1") {
    localStorage.removeItem("student_subject_id");
    localStorage.removeItem("student_subject_name");
    localStorage.removeItem("selectedSubjectId");
    localStorage.removeItem("selectedSubjectName");
    localStorage.removeItem("studentSelectedSubjectId");
    localStorage.removeItem("studentSelectedSubjectName");
    localStorage.removeItem("selected_subject_id");
    localStorage.removeItem("selected_subject_name");
    localStorage.removeItem("force_student_subject_select");
  }

  if (role === "faculty" && localStorage.getItem("force_faculty_subject_select") === "1") {
    localStorage.removeItem("faculty_subject_id");
    localStorage.removeItem("faculty_subject_name");
    localStorage.removeItem("force_faculty_subject_select");
  }
}
