import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

/**
 * AuthFlow = session watcher ONLY
 * ❌ No redirects
 * ❌ No role logic
 * ❌ No routing
 * ✅ Only session existence check
 * Redirect logic is handled ONLY in AuthCallback.tsx
 */

export default function AuthFlow() {
  useEffect(() => {
    console.log("🔁 AuthFlow mounted (session watcher mode)");

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        console.log("❌ Session missing → redirect login");
        window.location.replace("/login");
      }
    });

    return () => {
      if (data?.subscription) {
        data.subscription.unsubscribe();
      }
    };
  }, []);

  return (
    <div className="w-full h-screen flex flex-col items-center justify-center gap-4 bg-white dark:bg-slate-950">
      <div className="w-12 h-12 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
      <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">
        Authenticating...
      </p>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Securing your session
      </p>
    </div>
  );
}