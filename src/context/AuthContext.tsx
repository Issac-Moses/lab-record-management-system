import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react"
import type { User } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import {
  clearAllUserScope,
  clearStaleAuthStorage,
  isInvalidRefreshTokenError,
} from "@/lib/clientSession"
import { clearPendingRole, resolveRoleFromSources } from "@/lib/authFlow"

type Role = "admin" | "faculty" | "student" | null

interface Profile {
  role: Role
  department: string | null
  year: string | null
  semester: string | null
  register_no: string | null
}

interface AuthContextType {
  user: User | null
  role: Role
  loading: boolean
  signOut: () => Promise<void>
  profile: Profile | null
}

const AuthContext = createContext<AuthContextType | undefined>(
  undefined
)

function isNetworkFailure(error: unknown): boolean {
  const blob = JSON.stringify(error || {}).toLowerCase()
  const message = (error as { message?: string } | null)?.message?.toLowerCase() || ""
  const combined = `${blob} ${message}`
  return (
    combined.includes("failed to fetch") ||
    combined.includes("err_network_changed") ||
    combined.includes("err_address_unreachable") ||
    combined.includes("err_internet_disconnected") ||
    combined.includes("err_name_not_resolved") ||
    combined.includes("network")
  )
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<Role>(() => {
    const cached = localStorage.getItem("auth_role")
    return (cached === "admin" || cached === "faculty" || cached === "student") ? cached : null
  })
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const fetchedUserIdRef = useRef<string | null>(null)

  const updateRole = (newRole: Role) => {
    setRole(newRole)
    if (newRole) {
      localStorage.setItem("auth_role", newRole)
      sessionStorage.setItem("auth_role", newRole)
    } else {
      localStorage.removeItem("auth_role")
      sessionStorage.removeItem("auth_role")
    }
  }

  useEffect(() => {
    // 1️⃣ Get existing session (page refresh support)
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (error && isInvalidRefreshTokenError(error)) {
        clearStaleAuthStorage()
        setUser(null)
        updateRole(null)
        setProfile(null)
        setLoading(false)
        window.location.replace("/login")
        return
      }
      const sessionUser = data.session?.user ?? null
      setUser(sessionUser)

      if (sessionUser) {
        fetchedUserIdRef.current = sessionUser.id
        await fetchUserProfile(sessionUser.id)
      } else {
        setLoading(false)
      }
    })

    // 2️⃣ Listen to auth changes (login/logout)
    // IMPORTANT: Only act on SIGNED_OUT for logout via explicit signOut() call.
    // Never wipe role or auth state on transient null sessions from TOKEN_REFRESHED,
    // INITIAL_SESSION, or tab wake events (prevents spurious logout & /unauthorized redirects).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const sessionUser = session?.user ?? null;
      if (sessionUser) {
        // Only re-fetch profile on initial sign-in or account switch, never on tab-switch SIGNED_IN wake events
        if (
          (event === "SIGNED_IN" || event === "USER_UPDATED") &&
          fetchedUserIdRef.current !== sessionUser.id
        ) {
          fetchedUserIdRef.current = sessionUser.id;
          fetchUserProfile(sessionUser.id);
        }
      }
      // Transient events (TOKEN_REFRESHED, SIGNED_OUT from tab wake lock contention) are ignored.
      // Explicit sign out is handled by signOut().
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 🔐 Fetch full profile from DB
  async function fetchUserProfile(userId: string) {
    try {
      setLoading(true);
      console.log("[AuthContext] Fetching user profile for userId:", userId);

      const { data, error } = await supabase
        .from("profiles")
        .select("role, department, year, semester, register_no")
        .eq("id", userId)
        .single();

      if (error) {
        console.warn("[AuthContext] Profile fetch error (RLS/network/missing row):", error);
        
        const fallbackRole = resolveRoleFromSources(
          role,
          localStorage.getItem("auth_role"),
          profile?.role,
          user?.user_metadata?.role,
          localStorage.getItem("pendingRole")
        );

        if (fallbackRole) {
          console.log("[AuthContext] Preserving role from fallback/existing state:", fallbackRole);
          updateRole(fallbackRole);
          setProfile((prev) => prev || {
            role: fallbackRole,
            department: localStorage.getItem("department") || localStorage.getItem("dept"),
            year: localStorage.getItem("year"),
            semester: localStorage.getItem("semester"),
            register_no: localStorage.getItem("login_register_no"),
          });
        } else if (role) {
          console.log("[AuthContext] Retaining current valid role during transient profile query error:", role);
        } else {
          console.error("[AuthContext] Could not resolve role from any source.");
        }
      } else {
        const resolvedDbRole = resolveRoleFromSources(
          data.role,
          role,
          localStorage.getItem("auth_role"),
          user?.user_metadata?.role,
          localStorage.getItem("pendingRole")
        );
        console.log("[AuthContext] Profile successfully loaded. Role:", resolvedDbRole);
        clearPendingRole();
        if (resolvedDbRole) {
          setUser((prev) =>
            prev
              ? ({
                  ...prev,
                  user_metadata: {
                    ...prev.user_metadata,
                    role: resolvedDbRole,
                  },
                } as User)
              : prev
          );
          updateRole(resolvedDbRole);
        }
        setProfile({
          role: resolvedDbRole,
          department: data.department || null,
          year: data.year || null,
          semester: data.semester || null,
          register_no: data.register_no || null,
        });
      }
    } catch (exception) {
      console.error("[AuthContext] Profile resolution exception:", exception);
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    clearAllUserScope()
    setUser(null)
    updateRole(null)
    setProfile(null)
    setLoading(false)
    window.location.replace("/login")
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        loading,
        signOut,
        profile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider")
  }
  return context
}