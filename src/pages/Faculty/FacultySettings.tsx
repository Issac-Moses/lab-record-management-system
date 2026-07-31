import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";
import { AlertCircle, Mail, User, Building2, Calendar, BookOpen, RefreshCw, ShieldCheck } from "lucide-react";
import NotificationComposerCard from "@/components/notifications/NotificationComposerCard";
import { formatDepartmentName } from "@/utils/departmentLabel";

type Profile = {
  name: string | null;
  email: string | null;
  department: string | null;
  year: string | null;
  semester: string | null;
};

function getFacultyInitials(name: string) {
  const cleaned = String(name || "")
    .replace(/[.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "F";
  const titleWords = new Set(["mr", "mrs", "ms", "miss", "dr", "prof", "sir", "madam"]);
  const tokens = cleaned
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token && !titleWords.has(token.toLowerCase()));
  const source = tokens.length > 0 ? tokens : cleaned.split(" ");
  return source
    .map((part) => part[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function FacultySettings() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;
        if (!user) throw new Error("Not authenticated");

        const { data, error: profileError } = await supabase
          .from("profiles")
          .select("name, email, department, year, semester")
          .eq("id", user.id)
          .single();

        if (profileError) throw profileError;

        if (mounted) {
          setProfile({
            name: data?.name ?? null,
            email: data?.email ?? user.email ?? null,
            department: data?.department ?? null,
            year: data?.year ?? null,
            semester: data?.semester ?? null,
          });
          setLoading(false);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message || "Failed to load profile");
          setLoading(false);
        }
      }
    }

    loadProfile();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 h-5 w-32 animate-pulse rounded bg-slate-200" />
          <div className="space-y-3">
            <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
            <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
            <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center shadow-sm">
          <AlertCircle className="mx-auto mb-2 h-5 w-5 text-rose-600" />
          <p className="text-sm font-semibold text-rose-700">Unable to load data</p>
          <p className="mt-1 text-sm text-rose-600">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm text-rose-700 hover:bg-rose-100"
          >
            <RefreshCw className="h-4 w-4" />
            Reload
          </button>
        </div>
      </div>
    );
  }

  const safeName = String(profile?.name || "Faculty Member").trim();
  const initials = getFacultyInitials(safeName);
  const departmentLabel = formatDepartmentName(profile?.department, "Not set");

  return (
    <div className="mx-auto max-w-4xl text-slate-800">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="space-y-6"
      >
        <div className="faculty-glass faculty-gradient-ring rounded-3xl p-6 md:p-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-lg font-bold text-white shadow-md">
                {initials || "F"}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Profile</h1>
                <p className="mt-1 text-sm text-slate-600">View your account details</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              Verified Faculty Account
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <TopPill label="Department" value={departmentLabel} tone="indigo" />
            <TopPill label="Year" value={String(profile?.year || "Not set")} tone="amber" />
            <TopPill label="Semester" value={String(profile?.semester || "Not set")} tone="blue" />
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2"
        >
          <ProfileFieldCard
            icon={<User className="h-5 w-5 text-blue-600" />}
            label="Name"
            value={profile?.name || "Not set"}
          />
          <ProfileFieldCard
            icon={<Mail className="h-5 w-5 text-emerald-600" />}
            label="Email"
            value={profile?.email || "Not available"}
          />
          <ProfileFieldCard
            icon={<Building2 className="h-5 w-5 text-indigo-600" />}
            label="Department"
            value={departmentLabel}
          />
          <ProfileFieldCard
            icon={<Calendar className="h-5 w-5 text-amber-600" />}
            label="Year"
            value={profile?.year || "Not set"}
          />
          <ProfileFieldCard
            icon={<BookOpen className="h-5 w-5 text-blue-600" />}
            label="Semester"
            value={profile?.semester || "Not set"}
          />
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Account Note</p>
            <p className="mt-1 text-sm text-slate-700">
              If any profile detail is incorrect, contact admin for profile updates.
            </p>
          </div>
        </motion.div>

        <NotificationComposerCard
          title="Send Student Information Message"
          defaultDepartment={departmentLabel === "Not set" ? "" : departmentLabel}
        />
      </motion.div>
    </div>
  );
}

function TopPill({
  label,
  value,
  tone = "indigo",
}: {
  label: string;
  value: string;
  tone?: "indigo" | "amber" | "blue";
}) {
  const toneMap = {
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
  };
  return (
    <div className={`rounded-xl border px-3 py-2 ${toneMap[tone] || toneMap.indigo}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value || "-"}</p>
    </div>
  );
}

function ProfileFieldCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-slate-300">
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 rounded-lg bg-slate-100 p-2">{icon}</div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-slate-800">{value}</p>
        </div>
      </div>
    </div>
  );
}
