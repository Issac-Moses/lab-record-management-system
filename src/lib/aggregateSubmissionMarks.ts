/**
 * Pure aggregation for exam submission marks (faculty dashboard averages).
 * Keeps string/number marks handling in one place for tests and consistency.
 */
export type ExamMarksAccumulator = {
  submissions: number;
  marksTotal: number;
  marksCount: number;
};

export function createEmptyExamMarksAccumulator(): ExamMarksAccumulator {
  return { submissions: 0, marksTotal: 0, marksCount: 0 };
}

/** Count one submission row; include marks in average only when numeric. */
export function accumulateExamSubmissionRow(
  agg: ExamMarksAccumulator,
  marks: unknown
): ExamMarksAccumulator {
  const next: ExamMarksAccumulator = {
    submissions: agg.submissions + 1,
    marksTotal: agg.marksTotal,
    marksCount: agg.marksCount,
  };
  if (marks === null || marks === undefined) {
    return next;
  }
  const num = typeof marks === "number" ? marks : Number(marks);
  if (Number.isFinite(num)) {
    next.marksTotal += num;
    next.marksCount += 1;
  }
  return next;
}
