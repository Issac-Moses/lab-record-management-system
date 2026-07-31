type SemanticContent = {
  aim?: string | null;
  procedure?: string | null;
  program?: string | null;
  output?: string | null;
  result?: string | null;
};

const keywords = {
  aim: ["objective", "implement", "aim", "develop", "demonstrate"],
  algorithm: ["step", "initialize", "loop", "input", "output"],
  program: ["for", "if", "function", "return", "print"],
  output: ["result", "output", "value", "graph"],
  result: ["thus", "conclude", "success", "verified"],
} as const;

function toText(value: unknown): string {
  return String(value || "").toLowerCase();
}

export function semanticScore(text: string, sectionKeywords: string[]): number {
  if (!text) return 0;
  if (!Array.isArray(sectionKeywords) || sectionKeywords.length === 0) return 0;

  const source = toText(text);
  let score = 0;
  sectionKeywords.forEach((item) => {
    if (source.includes(String(item || "").toLowerCase())) {
      score += 1;
    }
  });

  return Math.min(score / sectionKeywords.length, 1);
}

export function evaluateSemantic(content: SemanticContent = {}) {
  const aim = semanticScore(String(content.aim || ""), [...keywords.aim]);
  const algo = semanticScore(String(content.procedure || ""), [...keywords.algorithm]);
  const prog = semanticScore(String(content.program || ""), [...keywords.program]);
  const out = semanticScore(String(content.output || ""), [...keywords.output]);
  const res = semanticScore(String(content.result || ""), [...keywords.result]);

  const total = aim * 1 + algo * 2 + prog * 4 + out * 2 + res * 1;

  return {
    total: Number(total.toFixed(2)),
    breakdown: {
      aim: Math.round(aim * 100),
      algorithm: Math.round(algo * 100),
      program: Math.round(prog * 100),
      output: Math.round(out * 100),
      result: Math.round(res * 100),
    },
  };
}

export type { SemanticContent };
