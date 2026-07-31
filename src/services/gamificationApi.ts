/** Base URL for Express manual API (gamification uses service role server-side). */
export function getGamificationApiBase(): string {
  return import.meta.env.VITE_MANUAL_API_URL || "http://localhost:7001";
}
