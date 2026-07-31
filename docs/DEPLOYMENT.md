# Deployment & hosting

**Many Vercel URLs?** See **[VERCEL_URLS_AND_CORS.md](./VERCEL_URLS_AND_CORS.md)** (production vs preview, fix localhost + CORS).

**New to this?** Read **[UNDERSTANDING_API_AND_DEPLOYMENT.md](./UNDERSTANDING_API_AND_DEPLOYMENT.md)** first (diagram: Vercel vs API vs Supabase).

The app has **two deployable parts**:

| Part | What it is | Typical host |
|------|------------|--------------|
| **Frontend** | Vite/React static files after `npm run build` | Vercel, Netlify, Cloudflare Pages, GitHub Pages |
| **Backend** | Node `server.cjs` (Express on `PORT` / `RUNNER_PORT`, default **7001**) | Railway, Render, Fly.io, a VPS, Azure App Service |

**Supabase** is already cloud-hosted; you only configure URL + keys.

---

## 1. Before you deploy

1. **Production build works**

   ```bash
   npm run verify
   ```

2. **CORS** — The API **only allows**:
   - `http(s)://localhost` / `127.0.0.1` (any port)
   - Origins listed in **`CORS_ORIGINS`** or **`FRONTEND_URL`** (comma-separated, no trailing slash)

   Set these on the **server** environment (same place as `SUPABASE_SERVICE_ROLE_KEY`).

3. **Frontend env at build time** — Vite bakes `VITE_*` into the bundle. Set:

   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - **`VITE_MANUAL_API_URL`** = your **public API base**, e.g. `https://api.yourdomain.com` (no path; no trailing slash)

   Rebuild the frontend after changing `VITE_*`.

---

## 2. Suggested layout

- **Frontend:** `https://lab.yourdomain.com` (or `*.vercel.app`)
- **API:** `https://api.yourdomain.com` → reverse proxy to Node process, or direct Render/Railway URL

Point **`VITE_MANUAL_API_URL`** at that API origin so the browser calls `https://api.../api/gamification/...` etc.

---

## 3. Example: Vercel (frontend) + Render (API)

1. **Render** (or Railway): New **Web Service** → root `server.cjs`, start `node server.cjs`, set `PORT` from Render, env vars:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `CORS_ORIGINS=https://your-app.vercel.app`
   - (optional) `RUNNER_PORT` or use `PORT` that Render injects

2. **Vercel**: Connect repo, framework **Vite**, build `npm run build`, output `dist`, env:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MANUAL_API_URL=https://your-api.onrender.com`

3. Redeploy frontend when API URL is final.

---

## 4. Same host (optional)

You can put **Nginx** in front: serve `dist/` from `/` and `proxy_pass` `/api/` and `/run` to Node. Then you only need one public origin; set **`CORS_ORIGINS`** to that same origin (or rely on same-origin + no CORS for same host).

---

## 5. Security checklist

- [ ] **Never** put `SUPABASE_SERVICE_ROLE_KEY` in Vite env or client code.
- [ ] HTTPS everywhere in production.
- [ ] Do **not** set `CORS_ALLOW_ALL=true` unless you understand the risk (public API).

---

## 6. Docker (API image)

From the project root:

```bash
docker build -t lab-record-api .
docker run --rm -p 7001:7001 \
  -e SUPABASE_URL=... \
  -e SUPABASE_SERVICE_ROLE_KEY=... \
  -e CORS_ORIGINS=https://your-app.vercel.app \
  -e PORT=7001 \
  lab-record-api
```

The **Dockerfile** only packages the **Node API** (`server.cjs`). Build the **frontend** separately (`npm run build`) and deploy `dist/` to Vercel.

---

## 7. Render.com — API: env vars & safety

**Example (this repo):** API on Render — **`https://lab-record-system-moy2.onrender.com`** — see **[RENDER_LAB_RECORD_SYSTEM.md](./RENDER_LAB_RECORD_SYSTEM.md)** for `VITE_MANUAL_API_URL`, `CORS_ORIGINS`, and what `/` returns.

Use these on a **Web Service** that runs **`server.cjs`** (Node or Docker). **Do not** put these in Vercel (except the anon key is only for the React build).

### Required

| Key | Example / notes |
|-----|------------------|
| **`SUPABASE_URL`** | `https://xxxx.supabase.co` — same project as your app |
| **`SUPABASE_SERVICE_ROLE_KEY`** | Long secret from Supabase **Settings → API → service_role** — **server only** |
| **`CORS_ORIGINS`** | Your live site, e.g. `https://your-app.vercel.app` — **no trailing slash**. Comma-separate if you have preview + production URLs |

Render sets **`PORT`** automatically — `server.cjs` already uses `process.env.PORT` (no need to set `PORT` yourself unless debugging).

### Optional (same meaning as `.env.example`)

| Key | Purpose |
|-----|---------|
| `SUPABASE_MANUALS_BUCKET` | Default `manuals` if you use manual PDF storage |
| `MANUAL_ENABLE_PDF_OCR` | `true` / `false` |
| `ADMIN_DEPARTMENT_CATALOG` | Comma-separated department names |
| `JOBS_DIR` | e.g. `./jobs` (ensure writable on Render; ephemeral disk resets on redeploy unless you add a disk) |
| `FRONTEND_URL` | Alternative to `CORS_ORIGINS` (single origin) |
| `CORS_ALLOW_ALL` | **`true` only in emergencies** — allows any origin (unsafe for public APIs) |

### Is Render “safe”?

- **Yes** for normal use: HTTPS for your service URL, env vars stored in the **Render dashboard** (not in Git).
- **You** must: never commit **`SUPABASE_SERVICE_ROLE_KEY`**; only paste it in **Render → Environment**.
- **Service role** = full database access — treat like a root password. Same risk on **any** host (Railway, VPS, etc.), not specific to Render.

---

## 8. “Is it ready?” (deployment checklist)

**Ready to deploy** once:

- `npm run verify` passes  
- Server has **`CORS_ORIGINS`** matching your real frontend URL(s)  
- `VITE_MANUAL_API_URL` points to that deployed API  

Remaining gaps for **large-scale** production (optional later): automated tests, monitoring, rate limits, backup runbook.

See also: **Render env table** in the section above.
