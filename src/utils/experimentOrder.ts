export function getExperimentOrderNumber(value: unknown): number {
  const normalized = String(value ?? "");
  const numeric = parseInt(normalized.replace(/\D/g, ""), 10);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function compareExperimentNo(a: unknown, b: unknown): number {
  const textA = String(a ?? "").trim();
  const textB = String(b ?? "").trim();

  const numA = getExperimentOrderNumber(textA);
  const numB = getExperimentOrderNumber(textB);

  if (numA !== numB) return numA - numB;
  return textA.localeCompare(textB);
}

export function sortByExperimentNo<T>(
  data: T[],
  getValue: (item: T) => unknown
): T[] {
  return [...data].sort((a, b) => compareExperimentNo(getValue(a), getValue(b)));
}
