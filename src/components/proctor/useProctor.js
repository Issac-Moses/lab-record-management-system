import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const VIOLATION_SCORES = {
  no_face: 2,
  multiple_faces: 3,
  phone_detected: 3,
  tab_switch: 2,
};

function getApiBaseUrl() {
  return import.meta.env.VITE_PROCTOR_API_URL || "http://127.0.0.1:8001";
}

export function getViolationScore(type) {
  return VIOLATION_SCORES[type] || 0;
}

export default function useProctor({
  active = false,
  captureIntervalMs = 3000,
  onViolation,
} = {}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const [cameraStatus, setCameraStatus] = useState("idle");
  const [detectorStatus, setDetectorStatus] = useState("idle");
  const [suspicionScore, setSuspicionScore] = useState(0);
  const [sessionStatus, setSessionStatus] = useState("active");
  const [lastWarning, setLastWarning] = useState("");
  const [detectorFailures, setDetectorFailures] = useState(0);

  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);

  const stopCamera = useCallback(() => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      streamRef.current = null;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    } catch (error) {
      console.error("Failed to stop camera:", error);
    }
  }, []);

  const startCamera = useCallback(async () => {
    try {
      setCameraStatus("requesting");
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 360, facingMode: "user" },
        audio: false,
      });

      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraStatus("ready");
      return { ok: true };
    } catch (error) {
      setCameraStatus("denied");
      setLastWarning("Camera access denied. Exam continues with limited proctoring.");
      return { ok: false, error };
    }
  }, []);

  const captureFrame = useCallback(() => {
    try {
      const video = videoRef.current;
      if (!video || !canvasRef.current || !streamRef.current) return null;

      const canvas = canvasRef.current;
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 360;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      ctx.drawImage(video, 0, 0, width, height);
      return canvas.toDataURL("image/jpeg", 0.6);
    } catch (error) {
      return null;
    }
  }, []);

  const detectFrame = useCallback(async () => {
    try {
      const frame = captureFrame();
      if (!frame) return null;

      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(`${apiBaseUrl}/detect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ frame }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Detector response ${response.status}`);
        }

        const data = await response.json();
        setDetectorStatus("online");
        setDetectorFailures(0);

        if (data?.violation) {
          const increment = getViolationScore(data.violation);
          setSuspicionScore((prev) => {
            const next = prev + increment;
            if (next > 8) setSessionStatus("terminated");
            return next;
          });
          setLastWarning(`Violation detected: ${data.violation}`);

          if (typeof onViolation === "function") {
            await onViolation(data.violation, Number(data.confidence) || 0);
          }
        }

        return data;
      } finally {
        window.clearTimeout(timer);
      }
    } catch (error) {
      setDetectorStatus("offline");
      setDetectorFailures((prev) => {
        const next = prev + 1;
        if (next === 1 || next % 5 === 0) {
          setLastWarning(
            `AI detector offline. Start proctor API at ${apiBaseUrl} (endpoint: /detect).`
          );
        }
        return next;
      });
      return null;
    }
  }, [apiBaseUrl, captureFrame, onViolation]);

  const applyViolationLocally = useCallback((type, message) => {
    const increment = getViolationScore(type);
    setSuspicionScore((prev) => {
      const next = prev + increment;
      if (next > 8) setSessionStatus("terminated");
      return next;
    });
    if (message) {
      setLastWarning(message);
    }
  }, []);

  useEffect(() => {
    if (!active || sessionStatus !== "active") return undefined;
    intervalRef.current = window.setInterval(() => {
      void detectFrame();
    }, captureIntervalMs);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [active, captureIntervalMs, detectFrame, sessionStatus]);

  useEffect(() => {
    return () => {
      stopCamera();
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, [stopCamera]);

  return {
    videoRef,
    canvasRef,
    cameraStatus,
    detectorStatus,
    suspicionScore,
    sessionStatus,
    lastWarning,
    setSessionStatus,
    startCamera,
    stopCamera,
    detectFrame,
    applyViolationLocally,
  };
}
