# Understanding the API & deployment (simple)

## Three pieces (not one “Vercel app”)

```
┌─────────────┐     HTTPS      ┌──────────────────┐     HTTPS      ┌─────────────┐
│   Browser   │ ─────────────► │  Your React app  │              │  Supabase   │
│  (students) │                │  (static files)  │              │   (cloud)   │
└─────────────┘                └────────┬─────────┘              └──────▲──────┘
       │                                │                               │
       │                                │                               │
       │         HTTPS (API calls)      │                               │
       └────────────────────────────────┼───────────────────────────────┘
                                        │
                                        ▼
                               ┌──────────────────┐
                               │  Node API        │
                               │  server.cjs      │
                               │  (Express)       │
                               └──────────────────┘
```

| Piece | What it is | Typical host |
|--------|------------|--------------|
| **A. React UI** | `npm run build` → `dist/` folder | **Vercel** ✅ (perfect for this) |
| **B. Backend API** | `server.cjs` — Express, `/api/manual`, `/api/gamification`, `/api/admin`, code runner | **Not** classic Vercel for this repo — use **Docker** (Railway, Fly, Render, VPS, Cloud Run) |
| **C. Database** | Auth + Postgres + Storage | **Supabase** (already hosted) |

**Important:** On **localhost** you run two processes: `npm run dev` (UI) + `npm run backend:start` (API).  
After deploy, **same idea**: website on **Vercel**, API on **another URL** (your Docker host).

---

## What “the API” does

The browser only talks to Supabase **directly** for some things (login, some tables).  
For **gamification**, **manual uploads**, **admin dashboard summary**, etc., the frontend calls:

`VITE_MANUAL_API_URL` + path, e.g.:

- `https://YOUR-API-HOST/api/gamification/leaderboard`
- `https://YOUR-API-HOST/api/admin/dashboard-summary`

That **Node server** uses **`SUPABASE_SERVICE_ROLE_KEY`** (secret, server-only) to bypass RLS where needed.

So: **API = your Express server**, not “another Supabase”.

---

## Can the API run on Vercel?

**This project uses one long-running Express server** (`server.cjs`) with file uploads, jobs folder, etc.

- **Vercel** is great for **static** sites and **serverless** functions.
- Running **this exact** `server.cjs` unchanged on Vercel is **awkward** (you’d need to split every route into serverless functions—big rewrite).

**Practical recommendation:**  
✅ **Vercel** = only the **React build** (`dist`).  
✅ **API** = deploy with **Docker** (or Railway/Render without Docker) on a **separate URL**.

---

## What you should do now (step by step)

### 1) Deploy the **frontend** on Vercel (you may already have this)

- Build command: `npm run build`
- Output directory: `dist`
- Environment variables (Vercel → Project → Settings → Environment Variables):

  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - **`VITE_MANUAL_API_URL`** = `https://YOUR-API-PUBLIC-URL`  
    (no trailing slash — same as `http://localhost:7001` but **production**)

Redeploy after changing `VITE_*`.

### 2) Deploy the **API** on a Docker-friendly host

Examples: **Railway**, **Render**, **Fly.io**, **Google Cloud Run**, **Docker on a VPS**.

- **Dockerfile** (see repo root) builds an image that runs `node server.cjs`.
- Set env on that service:

  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `PORT` (often set automatically by the platform)
  - **`CORS_ORIGINS`** = your Vercel site, e.g. `https://your-app.vercel.app`  
    (comma-separated if you have preview + production URLs)

### 3) Connect them

1. Note the **public URL** of the API (e.g. `https://lab-api.onrender.com`).
2. Put that URL in **Vercel** as `VITE_MANUAL_API_URL` and **rebuild** the frontend.
3. Put your **Vercel URL** in the API’s **`CORS_ORIGINS`**.

---

## Quick mental model

| Local | Production |
|--------|------------|
| `http://localhost:5173` | `https://your-app.vercel.app` (React) |
| `http://localhost:7001` | `https://your-api.example.com` (Docker / Node) |
| Supabase project URL | Same Supabase project |

---

## “Correct option” for this project (opinion)

**Best fit:**  
**Vercel (frontend only) + Dockerized API on Railway/Render/Fly/Cloud Run + Supabase.**

That matches how the repo is written and avoids rewriting the backend for serverless.

If you truly want **everything on one provider**, you’d need a **VPS** or **container** that runs **both** Nginx + static `dist` + Node — possible, but more DevOps work.

---

See also: [DEPLOYMENT.md](./DEPLOYMENT.md).
