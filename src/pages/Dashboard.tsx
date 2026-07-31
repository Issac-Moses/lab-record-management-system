import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { getRoleHomePath, resolveRoleFromSources } from "@/lib/authFlow";
import { motion } from "framer-motion";
import { Loader2, GraduationCap } from "lucide-react";

export default function Dashboard() {
  const navigate = useNavigate();

  useEffect(() => {
    const redirectByRole = async () => {
      // 1️⃣ get logged-in user
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError || !authData.user) {
        navigate("/login", { replace: true });
        return;
      }

      // 2️⃣ get role from profiles table
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .single();

      const resolvedRole = resolveRoleFromSources(
        profile?.role,
        authData.user.user_metadata?.role,
        localStorage.getItem("pendingRole")
      );

      if (profileError || !resolvedRole) {
        navigate("/login", { replace: true });
        return;
      }

      // 3️⃣ redirect based on role
      navigate(getRoleHomePath(resolvedRole), { replace: true });
    };

    redirectByRole();
  }, [navigate]);

  // UI loading screen
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl"
      >
        <div className="p-3 rounded-xl bg-blue-600/10 text-blue-400">
          <GraduationCap className="w-7 h-7" />
        </div>

        <h1 className="text-lg font-semibold">Redirecting</h1>
        <p className="text-sm text-slate-400 text-center">
          Checking your account and loading your dashboard...
        </p>

        <div className="flex items-center gap-2 mt-2 text-blue-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Please wait</span>
        </div>
      </motion.div>
    </div>
  );
}