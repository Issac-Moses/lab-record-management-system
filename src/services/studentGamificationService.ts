import { supabase } from "@/lib/supabase";
import { getGamificationApiBase } from "@/services/gamificationApi";

export type GamificationProgress = {
  xp_points: number;
  level: number;
  labs_completed: number;
  current_streak: number;
};

const DEFAULT_PROGRESS: GamificationProgress = {
  xp_points: 0,
  level: 1,
  labs_completed: 0,
  current_streak: 0,
};

/** Must match `LAB_COMPLETION_XP_REWARD` / `LEVEL_DIVISOR` in `services/gamificationService.cjs`. */
export const LAB_XP_PER_COMPLETION = 25;
export const LEVEL_DIVISOR = 200;

/**
 * Profile columns may stay 0 if rewards never ran or RLS hid writes — merge in real experiment progress
 * from the app so Level / XP / labs match completed work for the current subject view.
 */
export function mergeProgressWithExperimentActivity(
  stored: GamificationProgress,
  completedLabsFromExperiments: number
): GamificationProgress {
  const completed = Math.max(0, Math.floor(Number(completedLabsFromExperiments) || 0));
  const derivedLabXp = completed * LAB_XP_PER_COMPLETION;
  const storedXp = normalizeCount(stored.xp_points);

  // If stored.xp_points is less than derivedLabXp, stored.xp_points contains quest XP that hasn't been merged with lab XP yet.
  // Add them together so quest XP is never lost and always increases Experience Points.
  const xp = storedXp >= derivedLabXp ? storedXp : storedXp + derivedLabXp;
  const labs = Math.max(normalizeCount(stored.labs_completed), completed);
  const levelFromXp = Math.floor(xp / LEVEL_DIVISOR) + 1;
  const level = Math.max(normalizeCount(stored.level, 1) || 1, levelFromXp);
  return {
    xp_points: xp,
    level: Math.max(1, level),
    labs_completed: labs,
    current_streak: normalizeCount(stored.current_streak),
  };
}
const GAMIFICATION_COLUMN_HINTS = ["xp_points", "labs_completed", "current_streak", "level"];
let cachedGamificationTable: "profiles" | "users" | null = null;
let disableGamificationQueries = false;
/** null = not yet probed; false = table/RLS missing; true = OK */
let userAchievementsAvailable: boolean | null = null;

function normalizeCount(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function isMissingColumnError(error: unknown): boolean {
  const serialized = JSON.stringify(error || {}).toLowerCase();
  const isColumnIssue =
    serialized.includes("column") || serialized.includes("schema cache") || serialized.includes("pgrst204");
  if (!isColumnIssue) return false;
  return GAMIFICATION_COLUMN_HINTS.some((column) => serialized.includes(column));
}

function normalizeDepartmentCode(value: unknown): string {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  if (!normalized) return "";
  if (normalized === "IT" || normalized === "INFORMATIONTECHNOLOGY") return "IT";
  if (normalized === "CSE" || normalized === "COMPUTERSCIENCEENGINEERING" || normalized === "COMPUTERSCIENCEANDENGINEERING") return "CSE";
  if (normalized === "ECE" || normalized === "ELECTRONICSCOMMUNICATIONENGINEERING" || normalized === "ELECTRONICSANDCOMMUNICATIONENGINEERING") return "ECE";
  if (normalized === "EEE" || normalized === "ELECTRICALANDELECTRONICSENGINEERING") return "EEE";
  if (normalized === "MECH" || normalized === "MECHANICALENGINEERING") return "MECH";
  return normalized;
}

async function resolveGamificationTable(): Promise<"profiles" | "users"> {
  if (cachedGamificationTable) return cachedGamificationTable;
  cachedGamificationTable = "profiles";
  return cachedGamificationTable;
}

/** Students: POST syncs profiles from submissions + student_experiments (service role); keeps leaderboard accurate. */
export async function trySyncStudentProgress(userId: string): Promise<GamificationProgress | null> {
  const base = getGamificationApiBase().replace(/\/$/, "");
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    const sid = session?.user?.id;
    if (!token || !sid || sid !== userId) return null;

    const res = await fetch(`${base}/api/gamification/sync-progress`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      success?: boolean;
      data?: Partial<GamificationProgress>;
    };
    if (!json?.success || !json.data || typeof json.data !== "object") return null;
    const d = json.data;
    return {
      xp_points: normalizeCount(d.xp_points),
      level: normalizeCount(d.level, 1) || 1,
      labs_completed: normalizeCount(d.labs_completed),
      current_streak: normalizeCount(d.current_streak),
    };
  } catch {
    return null;
  }
}

async function fetchProgressFromBackendApi(userId: string): Promise<GamificationProgress | null> {
  const base = getGamificationApiBase().replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/gamification/progress/${encodeURIComponent(userId)}`);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      success?: boolean;
      data?: Partial<GamificationProgress>;
    };
    if (!json?.success || !json.data || typeof json.data !== "object") return null;
    const d = json.data;
    return {
      xp_points: normalizeCount(d.xp_points),
      level: normalizeCount(d.level, 1) || 1,
      labs_completed: normalizeCount(d.labs_completed),
      current_streak: normalizeCount(d.current_streak),
    };
  } catch {
    return null;
  }
}

export async function getUserProgress(userId: string): Promise<GamificationProgress> {
  if (!userId || disableGamificationQueries) return { ...DEFAULT_PROGRESS };

  // Do not auto-sync on every dashboard/profile load.
  // Progress is synced by submission/evaluation flows and fetched here.
  const fromApi = await fetchProgressFromBackendApi(userId);
  if (fromApi) {
    return fromApi;
  }

  try {
    const tableName = await resolveGamificationTable();
    const { data, error } = await supabase
      .from(tableName)
      .select("xp_points, level, labs_completed, current_streak")
      .eq("id", userId)
      .maybeSingle();

    if (error || !data) {
      if (error && isMissingColumnError(error)) {
        disableGamificationQueries = true;
      }
      return { ...DEFAULT_PROGRESS };
    }

    return {
      xp_points: normalizeCount((data as any).xp_points),
      level: normalizeCount((data as any).level, 1) || 1,
      labs_completed: normalizeCount((data as any).labs_completed),
      current_streak: normalizeCount((data as any).current_streak),
    };
  } catch (error) {
    console.error("getUserProgress failed:", error);
    return { ...DEFAULT_PROGRESS };
  }
}

export async function getLeaderboard(
  department?: string,
  limit = 5,
  currentUserId?: string
): Promise<Array<{ rank: number; user_id: string; name: string; xp_points: number }>> {
  if (disableGamificationQueries) return [];

  const base = getGamificationApiBase();
  const params = new URLSearchParams();
  params.set("limit", String(Math.min(50, Math.max(limit + 3, 8))));
  params.set("role", "student");
  if (department) params.set("department", department);

  try {
    const res = await fetch(`${base}/api/gamification/leaderboard?${params.toString()}`);
    if (res.ok) {
      const json = (await res.json()) as { success?: boolean; data?: unknown };
      const raw = json?.data;
      if (json?.success && Array.isArray(raw)) {
        const rankedEnriched = raw.map((row: Record<string, unknown>, i: number) => ({
          rank: Number(row.rank) || i + 1,
          user_id: String(row.user_id || ""),
          name: String(row.name || "Student"),
          xp_points: normalizeCount(row.xp_points),
        })).filter((r) => r.user_id);

        const topRows = rankedEnriched.slice(0, Math.max(1, limit));
        if (!currentUserId || topRows.some((row) => row.user_id === currentUserId)) {
          return topRows;
        }
        const current = rankedEnriched.find((row) => row.user_id === currentUserId);
        if (!current) return topRows;
        return [...topRows, current];
      }
    }
  } catch {
    /* fall back below */
  }

  try {
    const tableName = await resolveGamificationTable();
    const { data, error } = await supabase
      .from(tableName)
      .select("id, name, department, xp_points, role")
      .eq("role", "student")
      .limit(500);
    if (error || !Array.isArray(data)) {
      return [];
    }

    const filtered = (data as Record<string, unknown>[])
      .filter((row) => {
        if (!department) return true;
        return (
          normalizeDepartmentCode(row?.department) === normalizeDepartmentCode(department)
        );
      })
      .map((row) => ({
        user_id: String(row?.id || ""),
        name: String(row?.name || "Student"),
        xp_points: normalizeCount(row?.xp_points),
      }))
      .filter((row) => row.user_id);

    const rankedEnriched = filtered
      .sort((a, b) => b.xp_points - a.xp_points)
      .map((row, index) => ({ rank: index + 1, ...row }));

    const topRows = rankedEnriched.slice(0, Math.max(1, limit));
    if (!currentUserId || topRows.some((row) => row.user_id === currentUserId)) {
      return topRows;
    }
    const current = rankedEnriched.find((row) => row.user_id === currentUserId);
    if (!current) return topRows;
    return [...topRows, current];
  } catch (error) {
    console.error("getLeaderboard failed:", error);
    return [];
  }
}

export type AchievementCatalogItem = {
  id: string;
  name: string;
  description: string;
  xp_reward: number;
  earned_at: string | null;
};

/**
 * Full catalog: every row in `achievements` with earned_at set when the user unlocked it.
 * Shows locked achievements (earned_at null) with titles and descriptions.
 */
export async function getAchievementsCatalog(userId: string): Promise<AchievementCatalogItem[]> {
  if (!userId || disableGamificationQueries) return [];

  try {
    const { data: all, error: allErr } = await supabase
      .from("achievements")
      .select("id, name, description, xp_reward")
      .order("name", { ascending: true });

    if (allErr || !Array.isArray(all) || all.length === 0) {
      if (allErr && isMissingColumnError(allErr)) {
        disableGamificationQueries = true;
      }
      return [];
    }

    const { data: earnedRows, error: earnedErr } = await supabase
      .from("user_achievements")
      .select("achievement_id, earned_at")
      .eq("user_id", userId);

    if (earnedErr) {
      const serialized = JSON.stringify(earnedErr || {}).toLowerCase();
      if (serialized.includes("relation") || serialized.includes("does not exist")) {
        userAchievementsAvailable = false;
      }
    }

    const earnedMap = new Map<string, string | null>();
    (earnedRows || []).forEach((row: { achievement_id?: string; earned_at?: string | null }) => {
      if (row?.achievement_id) earnedMap.set(String(row.achievement_id), row.earned_at || null);
    });

    return (all as Record<string, unknown>[]).map((a) => ({
      id: String(a.id || ""),
      name: String(a.name || "Achievement"),
      description: String(a.description || ""),
      xp_reward: normalizeCount(a.xp_reward),
      earned_at: earnedMap.has(String(a.id)) ? earnedMap.get(String(a.id)) ?? null : null,
    }));
  } catch (error) {
    console.error("getAchievementsCatalog failed:", error);
    return [];
  }
}

export async function getUserAchievements(
  userId: string
): Promise<Array<{ id: string; name: string; description: string; xp_reward: number; earned_at: string | null }>> {
  if (!userId) return [];
  if (userAchievementsAvailable === false) return [];

  try {
    const { data, error } = await supabase
      .from("user_achievements")
      .select("id, earned_at, achievements(id, name, description, xp_reward)")
      .eq("user_id", userId)
      .order("earned_at", { ascending: false });

    if (error || !data) {
      const serialized = JSON.stringify(error || {}).toLowerCase();
      if (
        serialized.includes("relation") ||
        serialized.includes("does not exist") ||
        serialized.includes("404")
      ) {
        userAchievementsAvailable = false;
      }
      return [];
    }
    userAchievementsAvailable = true;

    return data
      .map((row: any) => {
        const achievement = Array.isArray(row.achievements)
          ? row.achievements[0]
          : row.achievements;
        if (!achievement) return null;
        return {
          id: String(achievement.id || row.id),
          name: String(achievement.name || "Achievement"),
          description: String(achievement.description || ""),
          xp_reward: normalizeCount(achievement.xp_reward),
          earned_at: row.earned_at || null,
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      name: string;
      description: string;
      xp_reward: number;
      earned_at: string | null;
    }>;
  } catch (error) {
    console.error("getUserAchievements failed:", error);
    return [];
  }
}
