import { supabase } from "@/lib/supabase";
import { getGamificationApiBase } from "@/services/gamificationApi";

export async function rewardSubmissionEvaluation(
  userId: string,
  xpAmount = 50,
  reviewerUserId?: string | null
): Promise<void> {
  if (!userId) return;

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const response = await fetch(
      `${getGamificationApiBase()}/api/gamification/reward-evaluation`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          userId,
          xpAmount,
          ...(reviewerUserId ? { reviewerUserId } : {}),
        }),
      }
    );

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.message || payload?.error || "Gamification request failed");
    }
  } catch (error) {
    console.error("Gamification reward failed:", error);
  }
}

export async function rewardSubmissionReview(
  studentUserId: string,
  marks?: number | null,
  reviewerUserId?: string | null
): Promise<void> {
  if (!studentUserId) return;

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const response = await fetch(
      `${getGamificationApiBase()}/api/gamification/reward-submission`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          userId: studentUserId,
          marks,
          ...(reviewerUserId ? { reviewerUserId } : {}),
        }),
      }
    );

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.message || payload?.error || "Gamification request failed");
    }
  } catch (error) {
    console.error("Gamification submission reward failed:", error);
  }
}
