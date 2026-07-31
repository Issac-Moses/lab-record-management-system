import { supabase } from "@/lib/supabase";

export type NotificationTargetRole = "student" | "faculty";

export type StudentNotification = {
  id: string;
  title: string;
  message: string;
  senderId: string | null;
  senderRole: "admin" | "faculty" | "system";
  targetRole: NotificationTargetRole | null;
  targetDepartment: string | null;
  createdAt: string | null;
};

type CreateNotificationInput = {
  title: string;
  message: string;
  targetRole?: NotificationTargetRole;
  targetDepartment?: string | null;
};

export type NotificationSenderContext = {
  role: "admin" | "faculty" | "student" | null;
  department: string | null;
};

function normalizeDepartment(value: unknown): string | null {
  const normalized = String(value || "").trim();
  return normalized ? normalized : null;
}

function normalizeDepartmentKey(value: unknown): string | null {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return null;
  const compact = raw.replace(/[^A-Z0-9]/g, "");
  const aliases: Record<string, string> = {
    IT: "IT",
    INFORMATIONTECHNOLOGY: "IT",
    INFORMATIONSCIENCE: "IT",
    CSE: "CSE",
    COMPUTERSCIENCE: "CSE",
    COMPUTERSCIENCEENGINEERING: "CSE",
    COMPUTERSCIENCEANDENGINEERING: "CSE",
    ECE: "ECE",
    ELECTRONICSANDCOMMUNICATION: "ECE",
    ELECTRONICSANDCOMMUNICATIONENGINEERING: "ECE",
    EEE: "EEE",
    ELECTRICALANDELECTRONICS: "EEE",
    ELECTRICALANDELECTRONICSENGINEERING: "EEE",
    MECH: "MECH",
    MECHANICAL: "MECH",
    MECHANICALENGINEERING: "MECH",
    CIVIL: "CIVIL",
    CIVILENGINEERING: "CIVIL",
    AIDS: "AIDS",
    ARTIFICIALINTELLIGENCEANDDATASCIENCE: "AIDS",
  };
  return aliases[compact] || compact;
}

function departmentsMatch(left: unknown, right: unknown): boolean {
  const leftKey = normalizeDepartmentKey(left);
  const rightKey = normalizeDepartmentKey(right);
  if (!leftKey || !rightKey) return false;
  return leftKey === rightKey;
}

function mapRow(row: any): StudentNotification {
  const senderRoleRaw = String(row?.sender_role || "system").toLowerCase();
  const senderRole: "admin" | "faculty" | "system" =
    senderRoleRaw === "admin" || senderRoleRaw === "faculty" ? senderRoleRaw : "system";
  const targetRoleRaw = String(row?.target_role || "").trim().toLowerCase();
  const targetRole: NotificationTargetRole | null =
    targetRoleRaw === "student" || targetRoleRaw === "faculty" ? targetRoleRaw : null;
  return {
    id: String(row?.id || ""),
    title: String(row?.title || "").trim(),
    message: String(row?.message || "").trim(),
    senderId: String(row?.sender_id || "").trim() || null,
    senderRole,
    targetRole,
    targetDepartment: normalizeDepartment(row?.target_department),
    createdAt: String(row?.created_at || "").trim() || null,
  };
}

async function getCurrentUserRole(userId: string): Promise<"admin" | "faculty" | "student" | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (error) return null;
  const role = String(data?.role || "").trim().toLowerCase();
  if (role === "admin" || role === "faculty" || role === "student") return role;
  return null;
}

function normalizeRole(value: unknown): "admin" | "faculty" | "student" | null {
  const role = String(value || "").trim().toLowerCase();
  if (role === "admin" || role === "faculty" || role === "student") return role;
  return null;
}

export async function getNotificationSenderContext(): Promise<NotificationSenderContext> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { role: null, department: null };
  }

  const { data } = await supabase
    .from("profiles")
    .select("role, department")
    .eq("id", user.id)
    .maybeSingle();

  const role =
    normalizeRole(data?.role) ??
    normalizeRole((user as any)?.app_metadata?.role) ??
    normalizeRole((user as any)?.user_metadata?.role);
  const department =
    normalizeDepartment(data?.department) ??
    normalizeDepartment((user as any)?.user_metadata?.department);

  return { role, department };
}

export async function createStudentNotification(
  input: CreateNotificationInput
): Promise<{ success: true } | { success: false; error: string }> {
  const title = String(input.title || "").trim();
  const message = String(input.message || "").trim();
  if (!title || !message) {
    return { success: false, error: "Title and message are required." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated." };
  }

  const senderContext = await getNotificationSenderContext();
  const role = senderContext.role ?? (await getCurrentUserRole(user.id));
  if (role !== "admin" && role !== "faculty") {
    return { success: false, error: "Only admin/faculty can send notifications." };
  }

  const targetDepartment =
    role === "faculty"
      ? normalizeDepartment(senderContext.department)
      : normalizeDepartment(input.targetDepartment);
  const targetRole: NotificationTargetRole =
    role === "faculty" ? "student" : input.targetRole === "faculty" ? "faculty" : "student";

  if (role === "faculty" && !targetDepartment) {
    return {
      success: false,
      error: "Faculty notifications require your profile department. Please ask admin to update it.",
    };
  }

  const payload = {
    sender_id: user.id,
    sender_role: role,
    title,
    message,
    target_role: targetRole,
    target_department: targetDepartment,
  };

  const { error } = await supabase.from("student_notifications").insert(payload);
  if (error) {
    if ((error.message || "").toLowerCase().includes("target_role")) {
      return {
        success: false,
        error: "Notification schema is outdated. Add target_role column from latest SQL migration.",
      };
    }
    if (error.code === "PGRST205") {
      return { success: false, error: "student_notifications table is missing. Apply SQL migration first." };
    }
    return { success: false, error: error.message || "Failed to send notification." };
  }
  return { success: true };
}

export async function getSentStudentNotifications(limit = 20): Promise<{
  success: true;
  data: StudentNotification[];
} | {
  success: false;
  error: string;
}> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated." };
  }

  const { data, error } = await supabase
    .from("student_notifications")
    .select("id, title, message, sender_id, sender_role, target_role, target_department, created_at")
    .eq("sender_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if ((error.message || "").toLowerCase().includes("target_role")) {
      const fallback = await supabase
        .from("student_notifications")
        .select("id, title, message, sender_id, sender_role, target_department, created_at")
        .eq("sender_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (fallback.error) {
        return { success: false, error: fallback.error.message || "Failed to fetch sent notifications." };
      }
      return { success: true, data: Array.isArray(fallback.data) ? fallback.data.map(mapRow) : [] };
    }
    if (error.code === "PGRST205") {
      return { success: false, error: "student_notifications table is missing. Apply SQL migration first." };
    }
    return { success: false, error: error.message || "Failed to fetch sent notifications." };
  }

  return { success: true, data: Array.isArray(data) ? data.map(mapRow) : [] };
}

export async function getStudentInboxNotifications(
  studentDepartment: string | null,
  limit = 20
): Promise<{
  success: true;
  data: StudentNotification[];
} | {
  success: false;
  error: string;
}> {
  const department = normalizeDepartment(studentDepartment);
  const { data, error } = await supabase
    .from("student_notifications")
    .select("id, title, message, sender_id, sender_role, target_role, target_department, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  let rows: StudentNotification[] = [];
  if (error) {
    if ((error.message || "").toLowerCase().includes("target_role")) {
      const fallback = await supabase
        .from("student_notifications")
        .select("id, title, message, sender_id, sender_role, target_department, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (fallback.error) {
        return { success: false, error: fallback.error.message || "Failed to fetch notifications." };
      }
      rows = Array.isArray(fallback.data) ? fallback.data.map(mapRow) : [];
    } else {
      if (error.code === "PGRST205") {
        return { success: false, error: "student_notifications table is missing. Apply SQL migration first." };
      }
      return { success: false, error: error.message || "Failed to fetch notifications." };
    }
  } else {
    rows = Array.isArray(data) ? data.map(mapRow) : [];
  }

  const filtered = rows.filter((item) => {
    const targetRole = item.targetRole || "student";
    if (targetRole !== "student") return false;
    const target = normalizeDepartment(item.targetDepartment);
    if (!target) return true;
    if (!department) return false;
    return departmentsMatch(target, department);
  });

  return { success: true, data: filtered };
}

export async function getFacultyInboxNotifications(
  facultyDepartment: string | null,
  limit = 20
): Promise<{
  success: true;
  data: StudentNotification[];
} | {
  success: false;
  error: string;
}> {
  const department = normalizeDepartment(facultyDepartment);
  const { data, error } = await supabase
    .from("student_notifications")
    .select("id, title, message, sender_id, sender_role, target_role, target_department, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  let rows: StudentNotification[] = [];
  if (error) {
    if ((error.message || "").toLowerCase().includes("target_role")) {
      return {
        success: false,
        error: "Notification schema is outdated. Add target_role column from latest SQL migration.",
      };
    }
    if (error.code === "PGRST205") {
      return { success: false, error: "student_notifications table is missing. Apply SQL migration first." };
    }
    return { success: false, error: error.message || "Failed to fetch notifications." };
  } else {
    rows = Array.isArray(data) ? data.map(mapRow) : [];
  }

  const filtered = rows.filter((item) => {
    if (item.targetRole !== "faculty") return false;
    const target = normalizeDepartment(item.targetDepartment);
    if (!target) return true;
    if (!department) return false;
    return departmentsMatch(target, department);
  });

  return { success: true, data: filtered };
}

export async function getAdminInboxNotifications(
  limit = 20
): Promise<{
  success: true;
  data: StudentNotification[];
} | {
  success: false;
  error: string;
}> {
  const { data, error } = await supabase
    .from("student_notifications")
    .select("id, title, message, sender_id, sender_role, target_role, target_department, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if ((error.message || "").toLowerCase().includes("target_role")) {
      const fallback = await supabase
        .from("student_notifications")
        .select("id, title, message, sender_id, sender_role, target_department, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (fallback.error) {
        return { success: false, error: fallback.error.message || "Failed to fetch notifications." };
      }
      return { success: true, data: Array.isArray(fallback.data) ? fallback.data.map(mapRow) : [] };
    }
    if (error.code === "PGRST205") {
      return { success: false, error: "student_notifications table is missing. Apply SQL migration first." };
    }
    return { success: false, error: error.message || "Failed to fetch notifications." };
  }

  return { success: true, data: Array.isArray(data) ? data.map(mapRow) : [] };
}
