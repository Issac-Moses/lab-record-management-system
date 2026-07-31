/**
 * Shared exam schedule parsing (join gate, student timer, faculty status/timeline).
 * Root cause fixes: null/invalid `end_time` must not use Date(null) epoch; duration must not be floored to 2h minimum.
 */

export type ExamScheduleInput = {
  start_time?: string | null;
  end_time?: string | null;
  duration_minutes?: number | null;
};

export function parseStartMs(start_time?: string | null): number | null {
  if (!start_time) return null;
  const t = new Date(start_time).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Single end instant: explicit `end_time`, else `start_time` + `duration_minutes` when both valid. */
export function parseEffectiveEndMs(input: ExamScheduleInput): number | null {
  if (input.end_time) {
    const endMs = new Date(input.end_time).getTime();
    if (Number.isFinite(endMs)) return endMs;
  }
  const startMs = parseStartMs(input.start_time ?? null);
  const dm = Number(input.duration_minutes) || 0;
  if (startMs != null && dm > 0) return startMs + dm * 60 * 1000;
  return null;
}

export type ExamPhase = "draft" | "scheduled" | "active" | "completed";

export function computeExamPhase(nowMs: number, input: ExamScheduleInput): ExamPhase {
  const startMs = parseStartMs(input.start_time ?? null);
  const endMs = parseEffectiveEndMs(input);
  if (startMs == null || endMs == null) return "draft";
  if (nowMs < startMs) return "scheduled";
  if (nowMs > endMs) return "completed";
  return "active";
}

/**
 * Student countdown deadline: earlier of student's duration window (from session start)
 * and configured exam end_time when both exist.
 */
export function computeStudentExamDeadlineMs(
  input: ExamScheduleInput,
  studentJoinedMs?: number | null
): number {
  const joinedMs = studentJoinedMs && Number.isFinite(studentJoinedMs)
    ? studentJoinedMs
    : (parseStartMs(input.start_time ?? null) ?? Date.now());
  const durMin = Number(input.duration_minutes) || 0;
  const fromDuration = durMin > 0 ? joinedMs + durMin * 60 * 1000 : null;
  let fromEnd: number | null = null;
  if (input.end_time) {
    const t = new Date(input.end_time).getTime();
    fromEnd = Number.isFinite(t) ? t : null;
  }
  if (fromEnd != null && fromDuration != null) return Math.min(fromEnd, fromDuration);
  if (fromEnd != null) return fromEnd;
  if (fromDuration != null) return fromDuration;
  return joinedMs + 60 * 60 * 1000;
}
