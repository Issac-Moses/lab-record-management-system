import { describe, it, expect } from "vitest";
import {
  accumulateExamSubmissionRow,
  createEmptyExamMarksAccumulator,
} from "@/lib/aggregateSubmissionMarks";

describe("aggregateSubmissionMarks", () => {
  it("counts every submission row", () => {
    let agg = createEmptyExamMarksAccumulator();
    agg = accumulateExamSubmissionRow(agg, null);
    agg = accumulateExamSubmissionRow(agg, undefined);
    expect(agg.submissions).toBe(2);
    expect(agg.marksCount).toBe(0);
  });

  it("accepts numeric marks as number", () => {
    let agg = createEmptyExamMarksAccumulator();
    agg = accumulateExamSubmissionRow(agg, 8.5);
    expect(agg.marksCount).toBe(1);
    expect(agg.marksTotal).toBe(8.5);
  });

  it("accepts numeric marks as string", () => {
    let agg = createEmptyExamMarksAccumulator();
    agg = accumulateExamSubmissionRow(agg, "7.25");
    expect(agg.marksCount).toBe(1);
    expect(agg.marksTotal).toBeCloseTo(7.25);
  });

  it("ignores non-finite marks", () => {
    let agg = createEmptyExamMarksAccumulator();
    agg = accumulateExamSubmissionRow(agg, "x");
    agg = accumulateExamSubmissionRow(agg, Number.NaN);
    expect(agg.submissions).toBe(2);
    expect(agg.marksCount).toBe(0);
  });
});
