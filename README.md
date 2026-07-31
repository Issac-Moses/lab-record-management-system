# Lab Record System

**Digital lab records, faculty evaluation, student submissions, admin workflows, optional exams, and gamification** — built with **React (Vite)**, **Supabase** (auth + Postgres + storage), and a **Node** API (`server.cjs`) for manuals, gamification, admin operations, and code execution.

## About

A full-stack digital lab record management system for colleges and universities built with React, TypeScript, Node.js, and Supabase.

### Key Features

- Student experiment submissions
- Faculty evaluation and grading
- Admin management dashboard
- Exam management and monitoring
- Gamification and leaderboard system
- PDF generation and manual handling
- Role-based authentication and access control

### Technology Stack

- Frontend: React, Vite, TypeScript, Tailwind CSS
- Backend: Node.js, Express
- Database & Auth: Supabase
- Deployment: Vercel + Render

---

## Table of contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Repository & clone](#repository--clone)
4. [Project structure](#project-structure)
5. [Prerequisites](#prerequisites)
6. [Full setup process](#full-setup-process)
7. [Environment variables](#environment-variables)
8. [Scripts](#scripts)
9. [Running locally](#running-locally)
10. [User roles & main routes](#user-roles--main-routes)
11. [API surface (`server.cjs`)](#api-surface-servercjs)
12. [Database & SQL](#database--sql)
13. [Documentation index](#documentation-index)
14. [Deployment](#deployment)
15. [Troubleshooting](#troubleshooting)
16. [Recent improvements & edits](#recent-improvements--edits)
17. [Project report (for reports / viva)](#project-report-for-reports--viva)
18. [License](#license)

---

## Overview

| Layer | Technology |
|--------|------------|
| **Frontend** | React 18, TypeScript/JSX, Vite, Tailwind CSS, Framer Motion, Radix UI, Recharts |
| **Backend API** | Express (`server.cjs`), port **7001** by default |
| **Data & auth** | Supabase (Auth, Postgres, Storage) |
| **Extras** | PDF/manual parsing, optional Docker/Piston/Judge0 code runner (see `docs/CODE_RUNNER.md`) |

The app separates:

- **Browser** → Supabase (anon key) for normal CRUD where RLS applies.
- **Browser** → `VITE_MANUAL_API_URL` → Node API for privileged operations (service role on server only).

Never put `SUPABASE_SERVICE_ROLE_KEY` in frontend code or Vite env exposed to the client.

---

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  React (Vite)   │────▶│    Supabase      │     │  Node server    │
│  SPA + Router   │     │  Auth + DB +     │◀────│  server.cjs     │
│                 │     │  Storage         │     │  /api/* , /run  │
└────────┬────────┘     └──────────────────┘     └────────┬────────┘
         │                                                 │
         └──────────────── manual / gamification / admin ───┘
                    (VITE_MANUAL_API_URL → :7001)
```

- **Frontend:** `src/` — pages, layouts, contexts (`AuthContext`, `SubjectContext`), hooks, services.
- **Backend:** `server.cjs`, `routes/*.cjs`, `services/*.cjs`.
- **Config:** `vite.config.ts`, `tailwind.config.js`, `.env` (from `.env.example`).

---

## Repository & clone

Replace `YOUR_ORG` / `YOUR_REPO` (or the whole URL) with your real Git host path.

**HTTPS**

```bash
git clone https://github.com/YOUR_ORG/Lab-Record-system.git
cd Lab-Record-system
```

**SSH** (if you use SSH keys with GitHub/GitLab)

```bash
git clone git@github.com:YOUR_ORG/Lab-Record-system.git
cd Lab-Record-system
```

Then continue with [Full setup process](#full-setup-process) (`npm install`, `.env`, etc.).

---

## Project structure

Abbreviated layout of the repository (names may vary slightly as the project evolves):

```text
Lab-Record-system/
├── server.cjs                 # Express entry: /api/*, code runner routes
├── Dockerfile                 # Optional container for API + runner
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig*.json
├── .env.example               # Copy → .env (never commit secrets)
├── README.md
│
├── docs/                      # Deployment, gamification, SQL helpers, guides
├── routes/                    # Express routers (admin, gamification, manual, …)
├── services/                  # Node services (manual, gamification, PDF, …)
├── middleware/                # e.g. role middleware for API
│
├── backend/proctor/           # Optional proctor / AI detection (Python)
├── piston-server/             # Optional Piston-related helper
│
└── src/                       # React (Vite) application
    ├── main.tsx
    ├── App.tsx
    ├── index.css
    ├── components/            # UI primitives, admin, gamification, student, …
    ├── context/               # Auth, subject scope, theme, …
    ├── hooks/
    ├── layouts/               # Faculty, admin shell, dashboard, …
    ├── lib/                   # supabase client, auth helpers, utils
    ├── pages/
    │   ├── Admin/             # Bulk upload, settings, department views, …
    │   ├── Faculty/           # Dashboard, submissions, experiments, exams, …
    │   ├── Student/           # Experiments, submissions, dashboard, …
    │   ├── Common/            # Role setup, …
    │   ├── Exam/              # Exam login / session
    │   ├── Login.tsx
    │   ├── Home.tsx
    │   └── …
    ├── services/              # Browser-side API helpers (admin, gamification, …)
    ├── pdf/                   # PDF generation / fonts
    └── utils/
```

**Build output:** `npm run build` writes the production SPA to **`dist/`** (deploy this folder to static hosting).

---

## Prerequisites

- **Node.js 18+**
- **npm**
- A **Supabase** project: project URL, **anon** key (client), **service role** key (server only)
- Optional: **Docker** (for local code execution routes on the runner — see `docs/CODE_RUNNER.md`)

---

## Full setup process

### 1. Clone and install

Clone the repo (see [Repository & clone](#repository--clone) for HTTPS/SSH examples), then:

```bash
cd Lab-Record-system
npm install
```

### 2. Environment

```bash
cp .env.example .env
```

Edit `.env` and fill values. See [Environment variables](#environment-variables) and inline comments in [`.env.example`](.env.example).

**Rules:**

- `VITE_*` variables are embedded at **build time** for the SPA.
- Backend reads `SUPABASE_*`, `CORS_ORIGINS`, etc. from the **same** `.env` at project root when you run `node server.cjs`.

### 3. Supabase database

1. Apply core app migrations / schema your team uses for this project.
2. Add optional modules as needed:

   | Area | Where to look |
   |------|----------------|
   | Gamification (XP, leaderboard, quests) | `docs/gamification-full-install.sql`, [docs/gamification-setup.md](docs/gamification-setup.md) |
   | Gamification RLS fixes in browser | [docs/gamification-rls.sql](docs/gamification-rls.sql) |
   | Exams / submissions constraints | [EXAM_FIXES_APPLIED.md](EXAM_FIXES_APPLIED.md) (if present) |
   | PDF / attachments | [docs/fix-submissions-images-attachments-for-pdf.sql](docs/fix-submissions-images-attachments-for-pdf.sql) |

### 4. Start the stack

You need **two terminals** for full functionality (UI + manual API / gamification / admin routes).

**Terminal 1 — Vite**

```bash
npm run dev
```

**Terminal 2 — API**

```bash
npm run backend:start
```

Default API: `http://localhost:7001`. Ensure `VITE_MANUAL_API_URL` matches (see `.env.example`).

### 5. Verify production build (before demo / submission)

```bash
npm run verify
```

Same as `npm run build` — catches build errors early.

---

## Environment variables

**Source of truth:** [`.env.example`](.env.example) (names and comments — **never commit real secrets**).

| Group | Examples | Notes |
|-------|-----------|--------|
| **Vite / client** | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MANUAL_API_URL` | Required for UI; `VITE_MANUAL_API_URL` usually `http://localhost:7001` locally |
| **Server** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Server only; used for `/api/gamification`, `/api/manual`, `/api/admin` |
| **Marks / UX** | `VITE_INTERNAL_EXPERIMENT_MAX_MARK`, `VITE_INTERNAL_MARKS_MAX` | Optional caps |
| **Production** | `CORS_ORIGINS`, `FRONTEND_URL` | Set on the Node host so the browser can call the API |

For **Vercel + Render** (or similar), see [docs/VERCEL_URLS_AND_CORS.md](docs/VERCEL_URLS_AND_CORS.md) and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server (frontend) |
| `npm run build` | Production build → `dist/` |
| `npm run verify` | Same as `build` — use before review / demo |
| `npm run preview` | Preview production build locally |
| `npm run backend:start` | Start `server.cjs` (default port **7001**) |
| `npm run backend:stop` | Stop process listening on 7001 |
| `npm run backend:status` | Check if something is listening on 7001 |
| `npm run backend:restart` | `backend:stop` then `backend:start` |

---

## Running locally

1. `npm install`
2. `.env` from `.env.example`
3. `npm run dev` + `npm run backend:start`
4. Open the URL Vite prints (typically `http://localhost:5173`)

**College review / demo day:** see **[COLLEGE_REVIEW_READY.md](COLLEGE_REVIEW_READY.md)** for a full checklist, `npm run review:status`, and `npm run review:verify`.

**Exam flow (student):**

1. `/exam/login` — room ID + identity; session in `localStorage`
2. `/exam/session` — see `src/pages/Exam/StudentExam.tsx`

Manual regression ideas: [EXAM_FIXES_APPLIED.md](EXAM_FIXES_APPLIED.md) if present.

---

## User roles & main routes

| Role | Typical flow |
|------|----------------|
| **Student** | Login → subject/experiment selection → write/submit experiments → view marks |
| **Faculty** | Login → subject selection → dashboard, submissions, review detail, experiments, exams (where enabled) |
| **Admin** | Admin shell → users, subjects, bulk upload, department views |

Route wiring lives under `src/pages/` and route files (e.g. `src/App.tsx`, faculty/admin index routes). Faculty layout: `src/layouts/FacultyLayout.tsx`.

**Dedicated login entry points (if used):** e.g. `src/pages/Login.tsx` (modes: student / faculty / admin), `FacultyLogin.tsx`, `AdminLogin.tsx` — see app router for exact paths.

---

## API surface (`server.cjs`)

Mounted under:

- **`/api/manual`** — manual uploads, faculty/student manual flows
- **`/api/gamification`** — XP, leaderboard, quests (requires service role on server)
- **`/api/admin`** — admin utilities

**Code execution:** `POST /run`, `POST /api/run-java` (see `server.cjs` and [docs/CODE_RUNNER.md](docs/CODE_RUNNER.md)).

---

## Database & SQL

- Application data lives in **Supabase Postgres**; client uses `@supabase/supabase-js` with the anon key and RLS.
- Supplementary SQL and install notes are under **`docs/`** and repo root SQL files (e.g. `faculty-analytics-function.sql` if used).

### After ai-exam-protection.sql succeeds

You do **not** need to rebuild the frontend just for this SQL — the app already writes to `exam_activity_logs` when students leave the exam tab.

1. **Confirm policies** — The script enables RLS on `exam_activity_logs` and adds `INSERT` / `SELECT` for the `authenticated` role. If the editor showed “Success”, you’re done on the DB side.
2. **Optional: live refresh** — For **instant** faculty updates (without waiting for the 5s poll), turn on **Realtime** for this table:
   - Supabase **Dashboard → Database → Publications** (or **Replication**), add **`exam_activity_logs`** to the `supabase_realtime` publication, **or** run in SQL:
   - `alter publication supabase_realtime add table public.exam_activity_logs;`
3. **Smoke test**
   - **Student:** `/exam/login` → join an active exam → switch to another browser tab once or twice.
   - **Supabase:** **Table Editor → `exam_activity_logs`** — you should see new rows with `event = tab_switch` and the correct `exam_id` / `register_no`.
   - **Faculty:** **Exam Submissions** or **Live Exam Monitor** for that exam — **Tab switches** / **Violations** should reflect the count (refresh if Realtime is off).
4. **If counts stay at 0** — Ensure the student session is **authenticated** (logged in), exam is active, and you’re viewing the **same** `exam_id`. Check the browser **Network** tab for failed `POST` to `exam_activity_logs` (usually RLS — re-run the policy block from `ai-exam-protection.sql`).

---

## Documentation index

| Doc | Purpose |
|-----|---------|
| [TODO.md](TODO.md) | Student UI / QA checklist (if present) |
| [docs/STEP_BY_STEP.md](docs/STEP_BY_STEP.md) | Deployment steps (order matters) |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Hosting details |
| [docs/UNDERSTANDING_API_AND_DEPLOYMENT.md](docs/UNDERSTANDING_API_AND_DEPLOYMENT.md) | Why UI vs API split |
| [docs/VERCEL_URLS_AND_CORS.md](docs/VERCEL_URLS_AND_CORS.md) | CORS and preview URLs |
| [docs/CODE_RUNNER.md](docs/CODE_RUNNER.md) | Code execution / runner |
| [docs/gamification-setup.md](docs/gamification-setup.md) | Gamification install |
| [docs/FINAL_YEAR_PROJECT_REVIEW.md](docs/FINAL_YEAR_PROJECT_REVIEW.md) | Final year: env checklist, demo, `npm run verify` |
| [docs/STUDENT_EXPERIMENT_CATALOG.md](docs/STUDENT_EXPERIMENT_CATALOG.md) | Student experiment catalog notes |

---

## Deployment

**Short version:** Deploy the **Vite build** (`dist/`) to **Vercel** (or similar). Run **`server.cjs`** on another host (e.g. Render; Dockerfile may exist in repo). Set:

- **`VITE_MANUAL_API_URL`** on the frontend build to your **public API URL**
- **`CORS_ORIGINS`** (and related) on the API to your **frontend origin(s)**

**Step-by-step:** [docs/STEP_BY_STEP.md](docs/STEP_BY_STEP.md)  
**Deep dive:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

---

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| **CORS errors** calling API | `CORS_ORIGINS` on server includes your exact frontend origin; [docs/VERCEL_URLS_AND_CORS.md](docs/VERCEL_URLS_AND_CORS.md) |
| **Manual / gamification 401/403** | Service role on server only; user session vs admin routes |
| **Recharts “width/height -1”** in dev | Chart parent needs real size; `ResponsiveContainer` with `minWidth={0}` / `minHeight` and a sized wrapper (see admin overview charts) |
| **Supabase 400 on `exams` query** | Select list must match table columns; if `status` column doesn’t exist, derive status from `start_time` / `end_time` (faculty dashboard exam snapshot) |
| **Login fields invisible text** | Inputs should set explicit `text-*` and `bg-*` so theme doesn’t make text match background (`src/pages/Login.tsx`) |
| **Exam tab switches not recorded** | Run `ai-exam-protection.sql` RLS policies; verify inserts in Table Editor; student must be **authenticated** during exam ([Database & SQL — after exam SQL](#after-ai-exam-protectionsql-succeeds)) |

---

## Recent improvements & edits

Changelog of **documented UI and stability work** applied to this codebase:

### Login (`src/pages/Login.tsx`)

- **Issue:** Typed text could match the input background (poor contrast).
- **Change:** Explicit classes on identifier and password fields: `bg-white`, `text-slate-900`, `placeholder:text-slate-400` so text stays readable on all themes.

### Faculty dashboard — exams (`src/pages/Faculty/Facultydashboard.tsx`)

- **Issue:** `GET /rest/v1/exams` returned **400** when selecting columns not present on the table (e.g. `status`).
- **Change:** Query selects `start_time` and `end_time` instead; **status is computed in the client** (scheduled / active / completed style window) for the exam snapshot.

### Admin — charts (`src/pages/Admin/index.tsx`)

- **Issue:** Recharts warned about **negative/zero width/height** in some layouts.
- **Change:** Chart wrappers use `min-w-0`, `min-h-[220px]`, and `ResponsiveContainer` with `minWidth={0}` and `minHeight={220}` where needed.

### Faculty submission detail (`src/pages/Faculty/FacultySubmissionDetail.tsx`)

- **Issue:** Visual style and **color accents** didn’t match other faculty pages.
- **Change:** Layout aligned with faculty theme (gradient header card, stat-style info tiles, section cards, badges). **Pending** status uses **indigo** (not amber) and **Assign Marks** icon uses **indigo** for consistency with blue/indigo faculty palette.

### HOD Role & RBAC Isolation

- **Issue:** Privilege escalation where standard faculty could access HOD admin features, and HOD could not teach subjects without breaking role hierarchies.
- **Change:** Strictly isolated the HOD admin portal and the standard faculty workspace. The HOD retains the `'admin'` role hierarchy but teaches subjects via explicit `faculty_subjects` mappings without role conflicts.

### Subject-Linked Student Scoping

- **Issue:** Faculty dashboards and student counts were displaying incorrect numbers due to fuzzy frontend department filtering.
- **Change:** Standardized department naming codes to `'it'`. Configured dashboards to query directly from the `student_subjects` mapping table to ensure exact cohort visibility. Enrolled all 40 Year 3 Semester 6 IT students in the Cyber Security (`CCS340`) subject.

### Sequential Experiment Locking Sync

- **Issue:** Students were able to open Experiment $N+1$ on the submissions page while having an unfinished draft for Experiment $N$.
- **Change:** Synced the sequential unlock logic across both `StudentExperiments.tsx` and `StudentSubmissions.tsx` to set `canUnlockNext = false` when an experiment is in a `draft` or `in_progress` state.

### Deployment & Environment Hardening

- **Issue:** Dockerfile was incomplete and production-specific configurations were not set.
- **Change:** Rebuilt the `Dockerfile` for production deployment on Coolify. Configured and secured `.env` and `.env.example` runner variables (`RUNNER_PORT=7001`, `CODE_RUNNER=auto`, `NODE_ENV=production`).

---

## Project report (for reports / viva)

- **Checklist & demo flow:** [docs/FINAL_YEAR_PROJECT_REVIEW.md](docs/FINAL_YEAR_PROJECT_REVIEW.md)
- **Generate a full written report:** Use an AI or writer with a structured prompt: read `README.md`, `docs/`, `.env.example`, `package.json`, and scan `src/`, `routes/`, `services/`. Cover architecture, roles, features, deployment, security (no secrets), and limitations.

---

## License

Private project — see repository owner.
