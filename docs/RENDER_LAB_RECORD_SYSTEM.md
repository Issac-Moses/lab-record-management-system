# Render deployment (Node API)

Your **Node API** URL is shown on **Render → your Web Service** (example: **`https://lab-record-system-moy2.onrender.com`**). If you create a second service (e.g. `…-backend.onrender.com`), set **`VITE_MANUAL_API_URL`** in Vercel to that URL.

- **Health check:** opening `/` returns JSON like `{ "status": "Runner OK" }` — expected (API + code runner, not the Vite UI).
- **API routes:** `https://<your-service>.onrender.com/api/manual/...`, `/api/gamification/...`, `/api/admin/...`.

### CORS (required for Vercel)

If the browser shows **“No 'Access-Control-Allow-Origin' header”** for your API:

1. **Preferred:** On the **same** Render service that serves that API URL, set **`CORS_ORIGINS=https://lab-record-system.vercel.app`** (no trailing slash). Redeploy if env was added after last deploy.
2. **Fallback (code):** If `CORS_ORIGINS` is **not** set and Render injects **`RENDER=true`**, `server.cjs` now allows **`https://lab-record-system.vercel.app`** by default. Set `CORS_ORIGINS` explicitly if you use a **different** frontend domain or need multiple origins (comma-separated).

## Frontend (Vercel or elsewhere)

**Vercel builds:** If **`VITE_MANUAL_API_URL`** is not set, **`vite.config.ts`** injects **`https://lab-record-system-backend.onrender.com`** when `VERCEL=1` (production). Override in Vercel if your API host differs (e.g. `moy2`).

Build the React app with the API URL **baked in** (no trailing slash):

| Variable | Value |
|----------|--------|
| `VITE_MANUAL_API_URL` | `https://lab-record-system-backend.onrender.com` (or your Render URL) |

Also set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for **Production** (and Preview if you use previews).

**Redeploy** the frontend after changing any `VITE_*` variable.

## Render (this Web Service) — environment

In **Render → your service → Environment**, set at least:

| Key | Notes |
|-----|--------|
| `SUPABASE_URL` | Your project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** — never in Vite |
| `CORS_ORIGINS` | Comma-separated **frontend** origins, no trailing slash, e.g. `https://lab-record-system.vercel.app` |

If the browser shows **CORS blocked**, add the **exact** origin from the address bar (including preview URLs) to `CORS_ORIGINS`.

Optional: `FRONTEND_URL` as a single origin (same purpose as one entry in `CORS_ORIGINS`).

## Local `.env` (optional mirror for testing production API)

```env
# Point local Vite at the deployed API (optional)
VITE_MANUAL_API_URL=https://lab-record-system-moy2.onrender.com
```

## Same-origin note

If you later put **both** static UI and API behind one domain (reverse proxy), set `CORS_ORIGINS` to that origin and `VITE_MANUAL_API_URL` to the same origin for builds.

See also: **[DEPLOYMENT.md](./DEPLOYMENT.md)**, **[VERCEL_URLS_AND_CORS.md](./VERCEL_URLS_AND_CORS.md)**.
