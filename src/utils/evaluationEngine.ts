import { evaluateSubmission } from "@/utils/realAiEvaluator";
import { evaluateSemantic } from "@/utils/semanticEvaluator";

type EvaluationInput = {
  aim?: string | null;
  algorithm?: string | null;
  procedure?: string | null;
  program?: string | null;
  output?: string | null;
  result?: string | null;
  rawText?: string | null;
  studentName?: string | null;
  experimentId?: string | number | null;
  autoGenerateIfEmpty?: boolean;
};

type SectionScores = {
  aim: number;
  procedure: number;
  program: number;
  output: number;
  result: number;
};

export type EvaluationResult = {
  aiScore: number; // 0..100 for legacy compatibility
  marksOutOf10: number; // 0..10
  confidence: number; // 0..100
  status: string;
  breakdown: Record<string, number>;
  sections: SectionScores;
  generatedDemo: boolean;
  manualReviewRequired: boolean;
  missingSections: string[];
  normalizedContent: {
    aim: string;
    procedure: string;
    program: string;
    output: string;
    result: string;
  };
};

const SECTION_LABELS = {
  aim: ["AIM"],
  procedure: ["PROCEDURE", "ALGORITHM"],
  program: ["PROGRAM", "SOURCE CODE", "CODE"],
  output: ["OUTPUT"],
  result: ["RESULT"],
} as const;

function toText(value: unknown): string {
  return String(value || "").trim();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function buildSectionRegex(label: string): RegExp {
  const allLabels = Object.values(SECTION_LABELS)
    .flat()
    .map((value) => value.replace(/\s+/g, "\\s*"))
    .join("|");
  const current = String(label || "").replace(/\s+/g, "\\s*");
  return new RegExp(
    `(?:^|\\n)\\s*${current}\\s*[:\\-]?\\s*([\\s\\S]*?)(?=(?:\\n\\s*(?:${allLabels})\\s*[:\\-]?)|$)`,
    "i"
  );
}

function parseSectionsFromRawText(rawText: string) {
  const source = toText(rawText);
  const sections = {
    aim: "",
    procedure: "",
    program: "",
    output: "",
    result: "",
  };
  (Object.keys(sections) as Array<keyof typeof sections>).forEach((key) => {
    const labels = SECTION_LABELS[key] || [];
    for (const label of labels) {
      const match = source.match(buildSectionRegex(label));
      const captured = toText(match?.[1] || "");
      if (captured) {
        sections[key] = captured;
        break;
      }
    }
  });
  return sections;
}

function normalizeContent(input: EvaluationInput) {
  const parsed = parseSectionsFromRawText(input.rawText || "");
  const resolved = {
    aim: toText(input.aim || parsed.aim),
    procedure: toText(input.procedure || input.algorithm || parsed.procedure),
    program: toText(input.program || parsed.program),
    output: toText(input.output || parsed.output),
    result: toText(input.result || parsed.result),
  };
  return resolved;
}

export function evaluateSubmissionContent(input: EvaluationInput = {}): EvaluationResult {
  const resolved = normalizeContent(input);

  const deterministic = evaluateSubmission({
    aim: resolved.aim,
    procedure: resolved.procedure,
    program: resolved.program,
    output: resolved.output,
    result: resolved.result,
  });
  const semantic = evaluateSemantic({
    procedure: resolved.procedure,
    program: resolved.program,
    output: resolved.output,
    result: resolved.result,
  });

  const missingSections = Object.entries(resolved)
    .filter(([, value]) => !toText(value))
    .map(([key]) => key);

  // Blend deterministic structure score + semantic keyword score.
  const marksOutOf10 = clamp(
    Math.round((Number(deterministic.total || 0) * 0.6 + Number(semantic.total || 0) * 0.4) * 10) / 10,
    0,
    10
  );
  const aiScore = clamp(Number((marksOutOf10 * 10).toFixed(2)), 0, 100);
  const mergedAim = Math.round(
    (Number(deterministic.breakdown.aim || 0) + Number(semantic.breakdown.aim || 0)) / 2
  );
  const mergedAlgorithm = Math.round(
    (Number(deterministic.breakdown.algorithm || 0) + Number(semantic.breakdown.algorithm || 0)) / 2
  );
  const mergedProgram = Math.round(
    (Number(deterministic.breakdown.program || 0) + Number(semantic.breakdown.program || 0)) / 2
  );
  const mergedOutput = Math.round(
    (Number(deterministic.breakdown.output || 0) + Number(semantic.breakdown.output || 0)) / 2
  );
  const mergedResult = Math.round(
    (Number(deterministic.breakdown.result || 0) + Number(semantic.breakdown.result || 0)) / 2
  );
  const averageSectionQuality =
    (mergedAim + mergedAlgorithm + mergedProgram + mergedOutput + mergedResult) / 5;
  const completeness = ((5 - missingSections.length) / 5) * 100;
  const confidence = clamp(
    Math.round(averageSectionQuality * 0.55 + completeness * 0.45),
    35,
    98
  );
  const status = marksOutOf10 >= 7.5 ? "Good" : marksOutOf10 >= 5.5 ? "Fair" : "Needs Improvement";

  const sections: SectionScores = {
    aim: Number(((Number(deterministic.breakdown.aim || 0) / 100) * 1).toFixed(2)),
    procedure: Number(((Number(deterministic.breakdown.algorithm || 0) / 100) * 2).toFixed(2)),
    program: Number(((Number(deterministic.breakdown.program || 0) / 100) * 4).toFixed(2)),
    output: Number(((Number(deterministic.breakdown.output || 0) / 100) * 2).toFixed(2)),
    result: Number(((Number(deterministic.breakdown.result || 0) / 100) * 1).toFixed(2)),
  };

  return {
    aiScore,
    marksOutOf10,
    confidence,
    status,
    breakdown: {
      aim: clamp(mergedAim, 0, 100),
      algorithm: clamp(mergedAlgorithm, 0, 100),
      program: clamp(mergedProgram, 0, 100),
      output: clamp(mergedOutput, 0, 100),
      result: clamp(mergedResult, 0, 100),
    },
    sections,
    generatedDemo: false,
    manualReviewRequired: missingSections.length > 0,
    missingSections,
    normalizedContent: resolved,
  };
}

