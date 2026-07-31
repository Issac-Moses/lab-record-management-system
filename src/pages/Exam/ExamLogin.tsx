import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { parseEffectiveEndMs, parseStartMs } from "@/lib/examWindow";
import { useToast } from "@/components/ui/ToastProvider";
import { GraduationCap, User, Hash, KeyRound, AlertCircle, Sparkles, ArrowLeft } from "lucide-react";

export default function ExamLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const [roomId, setRoomId] = useState("");
  const [studentName, setStudentName] = useState("");
  const [registerNo, setRegisterNo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const roomFromQuery = String(searchParams.get("room") || "").trim().toUpperCase();
    if (!roomFromQuery) return;
    setRoomId(roomFromQuery);
  }, [searchParams]);

  useEffect(() => {
    const autofillUserProfile = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { data: profile } = await supabase
          .from("profiles")
          .select("name, register_no")
          .eq("id", user.id)
          .maybeSingle();
        if (profile) {
          if (profile.name) setStudentName((prev) => prev || profile.name || "");
          if (profile.register_no) setRegisterNo((prev) => prev || profile.register_no || "");
        }
      } catch (err) {
        // Silent catch for optional profile autofill
      }
    };
    void autofillUserProfile();
  }, []);

  const handleJoin = async () => {
    try {
      const cleanRoomId = roomId.trim().toUpperCase();
      const cleanStudentName = studentName.trim();
      const cleanRegisterNo = registerNo.trim();

      if (!cleanRoomId || !cleanStudentName || !cleanRegisterNo) {
        setError("All fields are required");
        toast.error("Please complete all fields.");
        return;
      }

      setError("");
      setLoading(true);

      const now = new Date();
      const { data, error } = await supabase
        .from("exams")
        .select("*")
        .eq("room_id", cleanRoomId)
        .limit(1);

      if (error) {
        console.error(error);
        setError("Server error");
        toast.error("Unable to verify room right now.");
        setLoading(false);
        return;
      }

      if (!data || data.length === 0) {
        setError("Invalid Room ID");
        toast.error("Invalid room ID.");
        setLoading(false);
        return;
      }

      const exam = data[0];
      const startMs = parseStartMs(exam.start_time);
      const effectiveEndMs = parseEffectiveEndMs({
        start_time: exam.start_time,
        end_time: exam.end_time,
        duration_minutes: exam.duration_minutes,
      });
      const nowMs = now.getTime();

      if (startMs == null) {
        setError("Exam schedule is invalid");
        toast.error("This room has an invalid exam schedule.");
        setLoading(false);
        return;
      }

      if (nowMs < startMs) {
        setError("Exam not started yet");
        toast.info("Exam has not started yet.");
        setLoading(false);
        return;
      }

      if (effectiveEndMs == null) {
        setError("Exam schedule incomplete");
        toast.error("Faculty must set an end time or duration for this exam.");
        setLoading(false);
        return;
      }

      if (nowMs > effectiveEndMs) {
        setError("Exam ended");
        toast.error("This exam session has ended.");
        setLoading(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Please login before joining the exam.");
        toast.error("Please login before joining.");
        setLoading(false);
        return;
      }

      const { data: existingSubmission } = await supabase
        .from("exam_submissions")
        .select("id")
        .eq("exam_id", exam.id)
        .eq("student_id", user.id)
        .limit(1);

      if (existingSubmission && existingSubmission.length > 0) {
        toast.info("You have already submitted this exam.");
        setLoading(false);
        return;
      }

      localStorage.setItem("exam_room_id", exam.room_id);
      localStorage.setItem("exam_id", exam.id);
      localStorage.setItem("exam_student_name", cleanStudentName);
      localStorage.setItem("exam_register_no", cleanRegisterNo);
      localStorage.setItem("exam_start_time", String(Date.now()));

      setLoading(false);
      toast.success("Exam session started.");
      navigate(`/exam/${exam.id}/proctor`);
    } catch (joinError) {
      console.error("Failed to join exam:", joinError);
      setLoading(false);
      setError("Unable to join exam right now. Please try again.");
      toast.error("Unable to join exam right now.");
    }
  };

  return (
    <div className="faculty-bg-vibrant min-h-screen flex items-center justify-center overflow-hidden p-4 text-slate-900 relative">
      {/* Back Arrow Button (Top Left Corner) */}
      <button
        onClick={() => navigate(-1)}
        className="absolute top-6 left-6 flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors bg-white/50 backdrop-blur-md border border-slate-200/50 px-4 py-2 rounded-xl shadow-sm cursor-pointer z-50 animate-fade-in"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back</span>
      </button>

      {/* Decorative gradient orbs */}
      <div className="pointer-events-none absolute right-0 top-0 h-96 w-96 rounded-full bg-blue-200/60 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-80 w-80 rounded-full bg-indigo-200/60 blur-3xl" />

      <div className="w-full max-w-md relative">
        <div className="faculty-glass faculty-gradient-ring relative overflow-hidden rounded-2xl p-8">
          <div className="absolute inset-0 bg-card-shine pointer-events-none" />

          <div className="relative z-10">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/25">
                <GraduationCap className="w-7 h-7 text-white" />
              </div>
              <h1 className="bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-2xl font-bold text-transparent">
                Exam Login
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Enter room details to join the active exam session.
              </p>
            </div>

            {/* Inputs */}
            <div className="grid gap-4">
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2">
                  <KeyRound className="w-4 h-4 text-blue-500/70" />
                </div>
                <input
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  placeholder="Room ID"
                  className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-all focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2">
                  <User className="w-4 h-4 text-blue-500/70" />
                </div>
                <input
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="Student Name"
                  className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-all focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2">
                  <Hash className="w-4 h-4 text-blue-500/70" />
                </div>
                <input
                  value={registerNo}
                  onChange={(e) => setRegisterNo(e.target.value)}
                  placeholder="Register No"
                  className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-all focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            {/* Error */}
            {error ? (
              <div className="mt-4 flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
                {error.toLowerCase().includes("login") && (
                  <button
                    type="button"
                    onClick={() => navigate("/login")}
                    className="mt-1 flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 font-medium text-white transition hover:bg-amber-700"
                  >
                    Go to Student Login
                  </button>
                )}
              </div>
            ) : null}

            {/* Buttons */}
            <div className="mt-6 grid gap-3">
              <button
                onClick={() => void handleJoin()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 font-semibold text-white shadow-lg shadow-blue-500/20 transition-all hover:-translate-y-0.5 hover:shadow-blue-500/30 hover:brightness-110 disabled:opacity-60 disabled:hover:brightness-100"
                disabled={loading}
              >
                <Sparkles className="h-4 w-4 shrink-0 animate-pulse drop-shadow-sm" aria-hidden />
                {loading ? "Joining..." : "Join Exam"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
