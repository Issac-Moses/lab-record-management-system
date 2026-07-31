# Run Code on Vercel + Render (no Docker on Render)

The `/run` endpoint normally uses **`docker run`** (needs Docker on the API host). **Render’s default Node Web Service does not include Docker**, so you may see `docker: not found`.

## Fix (built in): `CODE_RUNNER=auto` (default)

On the **Render** service (same env as `server.cjs`):

1. Set **`CODE_RUNNER=auto`** (or omit it — default is `auto`).
2. **Redeploy** the API.

Behavior:

- If **`docker`** is available → uses Docker (same as local).
- If **`docker` is missing** → **Piston** first (`https://emkc.org/api/v2/piston/execute`); if that **throws** (network / rate limit / outage), **Judge0 CE** (`https://ce.judge0.com`) runs next — still no Docker on the server.

**SQL** in-app runner still needs Docker (SQLite helper); use **Docker locally** or a **VPS with Docker** for SQL runs.

## Options

| `CODE_RUNNER` | Meaning |
|---------------|--------|
| `auto` | Docker first, then cloud chain if `docker` missing |
| `piston` | Cloud only: Piston → Judge0 if Piston throws |
| `judge0` | **Judge0 CE only** (second free provider; no Piston) |
| `docker` | Docker only (fail if no Docker) |

Optional env:

- **`PISTON_API_URL`** — your own Piston instance.
- **`JUDGE0_API_URL`** — default `https://ce.judge0.com` (Judge0 CE public).

**Node:** Cloud runners use **`fetch`** (Node **18+**). Set Render Node version to 18 or newer.

## Local Docker: PHP “Unable to find image” / slow pull

The first run may **pull** the language image (`php:8.3-cli-alpine`, etc.). The server uses **`DOCKER_RUN_TIMEOUT_MS`** (default **180000** = 3 minutes) so pulls are not cut off by a 10s limit. You can **`docker pull php:8.3-cli-alpine`** once before testing to avoid wait during Run Code.

## Rate limits

Public **Piston** and **Judge0 CE** demos may **rate-limit** or throttle. For production load, host your own Piston/Judge0 or run Docker on a VPS.

## Judge0 CE

Free tier public API (no key on CE). Language IDs are fixed in `server.cjs` (`JUDGE0_LANG`). If Judge0 updates runtimes, adjust IDs or use a self-hosted Judge0.
