/**
 * NNDL subject detection + hiding a legacy duplicate row:
 * Experiment #1 titled like "Implement simple vector addition…" that should not appear in UIs.
 * Remove the row in Supabase when ready; this keeps lists consistent until then.
 */
export function isNndlSubjectName(subjectName?: string | null): boolean {
  const name = String(subjectName || "").toLowerCase();
  return (
    name.includes("nndl") ||
    name.includes("neural network") ||
    name.includes("deep learning")
  );
}

/** True when this catalog row is the legacy NNDL Exp 1 (vector / TF intro) to hide. */
export function shouldHideLegacyNndlExperimentRow(
  subjectName: string | null | undefined,
  row: { experiment_no?: string | number | null; title?: string | null }
): boolean {
  if (!isNndlSubjectName(subjectName)) return false;
  const n = Number(row.experiment_no);
  if (n !== 1) return false;
  const t = String(row.title || "").toUpperCase();
  return t.includes("VECTOR") && (t.includes("ADDITION") || t.includes("TENS"));
}

export function shouldHideLegacyNndlUnifiedExperiment(
  subjectName: string | null | undefined,
  experimentNo: number,
  title: string
): boolean {
  if (!isNndlSubjectName(subjectName)) return false;
  if (experimentNo !== 1) return false;
  const t = String(title || "").toUpperCase();
  return t.includes("VECTOR") && (t.includes("ADDITION") || t.includes("TENS"));
}
