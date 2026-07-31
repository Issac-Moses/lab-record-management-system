type AiBreakdown = Record<string, number> | null | undefined;

type Props = {
  score: number | null | undefined;
  confidence?: number | string | null;
  status?: string | null;
  breakdown?: AiBreakdown;
  loading?: boolean;
  pendingText?: string;
  noteText?: string;
  variant?: "student" | "faculty" | "compact";
  showFullBreakdown?: boolean;
  isFacultyCorrected?: boolean;
  isApproved?: boolean;
  facultySignature?: string | null;
  approvedAt?: string | null;
};

function clampPercent(value: unknown): number {
  return Math.max(0, Math.min(100, Number(value ?? 0)));
}

function resolveStatus(score: number, status?: string | null): string {
  if (String(status || "").trim()) return String(status);
  const normalized = score > 10 ? score / 10 : score;
  return normalized > 7 ? "Good" : "Needs Improvement";
}

function normalizeScoreOutOf10(score: number): number {
  const parsed = Number(score);
  if (!Number.isFinite(parsed)) return 0;
  const normalized = parsed > 10 ? parsed / 10 : parsed;
  return Math.max(0, Math.min(10, normalized));
}

function toConfidenceLabel(confidence: number | string | null | undefined): string {
  if (typeof confidence === "string" && confidence.trim().length > 0) {
    return confidence.trim();
  }
  const numeric = Number(confidence ?? 0);
  if (!Number.isFinite(numeric)) return "Low";
  if (numeric >= 80) return "High";
  if (numeric >= 60) return "Medium";
  return "Low";
}

export default function AiEvaluationCard({
  score,
  confidence = null,
  status = null,
  breakdown,
  loading = false,
  pendingText = "AI analysis pending",
  noteText = "This is a suggestion. Faculty marks are final.",
  variant = "faculty",
  showFullBreakdown = true,
  isFacultyCorrected = false,
  isApproved = false,
  facultySignature = null,
  approvedAt = null,
}: Props) {
  const isCompact = variant === "compact";
  const isStudent = variant === "student";

  const shellClass = isStudent
    ? "rounded-lg border border-indigo-200 bg-indigo-50/60 p-3"
    : isCompact
      ? "min-w-[190px] rounded-lg border border-indigo-100 bg-indigo-50/60 p-2.5"
      : "rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 shadow-sm";

  const badgeClass = isStudent
    ? "rounded-full border border-indigo-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-600"
    : "rounded-full border border-indigo-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-indigo-600";

  const titleClass = isStudent
    ? "text-xs font-semibold uppercase tracking-wide text-indigo-600"
    : "text-xs font-semibold uppercase tracking-wide text-indigo-600";

  if (loading) {
    return (
      <div className={shellClass}>
        <div className="mb-2 flex items-center justify-between">
          <span className={titleClass}>AI Assisted Evaluation</span>
          <span className={badgeClass}>AI Assisted</span>
        </div>
        <div className="space-y-2">
          <div className="h-3 w-4/5 animate-pulse rounded bg-indigo-100" />
          <div className="h-3 w-3/5 animate-pulse rounded bg-indigo-100" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-indigo-100" />
        </div>
      </div>
    );
  }

  if (score == null) {
    return (
      <div className={shellClass}>
        <div className="mb-2 flex items-center justify-between">
          <span className={titleClass}>AI Assisted Evaluation</span>
          <span className={badgeClass}>AI Assisted</span>
        </div>
        <p className={isStudent ? "text-xs text-slate-600" : "text-xs text-slate-500"}>{pendingText}</p>
      </div>
    );
  }

  const normalizedScore = normalizeScoreOutOf10(Number(score));
  const normalizedConfidenceLabel = toConfidenceLabel(confidence);
  const finalStatus = resolveStatus(normalizedScore, status);
  const showFacultyBadge = Boolean(isFacultyCorrected && isApproved);
  const signerName = String(facultySignature || "").trim() || "Faculty";
  const approvedDateText = approvedAt ? new Date(approvedAt).toLocaleDateString("en-IN") : "";
  const hasSectionBreakdown =
    typeof breakdown?.aim === "number" || typeof breakdown?.procedure === "number";
  const rows = showFullBreakdown
    ? hasSectionBreakdown
      ? [
          { label: "Aim", key: "aim" },
          { label: "Procedure", key: "procedure" },
          { label: "Program", key: "program" },
          { label: "Output", key: "output" },
          { label: "Result", key: "result" },
        ]
      : [
          { label: "Algorithm", key: "algorithm" },
          { label: "Program", key: "program" },
          { label: "Output", key: "output" },
          { label: "Result", key: "result" },
        ]
    : [
        { label: hasSectionBreakdown ? "Procedure" : "Algorithm", key: hasSectionBreakdown ? "procedure" : "algorithm" },
        { label: "Program", key: "program" },
      ];

  return (
    <div className={shellClass}>
      <div className={`mb-2 flex items-center ${isCompact ? "justify-between" : "justify-between"}`}>
        <span className={titleClass}>AI Assisted Evaluation</span>
        <span className={badgeClass}>AI Assisted</span>
      </div>

      <div className={isStudent ? "space-y-1.5 text-xs text-slate-700" : "space-y-1.5 text-sm text-slate-700"}>
        <p>
          Score:{" "}
          <span className={isStudent ? "font-semibold text-slate-900" : "font-semibold text-slate-900"}>
            {Number.isInteger(normalizedScore) ? normalizedScore : normalizedScore.toFixed(1)} / 10
          </span>
        </p>
        <p>
          Confidence:{" "}
          <span className={isStudent ? "font-semibold text-slate-900" : "font-semibold text-slate-900"}>
            {normalizedConfidenceLabel}
          </span>
        </p>
        <p>
          Status:{" "}
          <span className={isStudent ? "font-semibold text-slate-900" : "font-semibold text-slate-900"}>
            {finalStatus}
          </span>
        </p>
      </div>

      <div className={isCompact ? "mt-2 space-y-1" : "mt-2 space-y-2"}>
        {rows.map((item) => {
          const value = clampPercent(breakdown?.[item.key]);
          return (
            <div key={item.key}>
              <div
                className={
                  isStudent
                    ? "mb-0.5 flex items-center justify-between text-[10px] text-slate-600"
                    : isCompact
                      ? "mb-0.5 flex items-center justify-between text-[10px] text-slate-600"
                      : "mb-1 flex items-center justify-between text-[11px] text-slate-600"
                }
              >
                <span>{item.label}</span>
                <span>{value}%</span>
              </div>
              <div
                className={
                  isStudent
                    ? "h-1 overflow-hidden rounded-full bg-indigo-100"
                    : isCompact
                      ? "h-1 overflow-hidden rounded-full bg-indigo-100"
                      : "h-1.5 overflow-hidden rounded-full bg-indigo-100"
                }
              >
                <div className="h-full rounded-full bg-indigo-500" style={{ width: `${value}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {showFacultyBadge ? (
        <div className={isCompact ? "mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1" : "mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2"}>
          <p className={isCompact ? "text-[10px] font-semibold text-emerald-700" : "text-[11px] font-semibold text-emerald-700"}>
            Faculty Corrected ✔
          </p>
          <p className={isCompact ? "text-[10px] text-emerald-700/90" : "text-[11px] text-emerald-700/90"}>
            Digitally signed by {signerName}{approvedDateText ? ` on ${approvedDateText}` : ""}
          </p>
        </div>
      ) : null}

      <p className={isStudent ? "mt-2 text-[10px] text-slate-500" : "pt-1 text-[11px] text-slate-500"}>
        {noteText}
      </p>
    </div>
  );
}

