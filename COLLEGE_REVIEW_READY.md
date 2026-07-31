# College review — ready-to-run checklist

Use this on **demo day**. Project path:

`/Users/sanjay/Projects/Lab-Record-system`

---

## Before the review (once)

1. **Install dependencies**
   ```bash
   cd /Users/sanjay/Projects/Lab-Record-system
   npm install
   ```

2. **Environment** — copy and fill `.env` from `.env.example`:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `VITE_MANUAL_API_URL=http://localhost:7001`
   - `VITE_PROCTOR_API_URL=http://127.0.0.1:8001` (only if showing proctored exams)

3. **Supabase SQL** (SQL Editor, once per project) — run as needed:
   - Core schema / migrations
   - `docs/gamification-full-install.sql` — XP / leaderboard
   - `exams-rls-fix.sql`, `ai-exam-protection.sql` — exams + tab-switch monitoring
   - `faculty-subject-rls.sql` — faculty subject access

4. **Proctor Python env** (only if demo includes AI proctor / camera exams):
   ```bash
   npm run proctor:install
   ```

5. **Preflight checks**
   ```bash
   npm run review:verify
   ```

---

## On demo day — start services

Open **3 terminals** (terminal 3 only for proctored exams).

| Terminal | Command | URL |
|----------|---------|-----|
| **1 — API** | `npm run backend:start` | http://localhost:7001 |
| **2 — Website** | `npm run dev` | http://localhost:5173 |
| **3 — Proctor** (optional) | `npm run proctor:start` | http://127.0.0.1:8001 |

**Check everything is up:**

```bash
npm run review:status
```

You should see listeners on **7001** and **5173** (and **8001** if using proctor).

**If proctor says “address already in use”:**

```bash
npm run proctor:stop
npm run proctor:start
```

**If proctor says “bad interpreter python3.14”:**

```bash
npm run proctor:install
npm run proctor:start
```

---

## Login URLs

| Role | URL |
|------|-----|
| Home | http://localhost:5173 |
| Student | http://localhost:5173/login |
| Faculty | http://localhost:5173/faculty/login |
| Admin | http://localhost:5173/admin/login |
| Exam (student) | http://localhost:5173/exam/login |

**Admin account (example):** `admin.main@spcet.ac.in` — password is set in **Supabase → Authentication → Users** (cannot be read from code; reset there if forgotten).

---

## Suggested 10–15 minute demo flow

| Step | Who | What to show |
|------|-----|----------------|
| 1 | Student | Login → select subject → open experiment → write / submit |
| 2 | Faculty | Login → dashboard → review submissions → marks / feedback |
| 3 | Admin | Login → KPI dashboard → students / subjects |
| 4 | Exam (optional) | Faculty creates exam → share room link → student joins → faculty **Live monitor** (tab switches) |

Prepare **test accounts** in Supabase Auth + `profiles` (`role`, `department`) before the session.

---

## Stop services after demo

```bash
npm run backend:stop
npm run proctor:stop
# Ctrl+C in the terminal running npm run dev
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Admin / gamification / bulk upload fails | Start `npm run backend:start`; check `.env` service role key |
| Faculty dashboard empty | Select subject after login; check RLS / `faculty-subject-rls.sql` |
| Exam tab switches stay 0 | Run `ai-exam-protection.sql`; student must be logged in during exam |
| Console `ERR_CONNECTION_REFUSED` on port 7701 | Fixed — was debug telemetry (removed) |
| `npm run verify` fails | Fix build errors before demo |

---

## More detail

- [docs/FINAL_YEAR_PROJECT_REVIEW.md](docs/FINAL_YEAR_PROJECT_REVIEW.md)
- [README.md](README.md)
- [docs/STEP_BY_STEP.md](docs/STEP_BY_STEP.md)
