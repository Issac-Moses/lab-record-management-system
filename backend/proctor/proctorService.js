const { createClient } = require("@supabase/supabase-js");

const SCORE_WEIGHTS = {
  no_face: 2,
  multiple_faces: 3,
  phone_detected: 3,
  tab_switch: 2,
};

function getViolationIncrement(type) {
  if (!type) return 0;
  return SCORE_WEIGHTS[type] || 0;
}

function safeError(message, details = null) {
  return {
    success: false,
    message,
    error: details || "Operation failed",
    data: null,
  };
}

function safeSuccess(message, data) {
  return {
    success: true,
    message,
    error: null,
    data: data || null,
  };
}

function getSupabaseClient() {
  try {
    // Reuse backend client if project already provides one.
    try {
      const existingClientModule = require("../supabase");
      if (existingClientModule?.supabase) return existingClientModule.supabase;
      if (existingClientModule?.default) return existingClientModule.default;
      if (existingClientModule?.client) return existingClientModule.client;
    } catch (ignore) {
      // Fallback to env-based initialization if no backend module exists.
    }

    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || null;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      null;

    if (!url || !key) {
      return null;
    }

    return createClient(url, key);
  } catch (error) {
    return null;
  }
}

async function startSession(studentId, examId) {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return safeError("Unable to initialize proctor service", "Supabase configuration missing");
    }

    const { data, error } = await supabase
      .from("exam_sessions")
      .insert({
        student_id: studentId || null,
        exam_id: examId || null,
        status: "active",
        suspicion_score: 0,
      })
      .select("*")
      .single();

    if (error) {
      return safeError("Failed to start session", error.message);
    }

    return safeSuccess("Session started", data);
  } catch (error) {
    return safeError("Failed to start session", error?.message || "Unexpected error");
  }
}

async function endSession(sessionId, finalStatus = "completed") {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return safeError("Unable to initialize proctor service", "Supabase configuration missing");
    }

    if (!sessionId) {
      return safeError("Invalid session request", "sessionId is required");
    }

    const { data: existingSession, error: fetchError } = await supabase
      .from("exam_sessions")
      .select("id")
      .eq("id", sessionId)
      .maybeSingle();

    if (fetchError) {
      return safeError("Failed to validate session", fetchError.message);
    }
    if (!existingSession) {
      return safeError("Session not found", "No exam session exists for provided sessionId");
    }

    const { data, error } = await supabase
      .from("exam_sessions")
      .update({
        status: finalStatus || "completed",
        end_time: new Date().toISOString(),
      })
      .eq("id", sessionId)
      .select("*")
      .single();

    if (error) {
      return safeError("Failed to end session", error.message);
    }

    return safeSuccess("Session ended", data);
  } catch (error) {
    return safeError("Failed to end session", error?.message || "Unexpected error");
  }
}

async function addViolation(sessionId, type, confidence) {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return safeError("Unable to initialize proctor service", "Supabase configuration missing");
    }

    if (!sessionId) {
      return safeError("Invalid violation request", "sessionId is required");
    }

    const { data: existingSession, error: fetchError } = await supabase
      .from("exam_sessions")
      .select("id")
      .eq("id", sessionId)
      .maybeSingle();

    if (fetchError) {
      return safeError("Failed to validate session", fetchError.message);
    }
    if (!existingSession) {
      return safeError("Session not found", "No exam session exists for provided sessionId");
    }

    const safeConfidence = Number.isFinite(confidence) ? confidence : 0;
    const violationType = type || "unknown";

    const { data: violation, error: violationError } = await supabase
      .from("violations")
      .insert({
        session_id: sessionId,
        violation_type: violationType,
        confidence: safeConfidence,
      })
      .select("*")
      .single();

    if (violationError) {
      return safeError("Failed to add violation", violationError.message);
    }

    const scoreResult = await updateSuspicionScore(sessionId);
    if (!scoreResult.success) {
      return {
        success: false,
        message: "Violation added but score update failed",
        error: scoreResult.error,
        data: { violation, session: null },
      };
    }

    return safeSuccess("Violation added", {
      violation,
      session: scoreResult.data,
    });
  } catch (error) {
    return safeError("Failed to add violation", error?.message || "Unexpected error");
  }
}

async function updateSuspicionScore(sessionId) {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return safeError("Unable to initialize proctor service", "Supabase configuration missing");
    }

    if (!sessionId) {
      return safeError("Invalid score update request", "sessionId is required");
    }

    const { data: currentSession, error: sessionError } = await supabase
      .from("exam_sessions")
      .select("id, status, suspicion_score")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError) {
      return safeError("Failed to fetch session", sessionError.message);
    }
    if (!currentSession) {
      return safeError("Session not found", "No exam session exists for provided sessionId");
    }

    const { data: violations, error: violationError } = await supabase
      .from("violations")
      .select("violation_type")
      .eq("session_id", sessionId);

    if (violationError) {
      return safeError("Failed to fetch violations", violationError.message);
    }

    const computedScore = (violations || []).reduce((total, row) => {
      return total + getViolationIncrement(row?.violation_type);
    }, 0);

    const currentScore = Number(currentSession?.suspicion_score) || 0;
    const nextScore = Math.max(currentScore, computedScore);
    const shouldTerminate = nextScore > 8;

    const updatePayload = {
      suspicion_score: nextScore,
      status: shouldTerminate ? "terminated" : currentSession.status || "active",
      end_time: shouldTerminate ? new Date().toISOString() : null,
    };

    const { data: updatedSession, error: updateError } = await supabase
      .from("exam_sessions")
      .update(updatePayload)
      .eq("id", sessionId)
      .select("*")
      .single();

    if (updateError) {
      return safeError("Failed to update suspicion score", updateError.message);
    }

    return safeSuccess("Suspicion score updated", updatedSession);
  } catch (error) {
    return safeError("Failed to update suspicion score", error?.message || "Unexpected error");
  }
}

module.exports = {
  startSession,
  endSession,
  addViolation,
  updateSuspicionScore,
};
