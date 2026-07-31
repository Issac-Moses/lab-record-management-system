import { describe, it, expect } from "vitest";
import {
  computeExamPhase,
  computeStudentExamDeadlineMs,
  parseEffectiveEndMs,
  parseStartMs,
} from "@/lib/examWindow";

describe("examWindow", () => {
  it("parseStartMs rejects invalid", () => {
    expect(parseStartMs(null)).toBeNull();
    expect(parseStartMs("")).toBeNull();
    expect(parseStartMs("not-a-date")).toBeNull();
  });

  it("parseEffectiveEndMs prefers valid end_time over duration", () => {
    const start = "2026-01-01T10:00:00.000Z";
    const end = "2026-01-01T11:00:00.000Z";
    expect(
      parseEffectiveEndMs({
        start_time: start,
        end_time: end,
        duration_minutes: 180,
      })
    ).toBe(new Date(end).getTime());
  });

  it("parseEffectiveEndMs uses start + duration when end missing", () => {
    const start = "2026-01-01T10:00:00.000Z";
    const dm = 45;
    const expected = new Date(start).getTime() + dm * 60 * 1000;
    expect(
      parseEffectiveEndMs({
        start_time: start,
        end_time: null,
        duration_minutes: dm,
      })
    ).toBe(expected);
  });

  it("computeExamPhase active inside window", () => {
    const start = "2026-06-01T10:00:00.000Z";
    const end = "2026-06-01T12:00:00.000Z";
    const mid = new Date("2026-06-01T11:00:00.000Z").getTime();
    expect(computeExamPhase(mid, { start_time: start, end_time: end, duration_minutes: null })).toBe(
      "active"
    );
  });

  it("computeExamPhase draft when schedule incomplete", () => {
    const now = Date.now();
    expect(computeExamPhase(now, { start_time: null, end_time: null, duration_minutes: 60 })).toBe(
      "draft"
    );
  });

  it("computeStudentExamDeadlineMs uses min(end, duration) when both set", () => {
    const start = "2026-01-01T10:00:00.000Z";
    const startMs = new Date(start).getTime();
    const endMs = startMs + 120 * 60 * 1000;
    const endIso = new Date(endMs).toISOString();
    const deadline = computeStudentExamDeadlineMs({
      start_time: start,
      end_time: endIso,
      duration_minutes: 30,
    });
    expect(deadline).toBe(startMs + 30 * 60 * 1000);
  });

  it("computeStudentExamDeadlineMs no longer floors to 2 hours for short exams", () => {
    const start = "2026-01-01T10:00:00.000Z";
    const startMs = new Date(start).getTime();
    const deadline = computeStudentExamDeadlineMs({
      start_time: start,
      end_time: null,
      duration_minutes: 15,
    });
    expect(deadline).toBe(startMs + 15 * 60 * 1000);
  });
});
