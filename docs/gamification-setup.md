# Gamification (Supabase + API)

## 0. One-shot install (recommended)

Run **`docs/gamification-full-install.sql`** once in **Supabase → SQL**. It includes:

- XP columns on **`profiles`** / **`users`**
- **`achievements`**, **`user_achievements`**, **`leaderboard_cache`**
- All **10** achievement seeds (labs, streaks, quests)
- **`student_gamification_tasks`** (quests), with optional **`subject_id` → `subjects`** FK if the table exists
- Optional **RLS** for reading achievements in the browser

Idempotent and safe to re-run.

## 1. Schema (`gamification-schema.sql`)

Alternatively, use **`gamification-schema.sql`** at the project root (core tables + seeds only). Add quests with **`docs/gamification-tasks-schema.sql`** and **`docs/gamification-quest-achievements.sql`** if needed.

In **Supabase → SQL**, run the full **`gamification-schema.sql`** at the project root. It is safe to run more than once.

- Adds **`xp_points`**, **`level`**, **`current_streak`**, **`labs_completed`** to **`profiles`** (and to **`users`** if that table exists).
- **Students and faculty share the same columns** on `profiles`; role is distinguished by **`profiles.role`** (`student` / `faculty` / `admin`).

## 2. Optional RLS (`gamification-rls.sql`)

If the Achievements panel returns empty or errors on `user_achievements`, run **`docs/gamification-rls.sql`**.  
XP **writes** from evaluation/submission flows use the **Node server + service role** and do not require permissive RLS on `profiles`.

## 3. API server

Gamification writes use **`SUPABASE_SERVICE_ROLE_KEY`** in **`services/gamificationService.cjs`**. Ensure the manual API is running (e.g. `npm` script that starts **`server.cjs`**) and **`VITE_MANUAL_API_URL`** in the frontend points at it (default `http://localhost:7001`).

- **Students**: lab XP + streaks via **`POST /api/gamification/reward-submission`** (also used after manual submit).
- **Faculty**: **+15 XP** per evaluation when they submit marks in **Faculty Review** (same endpoint, with **`reviewerUserId`**).

## 4. Leaderboard

The student dashboard loads rankings via **`GET /api/gamification/leaderboard?role=student`** so results are not blocked by row-level security on `profiles`.

## 4b. Sync progress (recommended)

On each load, the app calls **`POST /api/gamification/sync-progress`** (Bearer token, **students only**). The server recomputes **`labs_completed`** and a minimum **`xp_points`** from:

- **`submissions`** (distinct `exp_id` with status submitted / evaluated / approved), and  
- **`student_experiments`** where **`is_completed`** is true (if that table exists),

then updates **`profiles`** (same rules as `gamification-schema.sql`). This keeps the **leaderboard** aligned with real lab activity, not only faculty reward events.

## 5. Quests (assigned tasks)

Run **`docs/gamification-tasks-schema.sql`** in Supabase to create **`student_gamification_tasks`**.

- **Faculty / admin** assign quests via **`POST /api/gamification/tasks`** (Bearer token).
- **Students** list **`GET /api/gamification/tasks/me`** and complete **`POST /api/gamification/tasks/:id/complete`**.
- Completing a pending quest calls **`addXP`** so **level** (derived from total XP) and the **leaderboard** update automatically.

## 6. Quest achievements (titles on student dashboard)

Run **`docs/gamification-quest-achievements.sql`** in Supabase to add **First Quest Complete**, **Quest Sprint**, and **Quest Legend**.  
The server grants these when completed quest counts reach 1 / 5 / 10 (see `checkAndGrantAchievements` in `gamificationService.cjs`).
