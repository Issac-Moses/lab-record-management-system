import { useCallback, useEffect, useState } from "react";
import ShellCard from "@/components/admin/ShellCard";
import EmptyState from "@/components/admin/EmptyState";
import FadeSwitch from "@/components/admin/FadeSwitch";
import { supabase } from "@/lib/supabase";
import { getGamificationApiBase } from "@/services/gamificationApi";
import { getAdminDepartment } from "@/services/adminDataService";
import AdminGamificationQuests from "@/components/admin/AdminGamificationQuests";

/**
 * Gamification overview (read-only). Used inside Leaderboard tabs — no AdminShell.
 */
export default function AdminGamificationPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState({
    studentsWithXp: 0,
    totalXp: 0,
    avgLevel: 0,
    totalLabsCompleted: 0,
  });
  const [topRows, setTopRows] = useState([]);
  const [facultyTopRows, setFacultyTopRows] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await supabase.auth.getSession();
      const adminDept = await getAdminDepartment();

      const base = getGamificationApiBase();
      const withDept = (params) => {
        if (adminDept) params.set("department", adminDept);
        return params;
      };

      const statsUrl = `${base}/api/gamification/stats?${withDept(new URLSearchParams())}`;
      const studLbUrl = `${base}/api/gamification/leaderboard?${withDept(
        new URLSearchParams({ limit: "500", role: "student" })
      )}`;
      const facLbUrl = `${base}/api/gamification/leaderboard?${withDept(
        new URLSearchParams({ limit: "100", role: "faculty" })
      )}`;

      const [statsRes, studRes, facRes] = await Promise.all([
        fetch(statsUrl),
        fetch(studLbUrl),
        fetch(facLbUrl),
      ]);

      const statsJson = await statsRes.json().catch(() => null);
      const studJson = await studRes.json().catch(() => null);
      const facJson = await facRes.json().catch(() => null);

      if (!statsRes.ok || !statsJson?.success) {
        const hint =
          statsJson?.error ||
          statsJson?.message ||
          (statsRes.ok ? "Unknown stats error" : `HTTP ${statsRes.status}`);
        setError(
          `Gamification API unavailable (${hint}). Ensure the manual API is running and VITE_MANUAL_API_URL matches it.`
        );
        setSummary({ studentsWithXp: 0, totalXp: 0, avgLevel: 0, totalLabsCompleted: 0 });
        setTopRows([]);
        setFacultyTopRows([]);
        return;
      }

      const s = statsJson.data?.students;
      setSummary({
        studentsWithXp: Number(s?.withXp ?? 0),
        totalXp: Number(s?.totalXp ?? 0),
        avgLevel: Number(s?.avgLevel ?? 0),
        totalLabsCompleted: Number(s?.totalLabsCompleted ?? 0),
      });

      if (statsJson.data?.error) {
        setError(String(statsJson.data.error));
      }

      const studRows = studJson?.success && Array.isArray(studJson.data) ? studJson.data : [];
      setTopRows(
        studRows.slice(0, 15).map((row) => ({
          id: row.user_id,
          name: row.name || "Student",
          department: row.department || "—",
          xp: Number(row.xp_points ?? 0) || 0,
          level: Number(row.level ?? 1) || 1,
          labs: Number(row.labs_completed ?? 0) || 0,
          streak: Number(row.current_streak ?? 0) || 0,
        }))
      );

      const facRows = facJson?.success && Array.isArray(facJson.data) ? facJson.data : [];
      setFacultyTopRows(
        facRows.slice(0, 10).map((row) => ({
          id: row.user_id,
          name: row.name || "Faculty",
          department: row.department || "—",
          xp: Number(row.xp_points ?? 0) || 0,
          level: Number(row.level ?? 1) || 1,
          labs: Number(row.labs_completed ?? 0) || 0,
          streak: Number(row.current_streak ?? 0) || 0,
        }))
      );
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Failed to load gamification data.");
      setTopRows([]);
      setFacultyTopRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="col-span-12 space-y-4">
      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <FadeSwitch
          loading={loading}
          skeleton={<div className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />}
        >
          <ShellCard title="Students with XP" glow="violet">
            <p className="text-2xl font-semibold text-slate-900">{summary.studentsWithXp}</p>
            <p className="mt-1 text-xs text-slate-500">Students with XP &gt; 0</p>
          </ShellCard>
        </FadeSwitch>
        <FadeSwitch
          loading={loading}
          skeleton={<div className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />}
        >
          <ShellCard title="Total XP (all students)" glow="blue">
            <p className="text-2xl font-semibold text-slate-900">{summary.totalXp.toLocaleString()}</p>
          </ShellCard>
        </FadeSwitch>
        <FadeSwitch
          loading={loading}
          skeleton={<div className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />}
        >
          <ShellCard title="Avg level" glow="emerald">
            <p className="text-2xl font-semibold text-slate-900">{summary.avgLevel}</p>
          </ShellCard>
        </FadeSwitch>
        <FadeSwitch
          loading={loading}
          skeleton={<div className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />}
        >
          <ShellCard title="Labs completed (sum)" glow="cyan">
            <p className="text-2xl font-semibold text-slate-900">{summary.totalLabsCompleted.toLocaleString()}</p>
          </ShellCard>
        </FadeSwitch>
      </div>

      <ShellCard title="Top students by XP">
        {loading ? (
          <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
        ) : topRows.length === 0 ? (
          <EmptyState title="No gamification data" description="Once students earn XP, they will appear here." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-slate-600">Name</th>
                  <th className="px-4 py-2.5 text-left text-slate-600">Department</th>
                  <th className="px-4 py-2.5 text-right text-slate-600">XP</th>
                  <th className="px-4 py-2.5 text-right text-slate-600">Level</th>
                  <th className="px-4 py-2.5 text-right text-slate-600">Labs</th>
                  <th className="px-4 py-2.5 text-right text-slate-600">Streak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {topRows.map((row) => (
                  <tr key={row.id} className="bg-white/70 hover:bg-violet-50/50">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{row.name}</td>
                    <td className="px-4 py-2.5 text-slate-600">{row.department}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-violet-700">{row.xp.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{row.level}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{row.labs}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{row.streak}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ShellCard>

      <ShellCard title="Top faculty by XP (reviews)">
        {loading ? (
          <div className="h-32 animate-pulse rounded-xl bg-slate-100" />
        ) : facultyTopRows.length === 0 ? (
          <EmptyState
            title="No faculty XP yet"
            description="Faculty gain XP when they submit an evaluation on a student submission (via the review flow)."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-slate-600">Name</th>
                  <th className="px-4 py-2.5 text-left text-slate-600">Department</th>
                  <th className="px-4 py-2.5 text-right text-slate-600">XP</th>
                  <th className="px-4 py-2.5 text-right text-slate-600">Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {facultyTopRows.map((row) => (
                  <tr key={row.id} className="bg-white/70 hover:bg-indigo-50/50">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{row.name}</td>
                    <td className="px-4 py-2.5 text-slate-600">{row.department}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-indigo-700">{row.xp.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{row.level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ShellCard>

      <AdminGamificationQuests />
    </div>
  );
}
