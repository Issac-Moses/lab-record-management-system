import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  getRoleHomePath,
  requiresRoleSetup,
  resolveRoleFromSources,
  type AppRole,
} from "@/lib/authFlow";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRole?: AppRole;
}

/**
 * ProtectedRoute
 * ✅ Auth guard using global AuthContext
 * ✅ No duplicate database queries
 * ✅ Tab-switch and token-refresh safe
 * ✅ No spurious unauthorized redirects
 */

export default function ProtectedRoute({
  children,
  allowedRole,
}: ProtectedRouteProps) {
  const location = useLocation();
  const { user, role, profile, loading } = useAuth();
  const requireAdminDepartment = import.meta.env.VITE_REQUIRE_ADMIN_DEPARTMENT === "true";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Checking secure access…
      </div>
    );
  }

  // ❌ Not logged in → redirect to role-appropriate login
  if (!user) {
    const loginPath =
      allowedRole === "faculty"
        ? "/faculty/login"
        : allowedRole === "admin"
          ? "/admin/login"
          : "/login";
    return <Navigate to={loginPath} replace state={{ from: location }} />;
  }

  const storedRole =
    (localStorage.getItem("auth_role") as AppRole | null) ||
    (sessionStorage.getItem("auth_role") as AppRole | null) ||
    (localStorage.getItem("pendingRole") as AppRole | null);

  const actualRole = profile?.role || role || user?.user_metadata?.role || user?.app_metadata?.role;
  const effectiveRole = (actualRole as AppRole | null) || storedRole;
  const isAdmin = actualRole === "admin";
  const isFaculty = actualRole === "faculty";
  const isStudent = actualRole === "student";

  let isRoleAllowed = false;
  if (!allowedRole) {
    isRoleAllowed = true;
  } else if (allowedRole === "admin") {
    isRoleAllowed = isAdmin;
  } else if (allowedRole === "faculty") {
    isRoleAllowed = isFaculty || isAdmin;
  } else {
    isRoleAllowed = actualRole === allowedRole;
  }

  // Auto-sync cached role if logged in and allowedRole is matched
  if (user && allowedRole && isRoleAllowed) {
    if (localStorage.getItem("auth_role") !== allowedRole) {
      localStorage.setItem("auth_role", allowedRole);
    }
    if (sessionStorage.getItem("auth_role") !== allowedRole) {
      sessionStorage.setItem("auth_role", allowedRole);
    }
  }

  // If user is logged in but role resolution is still pending, don't kick out to /unauthorized
  if (allowedRole && !isRoleAllowed && (!effectiveRole || !profile)) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Verifying role permissions…
      </div>
    );
  }

  // ❌ Logged in as a DIFFERENT explicit role (e.g. Student trying to access Admin) → unauthorized
  if (!isRoleAllowed && effectiveRole && effectiveRole !== allowedRole) {
    console.group("UNAUTHORIZED REDIRECT PREVENTED OR EXECUTED");
    console.log("Current URL:", location.pathname);
    console.log("Allowed Role:", allowedRole);
    console.log("Effective Role:", effectiveRole);
    console.groupEnd();

    return <Navigate to="/unauthorized" replace />;
  }

  // Check role setup requirement
  const currentRole = effectiveRole || role || allowedRole;
  const needsSetup = currentRole
    ? requiresRoleSetup(
        currentRole,
        {
          department: profile?.department ?? null,
          year: profile?.year ?? null,
          semester: profile?.semester ?? null,
        },
        requireAdminDepartment
      )
    : false;

  // Redirect to /setup if needed
  if (needsSetup && location.pathname !== "/setup") {
    return <Navigate to="/setup" replace />;
  }

  // Redirect away from /setup if already configured
  if (!needsSetup && location.pathname === "/setup") {
    if (currentRole) return <Navigate to={getRoleHomePath(currentRole)} replace />;
  }

  // ✅ Authorized
  return <>{children}</>;
}