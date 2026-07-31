const STATUS_CONFIG = Object.freeze({
  draft: {
    key: "draft",
    label: "Draft",
    icon: "FileEdit",
    tone: "draft",
    color: "text-amber-600",
    dot: "bg-amber-500",
    background: "bg-amber-500/10 border border-amber-500/30",
  },
  locked: {
    key: "locked",
    label: "Locked",
    icon: "Lock",
    tone: "locked",
    color: "text-slate-400",
    dot: "bg-slate-400",
    background: "bg-slate-500/10 border border-slate-500/30",
  },
  submitted: {
    key: "submitted",
    label: "Submitted",
    icon: "Send",
    tone: "submitted",
    color: "text-sky-600",
    dot: "bg-sky-500",
    background: "bg-sky-500/10 border border-sky-500/30",
  },
  evaluated: {
    key: "evaluated",
    label: "Evaluated",
    icon: "CheckCircle2",
    tone: "completed",
    color: "text-emerald-600",
    dot: "bg-emerald-500",
    background: "bg-emerald-500/10 border border-emerald-500/30",
  },
  completed: {
    key: "completed",
    label: "Completed",
    icon: "CheckCircle2",
    tone: "completed",
    color: "text-emerald-600",
    dot: "bg-emerald-500",
    background: "bg-emerald-500/10 border border-emerald-500/30",
  },
  resubmit: {
    key: "resubmit",
    label: "Resubmit",
    icon: "RotateCcw",
    tone: "resubmit",
    color: "text-rose-600",
    dot: "bg-rose-500",
    background: "bg-rose-500/10 border border-rose-500/30",
  },
  pending: {
    key: "pending",
    label: "Available",
    icon: "Play",
    tone: "pending",
    color: "text-blue-600",
    dot: "bg-blue-500",
    background: "bg-blue-500/10 border border-blue-500/30",
  },
  late: {
    key: "late",
    label: "Late Submission",
    icon: "Clock",
    tone: "late",
    color: "text-amber-700",
    dot: "bg-amber-500",
    background: "bg-amber-100 border border-amber-300 text-amber-800",
  },
});

export function normalizeStatus(status) {
  return String(status || "").trim().toLowerCase();
}

export function checkIsLate(submittedDate, dueDate) {
  if (!submittedDate || !dueDate) return false;
  const subTs = new Date(submittedDate).getTime();
  const dueTs = new Date(dueDate).getTime();
  if (!Number.isFinite(subTs) || !Number.isFinite(dueTs)) return false;
  return subTs > dueTs;
}

export function getStatusConfig(status, submittedDate, dueDate) {
  const normalized = normalizeStatus(status);
  if ((normalized === "submitted" || normalized === "completed" || normalized === "evaluated") && checkIsLate(submittedDate, dueDate)) {
    return {
      normalized: "late",
      ...STATUS_CONFIG.late,
    };
  }
  const legacyAlias = normalized === "approved" ? "completed" : normalized;
  const completedAlias = legacyAlias === "evaluated" ? "completed" : legacyAlias;
  const fallbackAlias = completedAlias === "rejected" ? "resubmit" : completedAlias;
  const base = STATUS_CONFIG[fallbackAlias] || STATUS_CONFIG.pending;
  return {
    normalized,
    ...base,
  };
}

export default STATUS_CONFIG;
