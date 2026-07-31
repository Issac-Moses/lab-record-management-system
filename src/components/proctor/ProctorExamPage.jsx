import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import StudentExam from "@/pages/Exam/StudentExam";
import { supabase } from "@/lib/supabase";
import ProctorStatusPanel from "./ProctorStatusPanel";
import useProctor, { getViolationScore } from "./useProctor";

export default function ProctorExamPage() {
  const { id: examIdParam } = useParams();
  const [sessionId, setSessionId] = useState(null);
  const [backendSessionStatus, setBackendSessionStatus] = useState("active");
  const [warning, setWarning] = useState("");

  const logViolation = useCallback(
    async (violationType, confidence) => {
      try {
        if (!sessionId) return;

        const confidenceValue = Number.isFinite(confidence) ? confidence : 0;
        const nowIso = new Date().toISOString();
        const increment = getViolationScore(violationType);

        const { error: violationError } = await supabase.from("violations").insert({
          session_id: sessionId,
          violation_type: violationType,
          confidence: confidenceValue,
          timestamp: nowIso,
        });

        if (violationError) {
          return;
        }

        const { data: currentSession } = await supabase
          .from("exam_sessions")
          .select("suspicion_score, status")
          .eq("id", sessionId)
          .maybeSingle();

        const existingScore = Number(currentSession?.suspicion_score) || 0;
        const nextScore = existingScore + increment;
        const nextStatus = nextScore > 8 ? "terminated" : currentSession?.status || "active";

        const updatePayload = {
          suspicion_score: nextScore,
          status: nextStatus,
        };

        if (nextStatus === "terminated") {
          updatePayload.end_time = nowIso;
          setWarning("Session terminated due to high suspicion score.");
        }

        const { error: updateError } = await supabase
          .from("exam_sessions")
          .update(updatePayload)
          .eq("id", sessionId);

        if (!updateError) {
          setBackendSessionStatus(nextStatus);
        }
      } catch (error) {
        // Silent failure to avoid interrupting exam flow.
      }
    },
    [sessionId]
  );

  const {
    videoRef,
    canvasRef,
    cameraStatus,
    detectorStatus,
    suspicionScore,
    sessionStatus,
    setSessionStatus,
    lastWarning,
    startCamera,
    stopCamera,
    applyViolationLocally,
  } = useProctor({
    active: backendSessionStatus === "active",
    captureIntervalMs: 3000,
    onViolation: logViolation,
  });

  useEffect(() => {
    if (examIdParam) {
      localStorage.setItem("exam_id", examIdParam);
    }
  }, [examIdParam]);

  useEffect(() => {
    const startSession = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const studentId =
          data?.user?.id || localStorage.getItem("exam_register_no") || "unknown_student";
        const examId = examIdParam || localStorage.getItem("exam_id") || "";

        const { data: createdSession, error } = await supabase
          .from("exam_sessions")
          .insert({
            student_id: studentId,
            exam_id: examId,
            start_time: new Date().toISOString(),
            status: "active",
            suspicion_score: 0,
          })
          .select("id, status")
          .maybeSingle();

        if (error || !createdSession) {
          setWarning("Proctor session could not be created. Exam continues.");
          return;
        }

        setSessionId(createdSession.id);
        setBackendSessionStatus(createdSession.status || "active");
      } catch (error) {
        setWarning("Proctor session startup failed. Exam continues.");
      }
    };

    void startSession();
  }, [examIdParam]);

  useEffect(() => {
    const initCamera = async () => {
      try {
        await startCamera();
      } catch (error) {
        setWarning("Camera initialization failed. Exam continues.");
      }
    };

    void initCamera();
  }, [startCamera]);

  useEffect(() => {
    if (backendSessionStatus !== "active") return undefined;

    const onVisibilityChange = () => {
      try {
        if (document.hidden) {
          applyViolationLocally("tab_switch", "Tab switch detected.");
          void logViolation("tab_switch", 1.0);
        }
      } catch (error) {
        // Keep exam uninterrupted.
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [applyViolationLocally, backendSessionStatus, logViolation]);

  useEffect(() => {
    if (sessionStatus === "terminated") {
      setBackendSessionStatus("terminated");
      void (async () => {
        try {
          if (!sessionId) return;
          await supabase
            .from("exam_sessions")
            .update({
              status: "terminated",
              end_time: new Date().toISOString(),
            })
            .eq("id", sessionId);
        } catch (error) {
          // Ignore to keep exam functional.
        }
      })();
    }
  }, [sessionId, sessionStatus]);

  useEffect(() => {
    return () => {
      void (async () => {
        try {
          stopCamera();
          setSessionStatus("completed");
          if (!sessionId) return;
          await supabase
            .from("exam_sessions")
            .update({
              status: backendSessionStatus === "terminated" ? "terminated" : "completed",
              end_time: new Date().toISOString(),
            })
            .eq("id", sessionId);
        } catch (error) {
          // Ignore to avoid UI errors during unmount.
        }
      })();
    };
  }, [backendSessionStatus, sessionId, setSessionStatus, stopCamera]);

  return (
    <div className="min-h-screen bg-slate-100 p-3 sm:p-4">
      <ProctorStatusPanel
        suspicionScore={suspicionScore}
        sessionStatus={backendSessionStatus}
        cameraStatus={cameraStatus}
        detectorStatus={detectorStatus}
        warning={warning || lastWarning}
      />

      {/* Hidden camera capture element (used by proctor detector, not shown in UI) */}
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />
      <canvas ref={canvasRef} className="hidden" />

      <StudentExam />
    </div>
  );
}
