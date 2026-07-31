# Step by step — what to do now

Follow in order. **Skip sections** you already finished.

---

## Part A — Run locally (same as before)

1. **Install**
   ```bash
   cd Lab-Record-system
   npm install
   ```

2. **Environment**
   - Copy `.env.example` → `.env`
   - Fill in from Supabase **Project Settings → API**:
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_ANON_KEY`
     - `SUPABASE_URL` (same project URL)
     - `SUPABASE_SERVICE_ROLE_KEY` (**server only**, never commit)
   - Set `VITE_MANUAL_API_URL=http://localhost:7001` for local dev

3. **Supabase SQL (once per project)**  
   Run in Supabase **SQL Editor** as needed:
   - Your core tables / migrations
   - Optional: `docs/gamification-full-install.sql` for XP/leaderboard

4. **Two terminals**
   - Terminal 1: `npm run dev` → opens Vite (e.g. http://localhost:5173)
   - Terminal 2: `npm run backend:start` → API on http://localhost:7001

5. **Check**
   - Open the app, log in, click a flow that uses gamification or admin API
   - Run `npm run verify` — build must succeed

---

## Part B — Deploy the API (Docker / cloud)

Do this **before** you point the live website at production (or use a temporary URL and update later).

1. **Pick a host** that runs Docker or Node (examples: **Railway**, **Render**, **Fly.io**, **Google Cloud Run**).

2. **Build the API image** (on your PC, to test):
   ```bash
   docker build -t lab-record-api .
   ```

3. **On the host**, create a new service:
   - **Deploy from** this repo’s `Dockerfile`, **or** push the image to a registry and deploy it.

4. **Set environment variables** on that service (not in Vercel for the service key):
   | Variable | Value |
   |----------|--------|
   | `SUPABASE_URL` | Same as in your `.env` |
   | `SUPABASE_SERVICE_ROLE_KEY` | Same as local `.env` |
   | `PORT` | Often auto-set (e.g. `7001` or platform default) |
   | `CORS_ORIGINS` | **Leave empty until Part C step 4**, then set your Vercel URL |

5. **Get the public HTTPS URL** of the API, e.g.  
   `https://lab-api.onrender.com`  
   Test in browser: `https://YOUR-API-URL/` → should show JSON like `{ "status": "Runner OK" }` (or similar).

---

## Part C — Deploy the website (Vercel)

1. **Push code** to GitHub/GitLab (no `.env` in repo).

2. **Vercel** → New Project → import repo.

3. **Framework:** Vite  
   - **Build command:** `npm run build`  
   - **Output directory:** `dist`

4. **Environment variables** in Vercel (Production + Preview):
   | Variable | Value |
   |----------|--------|
   | `VITE_SUPABASE_URL` | Same as local |
   | `VITE_SUPABASE_ANON_KEY` | Same as local |
   | `VITE_MANUAL_API_URL` | **`https://YOUR-API-URL`** from Part B step 5 — **no trailing slash** |

5. **Deploy** — note your site URL, e.g. `https://your-app.vercel.app`

6. **Go back to the API host** → set:
   ```text
   CORS_ORIGINS=https://your-app.vercel.app
   ```
   If you use Preview deployments too, add both URLs comma-separated:
   ```text
   CORS_ORIGINS=https://your-app.vercel.app,https://your-app-git-branch.vercel.app
   ```
   **Redeploy / restart** the API service.

7. **Redeploy Vercel** if you changed any `VITE_*` variable (they are baked in at build time).

---

## Part D — Final checks

- [ ] Open live site → login → student / faculty / admin flows you need for demo  
- [ ] Browser **Network** tab: calls to `VITE_MANUAL_API_URL` return **200**, not **CORS error**  
- [ ] Service role key exists **only** on API server, not in Vercel (except anon + URL for Supabase)

---

## If something fails

| Symptom | What to check |
|---------|----------------|
| CORS error in browser | `CORS_ORIGINS` on API = exact Vercel URL (https, no trailing slash) |
| API calls go to localhost | `VITE_MANUAL_API_URL` in **Vercel** = production API URL; **rebuild** |
| 401 on `/api/admin` | User logged in; token sent; API can reach Supabase |
| Gamification empty | API running; gamification SQL applied; `SUPABASE_SERVICE_ROLE_KEY` on API |

---

## Short memory aid

| Where | What you set |
|--------|----------------|
| **Vercel** | `VITE_*` only (anon key + URLs). **Never** service role. |
| **API server** | `SUPABASE_SERVICE_ROLE_KEY` + `CORS_ORIGINS` |
| **Supabase** | Same project for everyone |

More detail: [UNDERSTANDING_API_AND_DEPLOYMENT.md](./UNDERSTANDING_API_AND_DEPLOYMENT.md) · [DEPLOYMENT.md](./DEPLOYMENT.md)
