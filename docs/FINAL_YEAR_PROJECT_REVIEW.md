# Final year project — submission & viva checklist

Use this before **internal review**, **external examiner**, or **demo day**.

## 1. Environment (required)

- [ ] Copy `.env.example` → `.env` (never commit `.env`).
- [ ] `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from Supabase **Project Settings → API**.
- [ ] `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (service role **only** in backend / Node — never in frontend bundle).
- [ ] `VITE_MANUAL_API_URL` (e.g. `http://localhost:7001`) matches the port where `server.cjs` runs.

## 2. Database (Supabase SQL)

Apply in order for your project:

1. Core app tables (your existing migrations / schema).
2. Optional: [gamification-full-install.sql](gamification-full-install.sql) — XP, leaderboard, quests.
3. Optional: [gamification-rls.sql](gamification-rls.sql) — if browser reads on `profiles` fail under RLS.

If admin overview shows **400** on `student_experiments`, the app will **retry** with fewer columns; ensure table `student_experiments` exists and RLS allows the logged-in admin where needed.

## 3. Run commands (demo)

**Terminal A — frontend**

```bash
npm install
npm run dev
```

**Terminal B — backend (gamification, manuals, admin API)**

```bash
npm run backend:start
```

**Verify production build (markers / reviewers often ask)**

```bash
npm run verify
```

## 4. Suggested demo script (10–15 min)

| Step | Actor | What to show |
|------|--------|----------------|
| 1 | Student | Login → subject selection → open lab / submission |
| 2 | Faculty | Login → review submissions / marks |
| 3 | Admin | Login → dashboard KPIs (department-scoped if profile has department) → students / leaderboard optional |

Prepare **test accounts** in Supabase Auth + `profiles` (`role`, `department`) before the session.

## 5. Report / slides (typical requirements)

- Problem statement & objectives  
- Architecture: React (Vite) + Supabase + Node (`server.cjs`) — one diagram  
- Modules: student / faculty / admin / exam / gamification (as implemented)  
- Database: main entities (users, subjects, experiments, submissions)  
- **Limitations** (honest): e.g. RLS, partial views, env-specific config  
- Future work: tests, deployment, monitoring  

## 6. Repository hygiene before zip / GitHub

- [ ] No secrets in repo (search for `service_role`, long JWT-like strings).  
- [ ] `npm run verify` passes.  
- [ ] Optional: remove local debug logs (`.cursor/debug-*.log` should stay **gitignored**).

## 7. Known behaviour (explain if asked)

- **Department admin** dashboard totals use **department scope** when the admin `profiles.department` is set; **empty / Administration / All** may show **institution-wide** counts.  
- **Leaderboard “ranked”** counts students with **grade/lab data** in the pipeline, not necessarily every enrolled student.  
- **Gamification** numbers need the **Node API** running and gamification SQL applied.

---

**Good luck with your review.**
