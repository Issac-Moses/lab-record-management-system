import { ComponentType, lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

// Route guard
import ProtectedRoute from "./components/ProtectedRoute";
import { SubjectProvider } from "./context/SubjectContext";
import { ToastProvider } from "./components/ui/ToastProvider";
import LoadingScreen from "./components/ui/LoadingScreen";

function lazyWithRetry<T extends ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    const pageHasBeenRefreshed = sessionStorage.getItem("page_chunk_refreshed");
    try {
      const component = await componentImport();
      sessionStorage.removeItem("page_chunk_refreshed");
      return component;
    } catch (error) {
      console.warn("[App Router] Dynamic import failed, retrying module load...", error);
      if (!pageHasBeenRefreshed) {
        sessionStorage.setItem("page_chunk_refreshed", "true");
        window.location.reload();
        return new Promise<{ default: T }>(() => {});
      }
      // Second attempt inline fallback
      try {
        const retryComponent = await componentImport();
        return retryComponent;
      } catch (secondError) {
        console.error("[App Router] Dynamic import chunk failed twice:", secondError);
        throw secondError;
      }
    }
  });
}

const Home = lazyWithRetry(() => import("./pages/Home"));
const Login = lazyWithRetry(() => import("./pages/Login"));
const FacultyLogin = lazyWithRetry(() => import("./pages/FacultyLogin"));
const AdminLogin = lazyWithRetry(() => import("./pages/AdminLogin"));
const AuthCallback = lazyWithRetry(() => import("./pages/AuthCallback"));
const RoleSetup = lazyWithRetry(() => import("./pages/Common/RoleSetup"));
const StudentExam = lazyWithRetry(() => import("./pages/Exam/StudentExam"));
const ExamLogin = lazyWithRetry(() => import("./pages/Exam/ExamLogin"));
// @ts-ignore – JSX component without type declaration file
const ProctorExamPage = lazyWithRetry(() => import("./components/proctor/ProctorExamPage"));
const Unauthorized = lazyWithRetry(() => import("./pages/Unauthorized"));
const Student = lazyWithRetry(() => import("./pages/Student"));
const Faculty = lazyWithRetry(() => import("./pages/Faculty"));
// @ts-ignore – JSX component without type declaration file
const Admin = lazyWithRetry(() => import("./pages/Admin/AdminRoutes.jsx"));

function RouteLoader() {
  return (
    <LoadingScreen
      message="Loading page..."
      className="min-h-screen bg-slate-50 flex flex-col items-center justify-center"
    />
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Suspense fallback={<RouteLoader />}>
        <Routes>
      {/* ================= PUBLIC ================= */}
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/faculty/login" element={<FacultyLogin />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/exam" element={<Navigate to="/exam/login" replace />} />
      <Route path="/exam/login" element={<ExamLogin />} />
      <Route path="/exam/session" element={<StudentExam />} />
      <Route path="/exam/start" element={<Navigate to="/exam/session" replace />} />
      <Route path="/exam/:id/proctor" element={<ProctorExamPage />} />
      <Route path="/unauthorized" element={<Unauthorized />} />

      {/* ================= AUTH ================= */}
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route
        path="/setup"
        element={
          <ProtectedRoute>
            <RoleSetup />
          </ProtectedRoute>
        }
      />

      {/* ================= STUDENT ================= */}
      <Route
        path="/student/*"
        element={
          <ProtectedRoute allowedRole="student">
            <SubjectProvider>
              <Student />
            </SubjectProvider>
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/dashboard"
        element={
          <ProtectedRoute allowedRole="student">
            <Navigate to="/student" replace />
          </ProtectedRoute>
        }
      />

      {/* ================= FACULTY ================= */}
      <Route
        path="/faculty/*"
        element={
          <ProtectedRoute allowedRole="faculty">
            <Faculty />
          </ProtectedRoute>
        }
      />
      <Route
        path="/faculty/dashboard"
        element={
          <ProtectedRoute allowedRole="faculty">
            <Navigate to="/faculty" replace />
          </ProtectedRoute>
        }
      />

      {/* ================= ADMIN ================= */}
      <Route
        path="/admin/*"
        element={
          <ProtectedRoute allowedRole="admin">
            <Admin />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute allowedRole="admin">
            <Navigate to="/admin" replace />
          </ProtectedRoute>
        }
      />

      {/* ================= FALLBACK ================= */}
      <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </ToastProvider>
  );
}
