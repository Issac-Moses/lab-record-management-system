function toCanonicalKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

const DEPARTMENT_LABELS: Record<string, string> = {
  it: "Information Technology",
  informationtechnology: "Information Technology",
  cse: "Computer Science and Engineering",
  computerscienceengineering: "Computer Science and Engineering",
  ece: "Electronics and Communication Engineering",
  electronicsandcommunicationengineering: "Electronics and Communication Engineering",
  eee: "Electrical and Electronics Engineering",
  electricalandelectronicsengineering: "Electrical and Electronics Engineering",
  mech: "Mechanical Engineering",
  mechanicalengineering: "Mechanical Engineering",
  civil: "Civil Engineering",
  civilengineering: "Civil Engineering",
  aids: "Artificial Intelligence & Data Science",
  artificialintelligenceanddatascience: "Artificial Intelligence & Data Science",
};

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatDepartmentName(value: unknown, fallback = "-"): string {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  const canonical = toCanonicalKey(raw);
  if (DEPARTMENT_LABELS[canonical]) return DEPARTMENT_LABELS[canonical];
  return toTitleCase(raw.replace(/\s+/g, " "));
}

export function formatDepartmentNameUpper(value: unknown, fallback = "-"): string {
  const formatted = formatDepartmentName(value, fallback);
  return String(formatted || fallback).toUpperCase();
}

