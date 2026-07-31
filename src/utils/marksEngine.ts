function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rangeBounds(aiScore: number): { min: number; max: number } {
  if (aiScore >= 85) return { min: 9, max: 10 };
  if (aiScore >= 75) return { min: 8, max: 9 };
  if (aiScore >= 65) return { min: 7, max: 8 };
  if (aiScore >= 50) return { min: 6, max: 7 };
  return { min: 4, max: 6 };
}

function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33 + input.charCodeAt(i)) % 2147483647;
  }
  return Math.abs(hash);
}

export function generateMarksFromAI(aiScore: number, seed = ""): number {
  const safeAi = clamp(Number.isFinite(aiScore) ? aiScore : 0, 0, 100);
  const base = Math.round(safeAi / 10);
  const hash = hashSeed(`${seed}|${safeAi}`);
  const variationMagnitude = hash % 3;
  const variationDirection = hash % 2 === 0 ? 1 : -1;
  const adjusted = base + variationDirection * variationMagnitude;
  const { min, max } = rangeBounds(safeAi);
  return clamp(adjusted, min, max);
}
