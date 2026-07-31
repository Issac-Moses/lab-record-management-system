# Proctor Detection Service

This folder contains an additive proctoring backend module and a standalone FastAPI detector endpoint.

## Files

- `proctorService.js`: session + violation scoring helpers (uses Supabase client injection).
- `aiDetectionService.py`: FastAPI service exposing `POST /detect`.
- `requirements.txt`: Python dependencies.

## Run AI detector locally

```bash
cd backend/proctor
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn aiDetectionService:app --host 0.0.0.0 --port 8001
```

## Detect API

`POST /detect`

Request body:

```json
{
  "frame": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
}
```

Response shape:

```json
{
  "faces": 1,
  "phone_detected": false,
  "confidence": 0.87,
  "violation": null,
  "error": null
}
```

If model/frame processing fails, endpoint still responds with a safe JSON payload and does not crash.
