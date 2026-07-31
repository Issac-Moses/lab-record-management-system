import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { resolveRoleFromSources } from "@/lib/authFlow";

type Role = "student" | "faculty" | "admin" | null;

/**
 * useUserRole
 * 🔐 Single source of truth: profiles table in Supabase DB
 * ✅ Reactive to login/logout
 * ✅ No stale role bugs
 * ✅ Central RBAC hook
 */

export function useUserRole() {
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  async function fetchRole(userId?: string) {
    if (!userId) {
      setRole(null);
      setLoading(false);
      return;
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    const resolvedRole = resolveRoleFromSources(profile?.role);
    if (error || !resolvedRole) {
      setRole(null);
    } else {
      setRole(resolvedRole);
    }

    setLoading(false);
  }

  useEffect(() => {
    let mounted = true;

    // Initial session load
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      fetchRole(session?.user?.id);
    });

    // Reactive auth listener
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setLoading(true);
      fetchRole(session?.user?.id);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { role, loading };
}