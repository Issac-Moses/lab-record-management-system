from __future__ import annotations

import base64
import io
from typing import Optional

import cv2
import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="AI Proctor Detection Service", version="1.0.0")


class DetectRequest(BaseModel):
    frame: str


class DetectResponse(BaseModel):
    faces: int
    phone_detected: bool
    confidence: float
    violation: Optional[str] = None
    error: Optional[str] = None


def _decode_base64_frame(frame_data: str) -> np.ndarray:
  normalized = frame_data.split(",", 1)[1] if "," in frame_data else frame_data
  frame_bytes = base64.b64decode(normalized)
  image_array = np.frombuffer(frame_bytes, dtype=np.uint8)
  image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
  if image is None:
    raise ValueError("Unable to decode image frame.")
  return image


def _detect_faces(image: np.ndarray) -> int:
  gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
  cascade = cv2.CascadeClassifier(
      cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
  )
  faces = cascade.detectMultiScale(gray, scaleFactor=1.2, minNeighbors=5, minSize=(40, 40))
  return int(len(faces))


def _detect_phone(image: np.ndarray) -> bool:
  # Optional hook for YOLO/mobile detector.
  # Keep default safe behavior when model is unavailable.
  _ = image
  return False


def _derive_violation(face_count: int, phone_detected: bool) -> Optional[str]:
  if phone_detected:
    return "phone_detected"
  if face_count == 0:
    return "no_face"
  if face_count > 1:
    return "multiple_faces"
  return None


@app.get("/")
async def root() -> dict:
  return {"message": "AI Proctor Detection Service is running. Visit /docs for API documentation."}

@app.get("/health")
async def health() -> dict:
  return {"status": "ok"}


@app.post("/detect", response_model=DetectResponse)
async def detect(request: DetectRequest) -> DetectResponse:
  try:
    image = _decode_base64_frame(request.frame)
    face_count = _detect_faces(image)
    phone_detected = _detect_phone(image)
    violation = _derive_violation(face_count, phone_detected)
    confidence = 0.9 if violation else 0.87

    return DetectResponse(
      faces=face_count,
      phone_detected=phone_detected,
      confidence=confidence,
      violation=violation,
      error=None,
    )
  except Exception as error:
    # Defensive response: no server crash, predictable payload.
    return DetectResponse(
      faces=0,
      phone_detected=False,
      confidence=0.0,
      violation=None,
      error=str(error),
    )
