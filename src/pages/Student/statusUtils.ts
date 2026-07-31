export type StudentStatusTone =
  | "completed"
  | "submitted"
  | "draft"
  | "resubmit"
  | "pending";

export const COMPLETED_STATUSES = ["evaluated", "approved"] as const;
export const DRAFT_STATUSES = ["draft"] as const;
export const RESUBMIT_STATUSES = ["resubmit", "rejected"] as const;

export function normalizeStudentStatus(status: unknown): string {
  return String(status || "").trim().toLowerCase();
}

export function isCompletedStatus(status: unknown): boolean {
  const normalized = normalizeStudentStatus(status);
  return COMPLETED_STATUSES.includes(normalized as (typeof COMPLETED_STATUSES)[number]);
}

export function isDraftStatus(status: unknown): boolean {
  const normalized = normalizeStudentStatus(status);
  return DRAFT_STATUSES.includes(normalized as (typeof DRAFT_STATUSES)[number]);
}

export function isRejectedStatus(status: unknown): boolean {
  const normalized = normalizeStudentStatus(status);
  return RESUBMIT_STATUSES.includes(normalized as (typeof RESUBMIT_STATUSES)[number]);
}

export function isSubmittedStatus(status: unknown): boolean {
  return normalizeStudentStatus(status) === "submitted";
}

export function getStatusBucketForCounts(
  status: unknown
): "completed" | "draft" | "pending" {
  if (isCompletedStatus(status)) return "completed";
  if (isDraftStatus(status)) return "draft";
  return "pending";
}

export function getStudentStatusDisplay(status: unknown): {
  tone: StudentStatusTone;
  label: string;
  normalized: string;
} {
  const normalized = normalizeStudentStatus(status);

  if (isCompletedStatus(normalized)) {
    return { tone: "completed", label: "Evaluated", normalized };
  }
  if (isSubmittedStatus(normalized)) {
    return { tone: "submitted", label: "Submitted", normalized };
  }
  if (isDraftStatus(normalized)) {
    return { tone: "draft", label: "Draft", normalized };
  }
  if (isRejectedStatus(normalized)) {
    return { tone: "resubmit", label: "Resubmit", normalized };
  }

  return { tone: "pending", label: "Pending", normalized };
}
