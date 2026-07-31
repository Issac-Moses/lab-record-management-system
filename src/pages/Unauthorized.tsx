import { ShieldAlert, LogOut, GraduationCap, ShieldCheck, User } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { clearStaleAuthStorage } from "@/lib/clientSession";

export default function Unauthorized() {
  const handleResetSession = async () => {
    try {
      clearStaleAuthStorage();
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Error signing out:", e);
    }
    window.location.replace("/faculty/login");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4">
      <div className="bg-slate-950/80 backdrop-blur p-8 rounded-2xl shadow-2xl text-center max-w-md w-full border border-slate-800">
        <div className="flex justify-center mb-4 text-red-500">
          <ShieldAlert size={48} />
        </div>

        <h1 className="text-2xl font-bold mb-2">Portal Access Restricted</h1>
        <p className="text-slate-400 text-sm mb-6">
          You are currently signed in with an account that does not have permission to view this portal, or your browser role session needs to be reset.
        </p>

        <div className="flex flex-col gap-2.5">
          <Link
            to="/faculty/login"
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 transition text-white py-2.5 px-4 rounded-xl font-medium text-sm shadow-md"
          >
            <GraduationCap className="h-4 w-4" />
            Faculty Portal Login
          </Link>

          <Link
            to="/login"
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 transition text-white py-2.5 px-4 rounded-xl font-medium text-sm shadow-md"
          >
            <User className="h-4 w-4" />
            Student Portal Login
          </Link>

          <Link
            to="/admin/login"
            className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 transition text-white py-2.5 px-4 rounded-xl font-medium text-sm border border-slate-700"
          >
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Admin Portal Login
          </Link>

          <button
            onClick={handleResetSession}
            className="w-full mt-2 flex items-center justify-center gap-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition py-2.5 px-4 rounded-xl font-medium text-sm"
          >
            <LogOut className="h-4 w-4" />
            Reset Session & Re-Login
          </button>
        </div>

        <div className="mt-6 text-xs text-slate-500">
          Lab Record System • Secure Access Control
        </div>
      </div>
    </div>
  );
}
