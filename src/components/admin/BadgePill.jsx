export default function BadgePill({ label, variant = "active" }) {
  const variants = {
    active: "border-emerald-200 bg-emerald-50 text-emerald-700",
    pending: "border-blue-200 bg-blue-50 text-blue-700",
    error: "border-rose-200 bg-rose-50 text-rose-700",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] ${variants[variant]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-90" />
      {label}
    </span>
  );
}

