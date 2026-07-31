export type AiEvaluationResult = {
  predicted_score: number;
  confidence: number;
  status: string;
  breakdown: Record<string, number>;
};

export function evaluateSubmission(submission?: {
  aim?: string;
  algorithm?: string;
  program?: string;
  output?: string;
  result?: string;
}): AiEvaluationResult;
