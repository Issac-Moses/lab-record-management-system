# Which Vercel URL is “the real” one? (Production vs Preview)

**API on Render?** Use **`VITE_MANUAL_API_URL=https://lab-record-system-moy2.onrender.com`** (no slash) and add your Vercel origin(s) to **`CORS_ORIGINS`** on Render — see **[RENDER_LAB_RECORD_SYSTEM.md](./RENDER_LAB_RECORD_SYSTEM.md)**.

### Preview deployments (`…-xxxxx…vercel.app`) and CORS

Each **Preview** URL is a **different origin** than `https://lab-record-system.vercel.app`. The API (`server.cjs`) allows **any `https://*.vercel.app`** when **`RENDER=true`**, unless you set **`CORS_ALLOW_VERCEL_PREVIEWS=false`** on Render. Redeploy the API after changing env.

Vercel gives you **many links** — that’s normal.

## Production (the “main” live site)

1. Open **[vercel.com](https://vercel.com)** → your project **`lab-record-system`** (or your name).
2. Go to **Settings → Domains**.
3. The **short** URL is usually your **production** site, e.g. `https://lab-record-system.vercel.app` or a **custom domain** you added.
4. Or: **Deployments** tab → filter **Production** (branch is often `main` / `master`) → open the latest **Ready** deployment → **Visit**.

That URL is what you should treat as **“final deployed”** for the public app.

## Preview URLs (`…-git-….vercel.app`) and CORS

The API allows **`https://*.vercel.app`** origins **by default** (so Preview deployments work).  
Set **`CORS_ALLOW_VERCEL_PREVIEWS=false`** on Render only if you want to **block** previews and allow **`CORS_ORIGINS`** only.

If the console says **CORS blocked** but also **502 Bad Gateway**, fix **502 first** (Render logs / crash / sleep). Failed gateways often return **no** `Access-Control-Allow-Origin`, which looks like CORS.

## Local dev (`http://localhost:5173`) + API on Render — CORS

If **`VITE_MANUAL_API_URL`** points to **`https://…onrender.com`** while you run Vite on **localhost**, the browser does a **cross-origin** request. The API must respond to **OPTIONS** with `Access-Control-Allow-Origin: http://localhost:5174` (your exact port).

- **`server.cjs`** allows all common **`http://localhost:*`** / **`127.0.0.1`** origins. **Redeploy** the Render service after pulling the latest `server.cjs`.
- **Easiest for daily dev:** in project **`.env`** set **`VITE_MANUAL_API_URL=http://localhost:7001`** and run **`npm run backend:start`** on your machine — then the UI and API share no CORS issues and **Run Code** uses your local Docker.

If you still see **“No Access-Control-Allow-Origin”** on Render, check the service is **awake** (open the API root in a tab); cold **502** responses from the edge often **omit CORS headers** and look like a CORS bug.

## Preview (branch / PR deployments)

URLs that look like:

`https://lab-record-system-git-blackbox-dev-sanjay-s-projects-ce59762b.vercel.app`

- **`git-<branch>`** in the name means this build is for **branch** `blackbox-dev` (or similar).
- Each **branch** and often each **commit** can get its **own** preview URL.
- These are **not** “wrong” — they are **temporary** previews for that branch.

**“Latest” for a branch:** Deployments → find that branch → top **Ready** deployment.

---

## Why you see CORS errors (localhost from Vercel)

If the console shows:

`fetch at 'http://localhost:7001/api/...' from origin 'https://lab-record-system-git-...vercel.app'`

then the **frontend was built** with **`VITE_MANUAL_API_URL=http://localhost:7001`**.  
Browsers on the internet **cannot** reach your laptop’s localhost — CORS will fail.

### Fix (do this on Vercel)

1. **Vercel** → Project → **Settings → Environment Variables**.
2. Set **`VITE_MANUAL_API_URL`** to your **public API** URL, e.g. `https://your-service.onrender.com` (**no** trailing slash).  
   - Use the **same** value for **Production** and **Preview** unless you run a separate API per environment.
3. **Redeploy** (Deployments → … → Redeploy) so the new value is **baked into the build**.

### Fix (on Render / API host)

Set **`CORS_ORIGINS`** to **every** Vercel origin you use, comma-separated, **no** trailing slash, e.g.:

```text
https://lab-record-system.vercel.app,https://lab-record-system-git-blackbox-dev-sanjay-s-projects-ce59762b.vercel.app
```

Add new preview URLs when you first open a new branch deployment, or use **Preview** wildcards only if your host supports them (Render: list explicit URLs).

---

## Faculty panel: “Unable to load data” + CORS to `localhost:7001`

If the console shows a request to **`http://localhost:7001/...`** while the page is **`https://lab-record-system.vercel.app`**, the **production build was made without `VITE_MANUAL_API_URL`**, so the app falls back to localhost (browsers cannot reach your PC from Vercel).

**Fix:**

1. **Vercel** → Project → **Settings → Environment Variables** → add **`VITE_MANUAL_API_URL`** = `https://lab-record-system-moy2.onrender.com` (no trailing slash). Apply to **Production** (and Preview if you use previews).
2. **Redeploy** the project (Deployments → ⋯ → Redeploy) so the variable is **baked into the JS bundle**.
3. **Render** → Web Service → **Environment** → **`CORS_ORIGINS`** must include **`https://lab-record-system.vercel.app`** (comma-separate if you have more origins).

---

## Quick reference

| URL pattern | Meaning |
|-------------|---------|
| `https://lab-record-system.vercel.app` | Usually **production** |
| `https://lab-record-system-git-<branch>-....vercel.app` | **Preview** for that git branch |
| `http://localhost:7001` | **Only** valid when the site runs on your PC — **never** use as `VITE_MANUAL_API_URL` for Vercel builds |

---

## Changes not showing on your Vercel URL

If **localhost** has new UI but **`https://…vercel.app`** does not:

1. **Confirm which deployment you’re viewing** — Production (`main` / default branch) vs **Preview** (e.g. `blackbox-dev`). The URL `lab-record-system-vven.vercel.app` must be the domain tied to the deployment that includes your commit (check **Deployments** → latest **Ready** → **Source** / commit hash).
2. **Push the branch** Vercel builds from — merge or push to the connected branch, or open the **Preview** URL for the branch you actually pushed.
3. **Redeploy** — Deployments → **⋯** → **Redeploy** (clears stale build cache for that deployment).
4. **Rebuild after env changes** — `VITE_*` vars are baked at **build** time; change env → redeploy frontend.
5. **Hard refresh** the browser (or disable cache in DevTools) so you’re not seeing an old `index.html` / JS bundle.

---

## Supabase 400 errors

If REST calls return **400**, open the failing request in **Network** tab → **Response** body. Often it’s a **bad column name**, **RLS**, or **view** definition — fix in Supabase SQL / policies, not in Vercel.
