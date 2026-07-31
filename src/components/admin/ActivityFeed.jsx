import ShellCard from "@/components/admin/ShellCard";
import BadgePill from "@/components/admin/BadgePill";

export default function ActivityFeed({ events = [], live = true, limit = 8 }) {
  return (
    <ShellCard
      title="Activity Feed"
      actions={live ? <BadgePill label="Live" variant="active" /> : null}
      glow="violet"
    >
      <div className="space-y-3">
        {events.slice(0, limit).map((event) => (
          <div key={event.id} className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
            <p className="text-sm text-slate-700">{event.text}</p>
            <p className="mt-1 text-xs text-slate-500">{event.time}</p>
          </div>
        ))}
        {events.length === 0 ? <p className="text-sm text-slate-500">No recent activity.</p> : null}
      </div>
    </ShellCard>
  );
}

