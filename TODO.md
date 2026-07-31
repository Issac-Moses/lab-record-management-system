Items below are marked done where the current app already implements them. Run `npm run dev` and walk student routes for final QA.

## Phase 1: Global theme and components
- [x] 1.1 `tailwind.config.js` — student/brand theme extensions present
- [x] 1.2 `index.css` — CSS variables including `--student-*` tokens
- [x] 1.3 `src/components/ui/LoadingScreen.tsx` — exists (optional `className`)
- [x] 1.4 `src/components/ui/EmptyState.tsx`
- [x] 1.5 `src/components/ui/ErrorScreen.tsx`

## Phase 2: Student layout and routing
- [x] 2.1 `StudentLayout.tsx` — collapsible sidebar + Framer Motion (existing)
- [x] 2.2 `src/pages/Student/index.tsx` — includes `/student/subjects` and related routes

## Phase 3: Student subjects
- [x] 3.1 `StudentSubjects.tsx` — card grid UI
- [x] 3.2 Subject list from `useSubjects` + search filter (name/code)

## Phase 4: Student experiments
- [x] 4.1 `StudentExperiments.tsx` — sequential ordering via `applySequentialUnlock` + sort helpers
- [x] 4.2 Loading via `ExperimentsSkeleton`, empty/error via `EmptyState` / `ErrorScreen`, no-subject guard

## Phase 5: Single experiment page
- [x] 5.1 `StudentExperiment.tsx` — empty state + navigate to `/student/subjects` when no subject

## Phase 6: Student dashboard
- [x] 6.1–6.2 `Studentdashboard.tsx` — stats from `getStudentExperimentData` / Supabase + gamification merge

## Phase 7: Testing
- [ ] 7.1 Run `npm run dev` and fix any console errors (manual)
- [ ] 7.2 Spot-check student pages after auth (manual)
