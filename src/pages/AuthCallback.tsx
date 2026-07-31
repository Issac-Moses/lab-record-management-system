import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { clearStaleAuthStorage, isInvalidRefreshTokenError } from "@/lib/clientSession";
import {
  applyPostAuthRolePreparation,
  getRoleHomePath,
  requiresRoleSetup,
  resolveRoleFromSources,
} from "@/lib/authFlow";

/**
 * AuthCallback
 * ✅ Single source of truth for redirects
 * ✅ Role-based routing
 * ✅ No nested routers
 * ✅ No redirect loops
 * ✅ Vercel safe
 * ✅ Production ready
 */

export default function AuthCallback() {
  useEffect(() => {
    let mounted = true;

    const resolveAuth = async () => {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (!mounted) return;

        // ❌ Not authenticated
        if (sessionError && isInvalidRefreshTokenError(sessionError)) {
          clearStaleAuthStorage();
          window.location.replace("/login");
          return;
        }

        if (sessionError || !session?.user) {
          window.location.replace("/login");
          return;
        }

        const userId = session.user.id;

        // 🔐 Fetch role
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("role, department, year, semester")
          .eq("id", userId)
          .single();

        if (!mounted) return;

        const resolvedRole = resolveRoleFromSources(
          profile?.role,
          session.user.user_metadata?.role,
          localStorage.getItem("pendingRole")
        );

        if (!resolvedRole) {
          console.error("❌ Role fetch failed:", error);
          window.location.replace("/login");
          return;
        }

        localStorage.setItem("auth_role", resolvedRole);

        if (profile?.department) {
          localStorage.setItem("department", String(profile.department));
          localStorage.setItem("dept", String(profile.department));
          localStorage.setItem("admin_department", String(profile.department));
        }
        if (profile?.year) {
          localStorage.setItem("year", String(profile.year));
        }
        if (profile?.semester) {
          localStorage.setItem("semester", String(profile.semester));
        }

        applyPostAuthRolePreparation(resolvedRole);
        const requireAdminDepartment = import.meta.env.VITE_REQUIRE_ADMIN_DEPARTMENT === "true";
        const needsSetup = requiresRoleSetup(
          resolvedRole,
          {
            department: profile?.department || null,
            year: profile?.year || null,
            semester: profile?.semester || null,
          },
          requireAdminDepartment
        );
        window.location.replace(needsSetup ? "/setup" : getRoleHomePath(resolvedRole));
      } catch (e) {
        console.error("❌ AuthCallback error:", e);
        window.location.replace("/login");
      }
    };

    resolveAuth();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="w-full h-screen flex flex-col items-center justify-center gap-4 bg-white dark:bg-slate-950">
      <div className="w-12 h-12 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
      <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">
        Completing secure login…
      </p>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Redirecting to your dashboard
      </p>
    </div>
  );
}