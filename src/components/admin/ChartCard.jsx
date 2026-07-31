import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import ShellCard from "@/components/admin/ShellCard";
import EmptyState from "@/components/admin/EmptyState";
import FadeSwitch from "@/components/admin/FadeSwitch";

export default function ChartCard({
  title,
  type = "area",
  data = [],
  height = 260,
  colors = ["#22d3ee"],
  dataKey = "value",
  xKey = "label",
  emptyTitle = "No chart data",
  emptyDescription = "Data points will appear when records are available.",
  loading = false,
  actions,
  legendItems = [],
  deltaBadge,
}) {
  const skeleton = (
    <div className="space-y-3">
      <div className="h-4 w-1/3 animate-pulse rounded bg-slate-200" />
      <div className="faculty-shimmer h-[220px] w-full animate-pulse rounded-xl border border-slate-200 bg-white" />
    </div>
  );

  const hasData = Array.isArray(data) && data.length > 0;
  const hasNonZeroValue =
    hasData &&
    data.some((row) => {
      const value = Number(row?.[dataKey] ?? 0);
      return Number.isFinite(value) && value > 0;
    });

  const chart =
    !hasData || !hasNonZeroValue ? (
      <EmptyState title={emptyTitle} description={emptyDescription} />
    ) : (
      <ResponsiveContainer width="100%" height={height}>
        {type === "bar" ? (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey={xKey} tick={{ fill: "#64748b", fontSize: 11 }} />
            <YAxis tick={{ fill: "#64748b", fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 10 }} />
            <Bar dataKey={dataKey} fill={colors[0]} radius={[8, 8, 0, 0]} />
          </BarChart>
        ) : type === "line" ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey={xKey} tick={{ fill: "#64748b", fontSize: 11 }} />
            <YAxis tick={{ fill: "#64748b", fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 10 }} />
            <Line type="monotone" dataKey={dataKey} stroke={colors[0]} strokeWidth={2.2} dot={false} />
          </LineChart>
        ) : (
          <AreaChart data={data}>
            <defs>
              <linearGradient id="chartAreaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={colors[0] || "#6366f1"} stopOpacity={0.4}/>
                <stop offset="95%" stopColor={colors[0] || "#6366f1"} stopOpacity={0.01}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis 
              dataKey={xKey} 
              tickLine={false} 
              axisLine={false} 
              tick={{ fill: "#94a3b8", fontSize: 10 }} 
              dy={6}
            />
            <YAxis 
              tickLine={false} 
              axisLine={false} 
              tick={{ fill: "#94a3b8", fontSize: 10 }} 
              dx={-6}
            />
            <Tooltip 
              contentStyle={{ 
                background: "rgba(255, 255, 255, 0.95)", 
                border: "1px solid #e2e8f0", 
                borderRadius: 12,
                boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.05)"
              }} 
            />
            <Area 
              type="monotone" 
              dataKey={dataKey} 
              stroke={colors[0] || "#6366f1"} 
              strokeWidth={3} 
              fill="url(#chartAreaGradient)" 
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
    );

  return (
    <ShellCard title={title} actions={actions}>
      <FadeSwitch loading={loading} skeleton={skeleton}>
        {(legendItems.length > 0 || deltaBadge) && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {legendItems.map((item, idx) => (
                <span
                  key={`${item.label}-${idx}`}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-600"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: item.color || colors[idx] || colors[0] }}
                  />
                  {item.label}
                </span>
              ))}
            </div>
            {deltaBadge ? (
              <span
                className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold ${
                  deltaBadge.tone === "down"
                    ? "bg-rose-50 text-rose-700"
                    : "bg-emerald-50 text-emerald-700"
                }`}
              >
                {deltaBadge.label}
              </span>
            ) : null}
          </div>
        )}
        {chart}
      </FadeSwitch>
    </ShellCard>
  );
}

