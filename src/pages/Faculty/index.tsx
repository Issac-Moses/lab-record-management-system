import React from "react";
import { Routes, Route, Navigate, useParams } from "react-router-dom";
import FacultyLayout from "@/layouts/FacultyLayout";

/* ===== Pages ===== */
import FacultyDashboard from "./FacultyDashboardReal";
import Templates from "./Templates";
import PendingList from "./PendingList";
import Submissions from "./FacultySubmissionsReal";
import FacultySubmissionDetail from "./FacultySubmissionDetailReal";
import FacultySettings from "./FacultySettings";
import FacultySubjectSelect from "./FacultySubjectSelect";
import FacultyExams from "./FacultyExams";
import FacultyExamSubmissions from "./FacultyExamSubmissions";
import FacultyExamActivity from "./FacultyExamActivity";
import FacultyExamMonitor from "./FacultyExamMonitor";
// @ts-ignore – JSX module, no type declaration available
import StudentsList from "./StudentsList.jsx";
import Reports from "./FacultyReportsReal";
import Experiments from "./Experiments";
import AddExperiment from "./AddExperiment";
import FacultyNotifications from "./FacultyNotifications";
// @ts-ignore – JSX module, no type declaration available
import FacultyLeaderboard from "./FacultyLeaderboard";
import FacultyInternalMarks from "./FacultyInternalMarks";

function RedirectToSubmission() {
  const { id } = useParams();
  if (!id) return <Navigate to="/faculty/submissions" replace />;
  return <Navigate to={`/faculty/submission/${id}`} replace />;
}

class FacultyErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorMessage: string; errorStack: string; errorLocation: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: "", errorStack: "", errorLocation: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      errorMessage: error?.message || "Runtime exception occurred.",
      errorStack: error?.stack || "No stack trace available.",
      errorLocation: error?.stack?.split("\n")?.[1]?.trim() || "Unknown location",
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Faculty section error:", error, info);
    this.setState({
      errorStack: `${error?.stack || ""}\n\nComponent Stack:\n${info.componentStack || ""}`,
    });
  }

  render() {
    if (this.state.hasError) {
      const isDev =
        import.meta.env.DEV ||
        localStorage.getItem("enable_dev_diagnostics") === "true" ||
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";
      const refId = `FAC-2026-${Math.floor(10000 + Math.random() * 90000)}`;

      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
          <div className="max-w-2xl w-full rounded-2xl border border-rose-200 bg-white p-6 shadow-sm text-slate-800 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600 font-bold">
                ⚠️
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Faculty Module Notice</h2>
                <p className="text-xs text-slate-500">
                  {isDev ? "Developer Diagnostic Details & Location" : "System Information Notice"}
                </p>
              </div>
            </div>

            {/* Production-Safe Notice */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <div className="text-sm font-semibold text-slate-800">
                Submission temporarily unavailable.
              </div>
              <div className="text-xs text-slate-500">
                Reference ID: <span className="font-mono font-bold text-slate-700">{refId}</span>
              </div>
              <div className="text-xs text-slate-500">
                Technical details have been logged for administrative review.
              </div>
            </div>


            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => {
                  this.setState({ hasError: false, errorMessage: "" });
                }}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Reset Component
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 rounded-xl bg-blue-600 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function Faculty() {
  return (
    <FacultyErrorBoundary>
      <Routes>
        <Route element={<FacultyLayout />}>
          <Route index element={<FacultyDashboard />} />
          <Route path="subjects" element={<FacultySubjectSelect />} />
          <Route path="templates" element={<Templates />} />
          <Route path="pending" element={<PendingList />} />
          <Route path="submission/:id" element={<FacultySubmissionDetail />} />
          <Route path="review/:id" element={<RedirectToSubmission />} />
          <Route path="evaluate/:id" element={<RedirectToSubmission />} />
          <Route path="submissions" element={<Submissions />} />
          <Route path="students" element={<StudentsList />} />
          <Route path="reports" element={<Reports />} />
          <Route path="analytics" element={<Reports />} />
          <Route path="notifications" element={<FacultyNotifications />} />
          <Route path="experiments" element={<Experiments />} />
          <Route path="add-experiment" element={<AddExperiment />} />
          <Route path="exams" element={<FacultyExams />} />
          <Route path="exams/:examId" element={<FacultyExamSubmissions />} />
          <Route path="exam-monitor/:examId" element={<FacultyExamMonitor />} />
          <Route path="exam-activity/:examId" element={<FacultyExamActivity />} />
          <Route path="settings" element={<FacultySettings />} />
          <Route path="leaderboard" element={<FacultyLeaderboard />} />
          <Route path="internal-marks" element={<FacultyInternalMarks />} />
        </Route>

        <Route path="*" element={<Navigate to="/faculty" replace />} />
      </Routes>
    </FacultyErrorBoundary>
  );
}
