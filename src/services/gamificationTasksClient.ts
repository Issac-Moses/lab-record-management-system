import { supabase } from "@/lib/supabase";
import { getGamificationApiBase } from "@/services/gamificationApi";

export type GamificationTaskRow = {
  id: string;
  student_id: string;
  assigned_by: string | null;
  subject_id: string | null;
  title: string;
  description: string;
  xp_reward: number;
  status: string;
  created_at: string;
  completed_at: string | null;
  updated_at?: string;
  student_name?: string | null;
  student_department?: string | null;
  assigner_name?: string | null;
};

async function authHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return {
    "Content-Type": "application/json",
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

function parseJson<T>(payload: unknown): T | null {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }
  return null;
}

export async function fetchMyTasks(): Promise<GamificationTaskRow[]> {
  const res = await fetch(`${getGamificationApiBase()}/api/gamification/tasks/me`, {
    headers: await authHeaders(),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    console.warn("fetchMyTasks failed:", json?.error || res.status);
    return [];
  }
  const data = parseJson<GamificationTaskRow[]>(json);
  return Array.isArray(data) ? data : [];
}

export async function submitQuestTask(taskId: string, submissionNotes?: string): Promise<boolean> {
  const res = await fetch(`${getGamificationApiBase()}/api/gamification/tasks/${encodeURIComponent(taskId)}/submit`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ submissionNotes }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.error || json?.message || "Could not submit quest");
  }
  return true;
}

export async function verifyQuestTask(taskId: string, studentId?: string): Promise<{ xp_points: number; level: number } | null> {
  const res = await fetch(`${getGamificationApiBase()}/api/gamification/tasks/${encodeURIComponent(taskId)}/verify`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ studentId }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.error || json?.message || "Could not verify quest");
  }
  const progress = json?.data?.progress as { xp_points?: number; level?: number } | undefined;
  if (!progress) return null;
  return {
    xp_points: Number(progress.xp_points ?? 0),
    level: Number(progress.level ?? 1),
  };
}

export async function performQuestTask(taskId: string): Promise<boolean> {
  const res = await fetch(`${getGamificationApiBase()}/api/gamification/tasks/${encodeURIComponent(taskId)}/perform`, {
    method: "POST",
    headers: await authHeaders(),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.error || json?.message || "Could not start quest");
  }
  return true;
}


export async function assignQuestTask(payload: {
  studentId: string;
  title: string;
  description?: string;
  xpReward?: number;
  subjectId?: string | null;
}): Promise<GamificationTaskRow> {
  const res = await fetch(`${getGamificationApiBase()}/api/gamification/tasks`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({
      studentId: payload.studentId,
      title: payload.title,
      description: payload.description || "",
      xpReward: payload.xpReward ?? 50,
      subjectId: payload.subjectId || null,
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.error || json?.message || "Failed to assign quest");
  }
  const data = json?.data as GamificationTaskRow;
  if (!data?.id) throw new Error("Invalid response");
  return data;
}

export async function fetchCreatedTasks(): Promise<GamificationTaskRow[]> {
  const res = await fetch(`${getGamificationApiBase()}/api/gamification/tasks/created`, {
    headers: await authHeaders(),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    return [];
  }
  const data = parseJson<GamificationTaskRow[]>(json);
  return Array.isArray(data) ? data : [];
}

export async function fetchAdminAllTasks(department?: string): Promise<GamificationTaskRow[]> {
  const params = new URLSearchParams();
  if (department) params.set("department", department);
  const res = await fetch(
    `${getGamificationApiBase()}/api/gamification/tasks/admin/all?${params.toString()}`,
    {
      headers: await authHeaders(),
    }
  );
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    return [];
  }
  const data = parseJson<GamificationTaskRow[]>(json);
  return Array.isArray(data) ? data : [];
}

export type QuestCompletionRow = {
  student_id: string;
  student_name: string;
  register_no: string;
  completed_at: string;
  status: string;
  submission_notes: string | null;
};

export async function fetchQuestCompletions(taskId: string): Promise<QuestCompletionRow[]> {
  const res = await fetch(`${getGamificationApiBase()}/api/gamification/tasks/${encodeURIComponent(taskId)}/completions`, {
    headers: await authHeaders(),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    return [];
  }
  const data = parseJson<QuestCompletionRow[]>(json);
  return Array.isArray(data) ? data : [];
}
