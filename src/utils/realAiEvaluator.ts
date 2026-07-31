type SubmissionContent = {
  aim?: string | null;
  procedure?: string | null;
  program?: string | null;
  output?: string | null;
  result?: string | null;
};

type ConfidenceLabel = "high" | "medium" | "low";

type RealAiEvaluation = {
  total: number; // 0..10
  breakdown: {
    aim: number; // 0..100
    algorithm: number; // 0..100
    program: number; // 0..100
    output: number; // 0..100
    result: number; // 0..100
  };
  confidence: ConfidenceLabel;
};

const weights = {
  aim: 1,
  algorithm: 2,
  program: 4,
  output: 2,
  result: 1,
} as const;

function toText(value: unknown): string {
  return String(value || "").trim();
}

function scoreSection(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  const length = text.length;
  if (length < 50) return 0.3;
  if (length < 150) return 0.6;
  if (length < 300) return 0.8;
  return 1;
}

function scoreProgram(code: string): number {
  if (!code) return 0;
  const normalized = String(code);
  let score = 0;
  if (normalized.includes("for") || normalized.includes("while")) score += 0.2;
  if (normalized.includes("if")) score += 0.2;
  if (normalized.includes("function") || normalized.includes("def")) score += 0.2;
  if (normalized.length > 200) score += 0.4;
  return Math.min(score, 1);
}

export function evaluateSubmission(content: SubmissionContent = {}): RealAiEvaluation {
  const aim = scoreSection(toText(content.aim));
  const algo = scoreSection(toText(content.procedure));
  const prog = scoreProgram(toText(content.program));
  const out = scoreSection(toText(content.output));
  const res = scoreSection(toText(content.result));

  const total =
    aim * weights.aim +
    algo * weights.algorithm +
    prog * weights.program +
    out * weights.output +
    res * weights.result;

  return {
    total: Number(total.toFixed(2)),
    breakdown: {
      aim: Math.round(aim * 100),
      algorithm: Math.round(algo * 100),
      program: Math.round(prog * 100),
      output: Math.round(out * 100),
      result: Math.round(res * 100),
    },
    confidence: total > 7 ? "high" : total > 5 ? "medium" : "low",
  };
}

export type { RealAiEvaluation, SubmissionContent, ConfidenceLabel };
