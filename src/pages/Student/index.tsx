import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import StudentLayout from "./StudentLayout";

const StudentDashboard = lazy(() => import("./Studentdashboard"));
const StudentSubjects = lazy(() => import("./StudentSubjects"));
const StudentExperiments = lazy(() => import("./StudentExperiments"));
const StudentExperiment = lazy(() => import("./StudentExperiment"));
const StudentSubmissions = lazy(() => import("./StudentSubmissions"));
const StudentExamMarks = lazy(() => import("./StudentExamMarks"));
const StudentResults = lazy(() => import("./StudentResults"));
const StudentProfile = lazy(() => import("./StudentProfile"));
const StudentNotifications = lazy(() => import("./StudentNotifications"));
const StudentQuestWorkspace = lazy(() => import("./StudentQuestWorkspace"));

function StudentRouteLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-500">
      Loading...
    </div>
  );
}

export default function Student() {
  return (
    <Suspense fallback={<StudentRouteLoader />}>
      <Routes>
        <Route element={<StudentLayout />}>
          <Route index element={<StudentDashboard />} />
          <Route path="subjects" element={<StudentSubjects />} />
          <Route path="experiments" element={<StudentExperiments />} />
          <Route path="experiments/:id/submit" element={<StudentExperiment />} />
          <Route path="experiment/:id" element={<StudentExperiment />} />
          <Route path="add-experiment/:id" element={<StudentExperiment />} />
          <Route path="add-experiment" element={<StudentExperiment />} />
          <Route path="submissions" element={<StudentSubmissions />} />
          <Route path="marks" element={<Navigate to="/student/results" replace />} />
          <Route path="exam-marks" element={<StudentExamMarks />} />
          <Route path="results" element={<StudentResults />} />
          <Route path="profile" element={<StudentProfile />} />
          <Route path="notifications" element={<StudentNotifications />} />
          <Route path="quests/:taskId" element={<StudentQuestWorkspace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
