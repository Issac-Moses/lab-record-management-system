export const SUBJECT_DEPARTMENT_MAP: Record<string, string> = {
  "NEURAL NETWORK AND DEEP LEARNING LABORATORY": "IT",
  "NEURAL NETWORKS AND DEEP LEARNING LABORATORY": "IT",
  "BUSINESS ANALYTICS": "IT",
  "MOBILE APPLICATIONS LAB": "IT",
  "MOBILE APPLICATIONS DEVELOPMENT LABORATORY": "IT",
  "OBJECT ORIENTED SOFTWARE ENGINEERING LABORATORY": "IT",
};

function normalizeSubject(value: string): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

export function getDepartmentForSubject(subject: string): string | null {
  const normalized = normalizeSubject(subject);
  if (!normalized) {
    return null;
  }
  const mapped = SUBJECT_DEPARTMENT_MAP[normalized] || null;
  return mapped;
}
