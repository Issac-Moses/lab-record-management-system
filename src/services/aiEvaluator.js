const SECTION_WEIGHTS = {
  algorithm: 20,
  program: 30,
  output: 20,
  result: 10,
  clarity: 20,
};

const REQUIRED_FIELDS = ["aim", "algorithm", "program", "output", "result"];

function normalizeText(value) {
  return String(value || "").trim();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function scoreByLength(text, maxScore, thresholds) {
  const length = normalizeText(text).length;
  const minThreshold = Math.max(1, Number(thresholds?.min || 1));
  const strongThreshold = Math.max(minThreshold, Number(thresholds?.strong || minThreshold));
  const excellentThreshold = Math.max(strongThreshold, Number(thresholds?.excellent || strongThreshold));

  if (length <= 0) return 0;
  if (length <= minThreshold) return Math.round(maxScore * 0.2);
  if (length <= strongThreshold) return Math.round(maxScore * 0.6);
  if (length <= excellentThreshold) return Math.round(maxScore * 0.85);
  return maxScore;
}

function hasStepPattern(text) {
  return /(^|\n)\s*(\d+[\).\s]|[-*]\s+)/.test(String(text || ""));
}

function hasProgramSyntaxSignals(text) {
  return /[{}();]|def\s+\w+\s*\(|function\s+\w+\s*\(|class\s+\w+|#include|public\s+class|console\.log|print\s*\(|SELECT\s+/i.test(
    String(text || "")
  );
}

function hasExplanationSignals(text) {
  return /\b(observe|observed|therefore|hence|conclude|conclusion|result|analysis|because)\b/i.test(
    String(text || "")
  );
}

function calculateAlgorithmScore(algorithm) {
  const text = normalizeText(algorithm);
  if (!text) return 0;
  let score = scoreByLength(text, 12, { min: 40, strong: 140, excellent: 240 });
  if (hasStepPattern(text)) score += 4;
  if (/\b(step|initialize|input|process|loop|if|else|return|end)\b/i.test(text)) score += 4;
  return clamp(score, 0, SECTION_WEIGHTS.algorithm);
}

function calculateProgramScore(program) {
  const text = normalizeText(program);
  if (!text) return 0;
  let score = scoreByLength(text, 15, { min: 80, strong: 260, excellent: 520 });
  if (hasProgramSyntaxSignals(text)) score += 10;

  const openBraces = (text.match(/\{/g) || []).length;
  const closeBraces = (text.match(/\}/g) || []).length;
  const openParen = (text.match(/\(/g) || []).length;
  const closeParen = (text.match(/\)/g) || []).length;
  const structureBalance =
    Math.abs(openBraces - closeBraces) <= 1 && Math.abs(openParen - closeParen) <= 1;
  if (structureBalance) score += 5;

  return clamp(score, 0, SECTION_WEIGHTS.program);
}

function calculateOutputScore(output) {
  const text = normalizeText(output);
  if (!text) return 0;
  let score = scoreByLength(text, 14, { min: 25, strong: 90, excellent: 180 });
  if (/\b(output|result|success|error|table|graph|value|screen|screenshot)\b/i.test(text)) score += 6;
  return clamp(score, 0, SECTION_WEIGHTS.output);
}

function calculateResultScore(result) {
  const text = normalizeText(result);
  if (!text) return 0;
  let score = scoreByLength(text, 6, { min: 20, strong: 70, excellent: 140 });
  if (hasExplanationSignals(text)) score += 4;
  return clamp(score, 0, SECTION_WEIGHTS.result);
}

function calculateClarityScore(submission) {
  const sections = [
    normalizeText(submission.aim),
    normalizeText(submission.algorithm),
    normalizeText(submission.program),
    normalizeText(submission.output),
    normalizeText(submission.result),
  ];

  const presentSections = sections.filter(Boolean);
  if (presentSections.length === 0) return 0;

  const avgLength =
    presentSections.reduce((total, value) => total + value.length, 0) / presentSections.length;
  const punctuationDensity = presentSections.reduce((score, value) => {
    if (/[.,:;!?]/.test(value)) return score + 1;
    return score;
  }, 0);
  const multilineSections = presentSections.reduce((score, value) => {
    if (value.includes("\n")) return score + 1;
    return score;
  }, 0);

  let score = 0;
  if (avgLength >= 60) score += 10;
  else if (avgLength >= 30) score += 7;
  else score += 4;

  score += Math.round((punctuationDensity / presentSections.length) * 6);
  score += Math.round((multilineSections / presentSections.length) * 4);

  return clamp(score, 0, SECTION_WEIGHTS.clarity);
}

function calculateCompleteness(submission) {
  const presentCount = REQUIRED_FIELDS.reduce((count, key) => {
    return count + (normalizeText(submission[key]).length > 0 ? 1 : 0);
  }, 0);
  return Math.round((presentCount / REQUIRED_FIELDS.length) * 100);
}

function calculateStructureScorePercent(submission) {
  const sectionQuality = REQUIRED_FIELDS.map((key) => {
    const value = normalizeText(submission[key]);
    if (!value) return 0;
    if (value.length < 20) return 45;
    if (value.length < 60) return 70;
    return 100;
  });
  const total = sectionQuality.reduce((sum, score) => sum + score, 0);
  return Math.round(total / sectionQuality.length);
}

export function evaluateSubmission(submission = {}) {
  const normalized = {
    aim: normalizeText(submission.aim),
    algorithm: normalizeText(submission.algorithm),
    program: normalizeText(submission.program),
    output: normalizeText(submission.output),
    result: normalizeText(submission.result),
  };

  const algorithmScore = calculateAlgorithmScore(normalized.algorithm);
  const programScore = calculateProgramScore(normalized.program);
  const outputScore = calculateOutputScore(normalized.output);
  const resultScore = calculateResultScore(normalized.result);
  const clarityScore = calculateClarityScore(normalized);

  const predicted_score = clamp(
    algorithmScore + programScore + outputScore + resultScore + clarityScore,
    0,
    100
  );

  const completenessPercent = calculateCompleteness(normalized);
  const structureScorePercent = calculateStructureScorePercent(normalized);
  const confidence = clamp(
    Math.round(completenessPercent * 0.6 + structureScorePercent * 0.4),
    0,
    100
  );

  return {
    predicted_score,
    confidence,
    status: predicted_score >= 75 ? "Good" : "Needs Improvement",
    breakdown: {
      algorithm: Math.round((algorithmScore / SECTION_WEIGHTS.algorithm) * 100),
      program: Math.round((programScore / SECTION_WEIGHTS.program) * 100),
      output: Math.round((outputScore / SECTION_WEIGHTS.output) * 100),
      result: Math.round((resultScore / SECTION_WEIGHTS.result) * 100),
      clarity: Math.round((clarityScore / SECTION_WEIGHTS.clarity) * 100),
    },
  };
}

