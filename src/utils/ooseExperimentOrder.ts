/**
 * OBJECT ORIENTED SOFTWARE ENGINEERING LAB — official experiment sequence (manual / syllabus order).
 * Used when DB `experiment_no` does not match curriculum numbering.
 */

const OOSE_SUBJECT_ID = "549ae53e-741c-4d12-9d50-1ffafc5bfa9b";

/** Match first applicable pattern; index = curriculum position (0-based). */
const OOSE_TITLE_PATTERNS: RegExp[] = [
  /study\s+of\s+uml/i,
  /passport\s+automation/i,
  /book\s+bank\s+management/i,
  /exam\s+registration/i,
  /stock\s+maintenance/i,
  /online\s+course\s+reservation/i,
  /e[-\s]?ticketing/i,
  /software\s+personnel\s+management/i,
  /credit\s+card\s+processing/i,
  /e[-\s]?book\s+management/i,
  /online\s+recruitment/i,
  /foreign\s+trading/i,
  /conference\s+management/i,
  /bpo\s+management/i,
  /library\s+management/i,
];

export function isOoseSubject(
  subjectId: string | null | undefined,
  subjectName: string | null | undefined
): boolean {
  const id = String(subjectId || "").trim();
  if (id === OOSE_SUBJECT_ID) return true;
  const name = String(subjectName || "").toLowerCase();
  if (name.includes("object oriented software engineering")) return true;
  return false;
}

/** Lower index = earlier in syllabus. Unknown titles sort last, then alphabetically. */
export function getOoseCurriculumRank(title: string): number {
  const t = String(title || "").trim();
  for (let i = 0; i < OOSE_TITLE_PATTERNS.length; i++) {
    const pattern = OOSE_TITLE_PATTERNS[i];
    if (pattern && pattern.test(t)) return i;
  }
  return 1000;
}

export function compareOoseTitles(aTitle: string, bTitle: string): number {
  const ra = getOoseCurriculumRank(aTitle);
  const rb = getOoseCurriculumRank(bTitle);
  if (ra !== rb) return ra - rb;
  return String(aTitle || "").localeCompare(String(bTitle || ""), undefined, {
    sensitivity: "base",
  });
}

/**
 * When subject is OOSE, sort by syllabus order; otherwise return items unchanged.
 */
export function applyOoseExperimentOrderIfNeeded<T>(
  subjectId: string | null | undefined,
  subjectName: string | null | undefined,
  items: T[],
  getTitle: (item: T) => string
): T[] {
  if (!items.length || !isOoseSubject(subjectId, subjectName)) {
    return items;
  }
  return [...items].sort((a, b) => compareOoseTitles(getTitle(a), getTitle(b)));
}
