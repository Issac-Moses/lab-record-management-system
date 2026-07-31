import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";
import {
  Activity,
  BookOpenCheck,
  ClipboardCheck,
  GraduationCap,
  Layers3,
  Lock,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resolveRoleFromSources, type AppRole } from "@/lib/authFlow";

type LoginMode = "student" | "faculty" | "admin";

const LOGIN_THROTTLE_LIMIT = 3;
const LOGIN_THROTTLE_MS = 20_000;

interface LoginProps {
  mode?: LoginMode;
}

type SurfaceConfig = {
  headline: string;
  description: string;
  bullets: string[];
  formTitle: string;
  helperText: string;
  fieldLabel: string;
  fieldPlaceholder: string;
  securityNote: string;
  backgroundClass: string;
  panelClass: string;
  cardClass: string;
  widgetTitle: string;
  widgetSubtitle: string;
};

function isNetworkFailure(error: unknown): boolean {
  const blob = JSON.stringify(error || {}).toLowerCase();
  const message = (error as { message?: string } | null)?.message?.toLowerCase() || "";
  const combined = `${blob} ${message}`;
  return (
    combined.includes("failed to fetch") ||
    combined.includes("err_network_changed") ||
    combined.includes("err_address_unreachable") ||
    combined.includes("err_internet_disconnected") ||
    combined.includes("err_name_not_resolved") ||
    combined.includes("network")
  );
}

function resetSetupAndSubjectScope() {
  localStorage.removeItem("department");
  localStorage.removeItem("dept");
  localStorage.removeItem("admin_department");
  localStorage.removeItem("year");
  localStorage.removeItem("semester");
  localStorage.removeItem("student_subject_id");
  localStorage.removeItem("student_subject_name");
  localStorage.removeItem("selectedSubjectId");
  localStorage.removeItem("selectedSubjectName");
  localStorage.removeItem("studentSelectedSubjectId");
  localStorage.removeItem("studentSelectedSubjectName");
  localStorage.removeItem("faculty_subject_id");
  localStorage.removeItem("faculty_subject_name");
}

function applyRolePreparation(role: AppRole, registerNo?: string) {
  localStorage.setItem("pendingRole", role);
  if (role === "student") {
    localStorage.setItem("force_student_subject_select", "1");
  } else {
    localStorage.removeItem("force_student_subject_select");
  }
  if (role === "faculty") {
    localStorage.setItem("force_faculty_subject_select", "1");
  } else {
    localStorage.removeItem("force_faculty_subject_select");
  }
  localStorage.removeItem("force_admin_department_select");
  if (role === "student" && registerNo) {
    localStorage.setItem("login_register_no", registerNo);
  } else {
    localStorage.removeItem("login_register_no");
  }
}

const surfaces: Record<LoginMode, SurfaceConfig> = {
  student: {
    headline: "Digital Lab Workspace",
    description:
      "Continue writing and submitting your lab experiments in a structured digital environment.",
    bullets: [
      "Experiment Writing",
      "Submission Tracking",
      "Internal Marks & Feedback",
    ],
    formTitle: "Student Login",
    helperText: "Sign in to continue your lab workflow.",
    fieldLabel: "Register Number or Email",
    fieldPlaceholder: "Enter register number or institutional email",
    securityNote: "Secure academic authentication.",
    backgroundClass: "bg-gradient-to-br from-blue-50 via-slate-50 to-indigo-100",
    panelClass: "border-blue-100/80 bg-white/70",
    cardClass: "border-white/70 bg-white/88",
    widgetTitle: "Student experiment dashboard",
    widgetSubtitle: "Draft writing, progress tracking, and submission status in one view.",
  },
  faculty: {
    headline: "Faculty Evaluation Portal",
    description:
      "Review student submissions, validate experiments, and assign internal marks.",
    bullets: [
      "Pending Submissions",
      "Evaluation Queue",
      "Marks Assignment Interface",
    ],
    formTitle: "Faculty Login",
    helperText: "Authorized faculty members only.",
    fieldLabel: "Faculty Email",
    fieldPlaceholder: "faculty@institution.edu",
    securityNote: "Secure academic authentication.",
    backgroundClass: "bg-gradient-to-br from-indigo-50 via-slate-50 to-blue-100",
    panelClass: "border-indigo-100/80 bg-white/70",
    cardClass: "border-white/70 bg-white/88",
    widgetTitle: "Faculty review dashboard",
    widgetSubtitle: "Validate submissions and publish feedback faster.",
  },
  admin: {
    headline: "System Administration Access",
    description:
      "Manage subjects, users, and academic workflow across the institution.",
    bullets: [
      "Academic Control Center",
      "Department Workflow Monitoring",
      "User and Role Governance",
    ],
    formTitle: "Admin Login",
    helperText: "Administrative access required.",
    fieldLabel: "Admin Email",
    fieldPlaceholder: "admin@institution.edu",
    securityNote: "Secure academic authentication.",
    backgroundClass: "bg-gradient-to-br from-slate-100 via-white to-indigo-100",
    panelClass: "border-emerald-100/80 bg-white/70",
    cardClass: "border-white/70 bg-white/88",
    widgetTitle: "Administrative operations panel",
    widgetSubtitle: "Oversee users, subjects, and institutional performance securely.",
  },
};

export default function Login({ mode = "student" }: LoginProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const autoLoginTriedRef = useRef(false);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuccessState, setShowSuccessState] = useState(false);
  const [, setFailedAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [showStaffAccess, setShowStaffAccess] = useState(false);

  const isStudentMode = mode === "student";
  const isAdminMode = mode === "admin";
  const isDarkSurface = false;
  const surface = surfaces[mode];
  const isLocked = lockUntil > now;
  const secondsLeft = Math.max(0, Math.ceil((lockUntil - now) / 1000));

  useEffect(() => {
    if (!isLocked) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isLocked]);

  useEffect(() => {
    if (!isStudentMode) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "l") {
        event.preventDefault();
        setShowStaffAccess((prev) => !prev);
      }
      if (event.key === "Escape") {
        setShowStaffAccess(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isStudentMode]);

  function registerFailedAttempt() {
    setFailedAttempts((prev) => {
      const next = prev + 1;
      if (next >= LOGIN_THROTTLE_LIMIT) {
        setLockUntil(Date.now() + LOGIN_THROTTLE_MS);
        return 0;
      }
      return next;
    });
  }

  async function resolveEmailFromIdentifier(rawIdentifier: string): Promise<string | null> {
    const normalizedIdentifier = rawIdentifier.trim().toLowerCase();
    if (!normalizedIdentifier) return null;
    if (normalizedIdentifier.includes("@")) return normalizedIdentifier;

    const { data, error: lookupError } = await supabase
      .from("profiles")
      .select("email, register_no")
      .ilike("register_no", normalizedIdentifier)
      .maybeSingle();

    if (lookupError) {
      throw lookupError;
    }
    const resolvedEmail = String(data?.email || "").trim().toLowerCase();
    return resolvedEmail || null;
  }

  async function performLogin(inputIdentifier: string, inputPassword: string) {
    setError("");
    const normalizedIdentifier = inputIdentifier.trim();
    const normalizedPassword = inputPassword.trim();
    const normalizedRegisterNo =
      !normalizedIdentifier.includes("@") && isStudentMode
        ? normalizedIdentifier.toLowerCase()
        : "";

    if (!normalizedIdentifier || !normalizedPassword) {
      setError("Please enter credentials to continue.");
      return;
    }
    if (isLocked) {
      setError(`Too many attempts. Try again in ${secondsLeft}s.`);
      return;
    }

    setLoading(true);

    try {
      let loginEmail: string | null = null;
      try {
        loginEmail = await resolveEmailFromIdentifier(normalizedIdentifier);
      } catch (lookupError) {
        setError(
          isNetworkFailure(lookupError)
            ? "Network issue while validating credentials. Check your internet and try again."
            : "Unable to validate credentials right now."
        );
        setLoading(false);
        registerFailedAttempt();
        return;
      }

      if (!loginEmail) {
        setError(
          isStudentMode
            ? "Invalid email or register number."
            : "Invalid institutional email."
        );
        setLoading(false);
        registerFailedAttempt();
        return;
      }

      const signInResult = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: normalizedPassword,
      });

      if (signInResult.error || !signInResult.data.user) {
        const authMessage = String(signInResult.error?.message || "").toLowerCase();
        const friendlyInvalidMessage = authMessage.includes("invalid login credentials")
          ? "Invalid credentials."
          : signInResult.error?.message || "Unable to sign in.";
        setError(
          isNetworkFailure(signInResult.error)
            ? "Network issue while contacting authentication server. Check internet and try again."
            : friendlyInvalidMessage
        );
        setLoading(false);
        registerFailedAttempt();
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, register_no")
        .eq("id", signInResult.data.user.id)
        .single();

      if (profileError) {
        await supabase.auth.signOut();
        setError(
          isNetworkFailure(profileError)
            ? "Signed in, but profile verification failed due to network issue. Please retry."
            : "Unable to verify account role. Please contact support."
        );
        setLoading(false);
        registerFailedAttempt();
        return;
      }

      const resolvedRole = resolveRoleFromSources(
        profile?.role,
        signInResult.data.user.user_metadata?.role
      );

      if (!resolvedRole) {
        await supabase.auth.signOut();
        setError("Unable to determine account role. Please contact support.");
        setLoading(false);
        registerFailedAttempt();
        return;
      }

      const resolvedRoleStr = String(resolvedRole || "").toLowerCase();
      const isRoleAuthorized =
        resolvedRole === mode ||
        (mode === "faculty" && (resolvedRoleStr === "admin" || resolvedRoleStr === "hod")) ||
        (mode === "admin" && (resolvedRoleStr === "faculty" || resolvedRoleStr === "hod"));

      if (!isRoleAuthorized) {
        await supabase.auth.signOut();
        if (mode === "student") {
          setError(
            "This account belongs to a restricted portal. Please use your dedicated login URL."
          );
        } else {
          setError(`This account is not authorized for the ${surface.formTitle} portal.`);
        }
        setLoading(false);
        registerFailedAttempt();
        return;
      }

      const profileRegisterNo = String(profile?.register_no || "").trim().toLowerCase();
      if (normalizedRegisterNo && profileRegisterNo !== normalizedRegisterNo) {
        await supabase.auth.signOut();
        setError("Register number does not match this account.");
        setLoading(false);
        registerFailedAttempt();
        return;
      }

      resetSetupAndSubjectScope();
      localStorage.setItem("auth_role", resolvedRole);
      applyRolePreparation(resolvedRole, profileRegisterNo || undefined);
      setFailedAttempts(0);
      setLockUntil(0);
      setShowSuccessState(true);
      await new Promise((resolve) => window.setTimeout(resolve, 420));
      navigate("/auth/callback", { replace: true });
    } catch (signInException) {
      setError(
        isNetworkFailure(signInException)
          ? "Network issue while contacting authentication server. Check internet and try again."
          : "Unable to sign in right now. Please try again."
      );
      registerFailedAttempt();
    } finally {
      setShowSuccessState(false);
      setLoading(false);
    }
  }

  useEffect(() => {
    if (autoLoginTriedRef.current) return;

    const idFromQuery = String(
      searchParams.get("identifier") ||
        searchParams.get("email") ||
        searchParams.get("register_no") ||
        searchParams.get("registerNo") ||
        ""
    ).trim();
    if (!idFromQuery) return;
    autoLoginTriedRef.current = true;
    setIdentifier(idFromQuery);
  }, [searchParams]);

  async function onForgotPassword() {
    setError("");
    const emailValue = identifier.trim().toLowerCase();
    if (!emailValue || !emailValue.includes("@")) {
      setError("Enter your institutional email to receive a reset link.");
      return;
    }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(emailValue, {
      redirectTo: `${window.location.origin}/login`,
    });
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setError("Password reset link sent. Check your institutional inbox.");
  }

  return (
    <div className={`relative min-h-screen overflow-hidden ${surface.backgroundClass}`}>
      <div
        className="absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(59,130,246,0.13) 1px, transparent 1px), linear-gradient(to bottom, rgba(59,130,246,0.13) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      <div
        className={`absolute -top-24 -left-24 h-80 w-80 rounded-full ${
          isDarkSurface ? "bg-indigo-500/20" : "bg-blue-300/30"
        } blur-3xl`}
      />
      <div
        className={`absolute -bottom-24 -right-20 h-80 w-80 rounded-full ${
          isDarkSurface ? "bg-blue-500/20" : "bg-indigo-300/30"
        } blur-3xl`}
      />

      <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-6xl items-center gap-10 px-6 py-10 lg:grid-cols-2 lg:gap-14 lg:px-10">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className={`relative space-y-5 rounded-3xl border p-6 shadow-lg backdrop-blur-sm md:p-8 ${surface.panelClass}`}
        >
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
              isDarkSurface ? "bg-slate-700 text-slate-100" : "bg-blue-100 text-blue-700"
            }`}
          >
            <GraduationCap className="h-4 w-4" />
            Digital Lab Record & Internal Evaluation System
          </span>
          <h1
            className={`text-3xl font-extrabold leading-tight md:text-4xl ${
              isDarkSurface ? "text-white" : "text-slate-900"
            }`}
          >
            {surface.headline}
          </h1>
          <p className={`max-w-lg ${isDarkSurface ? "text-slate-300" : "text-slate-600"}`}>
            {surface.description}
          </p>
          <ul className="space-y-2">
            {surface.bullets.map((bullet) => (
              <li
                key={bullet}
                className={`flex items-center gap-2 text-sm ${
                  isDarkSurface ? "text-slate-200" : "text-slate-700"
                }`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${
                    isDarkSurface ? "bg-slate-700 text-slate-200" : "bg-blue-100 text-blue-700"
                  }`}
                >
                  <BookOpenCheck className="h-3.5 w-3.5" />
                </span>
                {bullet}
              </li>
            ))}
          </ul>
          <div
            className={`relative mt-6 hidden max-w-md rounded-2xl border p-5 shadow-md backdrop-blur-sm md:block ${
              isDarkSurface ? "border-slate-500/60 bg-slate-800/55" : "border-blue-100 bg-white/80"
            }`}
          >
            <div
              className={`mb-3 inline-flex rounded-xl p-2.5 ${
                isDarkSurface ? "bg-slate-700 text-slate-100" : "bg-blue-100 text-blue-700"
              }`}
            >
              {mode === "faculty" ? (
                <ClipboardCheck className="h-5 w-5" />
              ) : mode === "admin" ? (
                <Layers3 className="h-5 w-5" />
              ) : (
                <BookOpenCheck className="h-5 w-5" />
              )}
            </div>
            <p
              className={`text-sm font-semibold ${
                isDarkSurface ? "text-white" : "text-slate-800"
              }`}
            >
              {surface.widgetTitle}
            </p>
            <p className={`mt-1 text-xs ${isDarkSurface ? "text-slate-300" : "text-slate-600"}`}>
              {surface.widgetSubtitle}
            </p>
            <div className="mt-4 space-y-2">
              <div className={`h-2.5 rounded ${isDarkSurface ? "bg-slate-600" : "bg-slate-100"}`} />
              <div
                className={`h-2.5 w-11/12 rounded ${
                  isDarkSurface ? "bg-slate-600" : "bg-slate-100"
                }`}
              />
              <div
                className={`h-2.5 w-9/12 rounded ${
                  isDarkSurface ? "bg-slate-600" : "bg-slate-100"
                }`}
              />
            </div>
          </div>

          <motion.div
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 4.8, repeat: Infinity, ease: "easeInOut" }}
            className={`pointer-events-none absolute right-2 top-4 hidden rounded-xl border px-3 py-2 shadow-sm lg:block ${
              isDarkSurface ? "border-slate-500/60 bg-slate-800/80" : "border-blue-100 bg-white/90"
            }`}
          >
            <p className={`text-[11px] font-semibold ${isDarkSurface ? "text-slate-100" : "text-slate-700"}`}>
              Experiment Draft Saved
            </p>
          </motion.div>
          <motion.div
            animate={{ y: [0, 4, 0] }}
            transition={{ duration: 5.1, repeat: Infinity, ease: "easeInOut" }}
            className={`pointer-events-none absolute -right-4 bottom-6 hidden rounded-xl border px-3 py-2 shadow-sm lg:block ${
              isDarkSurface ? "border-slate-500/60 bg-slate-800/80" : "border-indigo-100 bg-white/90"
            }`}
          >
            <p className={`text-[11px] font-semibold ${isDarkSurface ? "text-slate-100" : "text-slate-700"}`}>
              Marks Published
            </p>
          </motion.div>
          {mode === "faculty" && (
            <motion.div
              animate={{ y: [0, -3, 0] }}
              transition={{ duration: 4.7, repeat: Infinity, ease: "easeInOut" }}
              className="pointer-events-none absolute -left-5 top-1/2 hidden rounded-xl border border-indigo-100 bg-white/90 px-3 py-2 shadow-sm lg:block"
            >
              <p className="text-[11px] font-semibold text-slate-700">Pending Faculty Reviews</p>
            </motion.div>
          )}
        </motion.section>

        <motion.form
          autoComplete="on"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void performLogin(identifier, password);
          }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className={`relative rounded-2xl border p-6 shadow-xl backdrop-blur-sm transition-all duration-200 hover:shadow-2xl sm:p-8 ${surface.cardClass}`}
        >
          <div className="mb-6 flex items-center gap-3">
            <div className={`rounded-xl p-2 ${isAdminMode ? "bg-slate-100 text-slate-700" : "bg-blue-100 text-blue-700"}`}>
              {isAdminMode ? <ShieldCheck className="h-5 w-5" /> : <GraduationCap className="h-5 w-5" />}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">{surface.formTitle}</h2>
              <p className="text-xs text-slate-500">{surface.helperText}</p>
            </div>
          </div>

          <label className="mb-2 block text-sm font-medium text-slate-700">{surface.fieldLabel}</label>
          <div className="relative mb-4">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={surface.fieldPlaceholder}
              className="bg-white pl-10 text-base text-slate-900 placeholder:text-slate-400 transition-all duration-200 focus-visible:ring-blue-400/50"
            />
          </div>

          <label className="mb-2 block text-sm font-medium text-slate-700">Password</label>
          <div className="relative mb-2">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="bg-white pl-10 text-base text-slate-900 placeholder:text-slate-400 transition-all duration-200 focus-visible:ring-blue-400/50"
            />
          </div>
          <p className="mb-5 flex items-center gap-1.5 text-xs text-slate-500">
            <Lock className="h-3.5 w-3.5" />
            {surface.securityNote}
          </p>

          <Button
            type="submit"
            className="w-full rounded-xl bg-blue-600 py-5 text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-blue-700"
            disabled={loading || isLocked}
          >
            {loading || showSuccessState
              ? "Signing you in..."
              : isLocked
                ? `Try again in ${secondsLeft}s`
                : "Login to Workspace"}
          </Button>

          <div className="mt-4 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={onForgotPassword}
              className="text-blue-600 hover:text-blue-700 hover:underline"
            >
              Forgot Password
            </button>
            <a href="mailto:support@labrecord.local" className="text-slate-600 hover:text-slate-800 hover:underline">
              Need help?
            </a>
          </div>

          {isStudentMode && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-center">
              <p className="text-[11px] text-slate-500">Faculty or admin?</p>
              <button
                type="button"
                onClick={() => setShowStaffAccess(true)}
                className="mt-1 text-sm font-semibold text-indigo-700 underline-offset-2 hover:text-indigo-800 hover:underline"
              >
                Open staff login options
              </button>
              <p className="mt-1 hidden text-[10px] text-slate-400 sm:block">
                Shortcut (student screen): ⌘⇧L · Ctrl+Shift+L
              </p>
            </div>
          )}

          {(mode === "admin" || mode === "faculty") && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {mode === "admin"
                ? "Administrative access required."
                : "Authorized faculty members only."}
            </p>
          )}

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
          <div className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
            <Activity className="h-3.5 w-3.5" />
            Protected session with role-aware routing
          </div>
        </motion.form>
      </div>

      {isStudentMode && showStaffAccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-900">Staff Access Links</h3>
            <p className="mt-1 text-xs text-slate-500">For internal faculty/admin use only.</p>
            <p className="mt-2 text-[11px] text-slate-400">
              You can also bookmark these paths:{" "}
              <span className="font-mono text-slate-600">/faculty/login</span> ·{" "}
              <span className="font-mono text-slate-600">/admin/login</span>
            </p>
            <div className="mt-4 space-y-2">
              <Link
                to="/faculty/login"
                className="block rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100"
              >
                Open Faculty Login
              </Link>
              <Link
                to="/admin/login"
                className="block rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
              >
                Open Admin Login
              </Link>
            </div>
            <button
              type="button"
              onClick={() => setShowStaffAccess(false)}
              className="mt-4 w-full rounded-lg border border-slate-200 bg-slate-50 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}