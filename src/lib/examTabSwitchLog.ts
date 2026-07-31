import { supabase } from "@/lib/supabase";

/**
 * Records a tab-switch / visibility loss for faculty exam monitoring.
 * Writes to `exam_activity_logs` (event: tab_switch) — the table faculty UIs aggregate.
 */
export type ExamTabSwitchOptions = {
  examId?: string | null;
  registerNo?: string | null;
  reason?: string | null;
};

/**
 * Records a tab-switch / visibility loss for faculty exam monitoring.
 * Supports both object options `{ examId, registerNo, reason }` and positional arguments `(examId, registerNo, reason)`.
 * Writes to `exam_activity_logs` (event: tab_switch) — the table faculty UIs aggregate.
 */
export async function logExamTabSwitchEvent(
  examIdOrOptions: string | ExamTabSwitchOptions | null | undefined,
  registerNo?: string | null,
  reason?: string | null
): Promise<void> {
  let eid = "";
  let reg = "";
  let rsn = "Tab switch / window hidden";

  if (typeof examIdOrOptions === "object" && examIdOrOptions !== null) {
    eid = String(examIdOrOptions.examId || "").trim();
    reg = String(examIdOrOptions.registerNo || "").trim();
    if (examIdOrOptions.reason) rsn = String(examIdOrOptions.reason).trim();
  } else {
    eid = typeof examIdOrOptions === "string" ? examIdOrOptions.trim() : "";
    reg = typeof registerNo === "string" ? registerNo.trim() : "";
    if (reason) rsn = String(reason).trim();
  }

  if (!eid || !reg) return;

  // 1. Post to backend Service Role endpoint (Bypasses RLS guaranteed)
  try {
    const MANUAL_API_BASE_URL = import.meta.env.VITE_MANUAL_API_URL || "http://localhost:7001";
    await fetch(`${MANUAL_API_BASE_URL}/api/manual/exam-activity-log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exam_id: eid,
        register_no: reg,
        event: "tab_switch",
        details: rsn,
      }),
    });
  } catch (_err) {
    // ignore backend network error
  }

  // 2. Insert into Supabase client in parallel
  try {
    await supabase.from("exam_activity_logs").insert({
      exam_id: eid,
      register_no: reg,
      event: "tab_switch",
      details: rsn,
    });

    await supabase.from("violations").insert({
      session_id: eid,
      violation_type: "tab_switch",
      details: `${reg}: ${rsn}`,
    });
  } catch {
    // ignore RLS or network errors
  }
}
