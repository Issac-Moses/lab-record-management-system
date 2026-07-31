/**
 * @deprecated Demo-only: toggles are React local state and do not affect the server.
 * The live admin settings route uses {@link ../AdminSettings.tsx} at `/admin/settings`.
 * Kept for reference or storybook; do not wire new routes here without backend support.
 */
import { useState } from "react";
import AdminShell from "@/layouts/AdminShell";
import ShellCard from "@/components/admin/ShellCard";

export default function SettingsPage() {
  const [toggles, setToggles] = useState({
    maintenance: false,
    registration: true,
    aiAutoEval: true,
    emailNotif: true,
  });

  const updateToggle = (key) => setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  const enabledControls = Object.values(toggles).filter(Boolean).length;
  const systemStatus = toggles.maintenance ? "Restricted" : "Operational";

  return (
    <AdminShell title="Settings (demo UI)">
      <div className="col-span-12 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>Preview only:</strong> these switches are not persisted and do not change production behavior. Use{" "}
        <span className="font-mono">/admin/settings</span> for the real admin settings page.
      </div>
      <div className="col-span-12 grid gap-4 xl:grid-cols-2">
        <ShellCard
          title="System Controls"
          glow="violet"
          actions={
            <span
              className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                toggles.maintenance ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
              }`}
            >
              {systemStatus}
            </span>
          }
        >
          <div className="mb-4 grid gap-2 sm:grid-cols-3">
            <MetricPill label="Enabled Controls" value={`${enabledControls}/4`} tone="violet" />
            <MetricPill label="System State" value={systemStatus} tone={toggles.maintenance ? "rose" : "emerald"} />
            <MetricPill label="Risk Level" value={toggles.maintenance ? "High" : "Normal"} tone={toggles.maintenance ? "amber" : "cyan"} />
          </div>
          <div className="space-y-3">
            <ToggleRow
              title="Maintenance Mode"
              desc="Blocks all student access"
              checked={toggles.maintenance}
              onToggle={() => updateToggle("maintenance")}
              priority="Critical"
            />
            <ToggleRow
              title="Student Registration"
              desc="Allow new student signups"
              checked={toggles.registration}
              onToggle={() => updateToggle("registration")}
              priority="Public"
            />
            <ToggleRow
              title="AI Auto-Evaluation"
              desc="Enable AI scoring pipeline"
              checked={toggles.aiAutoEval}
              onToggle={() => updateToggle("aiAutoEval")}
              priority="Academic"
            />
            <ToggleRow
              title="Email Notifications"
              desc="Send system alerts to admins"
              checked={toggles.emailNotif}
              onToggle={() => updateToggle("emailNotif")}
              priority="Ops"
            />
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Changes apply instantly for admin sessions. Keep Maintenance Mode off during active lab hours.
          </p>
        </ShellCard>

        <ShellCard title="Database Controls" glow="emerald">
          <div className="mb-4 grid gap-2 sm:grid-cols-3">
            <MetricPill label="Backup Health" value="Healthy" tone="emerald" />
            <MetricPill label="Last Snapshot" value="3h ago" tone="cyan" />
            <MetricPill label="Danger Actions" value="1" tone="amber" />
          </div>
          <div className="space-y-3">
            <ActionRow
              title="Manual Backup"
              desc="Create an immediate database snapshot"
              meta="Last run: 3 hours ago"
              action="Run now"
              onAction={() =>
                window.alert(
                  "Demo only: backups are not wired in this UI. Use Supabase Dashboard → Database → Backups."
                )
              }
            />
            <ActionRow
              title="Export All Data"
              desc="Students, submissions, grades"
              meta="CSV + JSON package"
              action="Export"
              onAction={() =>
                window.alert(
                  "Demo only: use Bulk Upload / Reports export, or Supabase Table Editor → Export for full data."
                )
              }
            />
            <ActionRow
              title="Purge Test Data"
              desc="Removes all non-production rows"
              meta="This action cannot be undone"
              action="Purge"
              danger
              onAction={() =>
                window.alert(
                  "Demo only: destructive actions are disabled here. Delete rows in Supabase if you really need to."
                )
              }
            />
          </div>
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Safety Notice</p>
            <p className="mt-1 text-xs text-amber-700/90">
              Use purge only after confirming staging and test accounts are not needed for analytics previews.
            </p>
          </div>
        </ShellCard>
      </div>
    </AdminShell>
  );
}

function MetricPill({ label, value, tone = "violet" }) {
  const toneClasses = {
    violet: "border-violet-200 bg-violet-50 text-violet-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
  };
  return (
    <div className={`rounded-xl border px-3 py-2 ${toneClasses[tone] || toneClasses.violet}`}>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function ToggleRow({ title, desc, checked, onToggle, priority = "General" }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-3 transition hover:border-slate-300">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-600">
            {priority}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              checked ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
            }`}
          >
            {checked ? "Enabled" : "Disabled"}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500">{desc}</p>
      </div>
      <button
        onClick={onToggle}
        className={`h-6 w-11 rounded-full border p-0.5 transition ${
          checked ? "border-violet-400 bg-violet-500" : "border-slate-300 bg-slate-200"
        }`}
      >
        <span className={`block h-4.5 w-4.5 rounded-full bg-white transition ${checked ? "translate-x-5" : "translate-x-0"}`} />
      </button>
    </div>
  );
}

function ActionRow({ title, desc, meta, action, danger = false, onAction }) {
  return (
    <div
      className={`flex items-center justify-between rounded-xl border px-3 py-3 ${
        danger ? "border-rose-200 bg-rose-50/60" : "border-slate-200 bg-white"
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="mt-1 text-xs text-slate-500">{desc}</p>
        {meta ? <p className="mt-1 text-[11px] text-slate-500">{meta}</p> : null}
      </div>
      <button
        type="button"
        onClick={onAction}
        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
          danger
            ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
            : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
        }`}
      >
        {action}
      </button>
    </div>
  );
}

