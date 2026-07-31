const USER_SCOPE_KEYS = [
  "auth_role",
  "student_subject_id",
  "student_subject_name",
  "selected_subject_id",
  "selected_subject_name",
  "studentSelectedSubjectId",
  "studentSelectedSubjectName",
  "selectedSubjectId",
  "selectedSubjectName",
  "faculty_subject_id",
  "faculty_subject_name",
  "department",
  "admin_department",
  "dept",
  "year",
  "semester",
  "role_setup_done",
  "pendingRole",
  "force_student_subject_select",
  "force_faculty_subject_select",
  "exam_room_id",
  "exam_id",
  "exam_student_name",
  "exam_register_no",
  "exam_start_time",
] as const;

export function clearAllUserScope() {
  for (const key of USER_SCOPE_KEYS) {
    localStorage.removeItem(key);
  }
}

export function isInvalidRefreshTokenError(error: unknown): boolean {
  if (!error) return false;
  const blob = JSON.stringify(error || {}).toLowerCase();
  const message = (error as { message?: string } | null)?.message?.toLowerCase() || "";
  const combined = `${blob} ${message}`;

  // Ignore network failures or transient tab wake issues
  if (
    combined.includes("failed to fetch") ||
    combined.includes("network") ||
    combined.includes("timeout") ||
    combined.includes("abort")
  ) {
    return false;
  }

  return (
    combined.includes("invalid refresh token") ||
    combined.includes("refresh_token_not_found") ||
    combined.includes("refresh token not found")
  );
}

function clearSupabaseStorageFrom(source: Storage) {
  const keysToRemove: string[] = [];
  for (let index = 0; index < source.length; index += 1) {
    const key = source.key(index);
    if (!key) continue;
    if (
      /^sb-.*-auth-token$/i.test(key) ||
      key.includes("-auth-token") ||
      key.includes("supabase.auth.token")
    ) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => source.removeItem(key));
}

export function clearStaleAuthStorage() {
  clearSupabaseStorageFrom(localStorage);
  clearSupabaseStorageFrom(sessionStorage);
  clearAllUserScope();
}
