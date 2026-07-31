import AdminShell from "@/layouts/AdminShell";
import AdminGamificationPanel from "@/pages/Admin/AdminGamificationPanel.jsx";

/** @deprecated Use Leaderboard → Gamification (XP) tab. Route redirects. */
export default function AdminGamification() {
  return (
    <AdminShell title="Leaderboard · XP">
      <AdminGamificationPanel />
    </AdminShell>
  );
}
