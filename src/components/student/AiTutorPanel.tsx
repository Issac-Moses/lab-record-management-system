import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Sparkles, X, Send, HelpCircle, BookOpen, Cpu, Terminal, FileText, Code2, AlertTriangle, Lightbulb, RefreshCw, ChevronDown, Move, MessageSquare } from "lucide-react";
import { supabase } from "@/lib/supabase";

export interface AiTutorPanelProps {
  experimentTitle?: string;
  aim?: string;
  procedure?: string;
  codeLanguage?: string;
  codeValue?: string;
  output?: string;
  expId?: string;
  role?: "student" | "faculty" | "admin";
}

interface Message {
  id: string;
  sender: "user" | "tutor";
  text: string;
  timestamp: string;
}

const STUDENT_QUICK_ACTIONS = [
  { label: "📖 Explain Aim", prompt: "Explain Aim" },
  { label: "📚 Explain Theory", prompt: "Explain Theory" },
  { label: "⚙ Explain Procedure", prompt: "Explain Procedure" },
  { label: "📝 Explain Algorithm", prompt: "Explain Algorithm" },
  { label: "📊 Explain Output", prompt: "Explain Output" },
  { label: "❌ Explain Common Errors", prompt: "Explain Common Errors" },
  { label: "🤖 Explain TensorFlow Program", prompt: "Explain TensorFlow Program" },
  { label: "💡 Give Hint", prompt: "Give Hint" },
];

const FACULTY_QUICK_ACTIONS = [
  { label: "🎓 Suggested Viva Questions", prompt: "Suggest viva questions for students" },
  { label: "📚 Teaching Notes", prompt: "Generate teaching notes and core concepts" },
  { label: "⚠️ Common Student Pitfalls", prompt: "Explain common student mistakes in this lab" },
  { label: "💡 Discussion Topics", prompt: "Suggest classroom discussion topics" },
  { label: "⚙ Expected Output Guide", prompt: "Explain expected output verification" },
];

const ADMIN_QUICK_ACTIONS = [
  { label: "📊 Confusion Statistics", prompt: "Which concepts confuse students most?" },
  { label: "📈 Daily AI Usage Trends", prompt: "Show daily AI usage statistics" },
  { label: "📝 Manual Improvements", prompt: "Suggest manual improvements based on student queries" },
];

const DAILY_LIMIT = 3;
const MANUAL_API_BASE_URL = import.meta.env.VITE_MANUAL_API_URL || "http://localhost:7001";

export default function AiTutorPanel({
  experimentTitle = "Experiment Workspace",
  aim = "",
  procedure = "",
  codeLanguage = "Python",
  codeValue = "",
  output = "",
  expId = "",
  role = "student",
}: AiTutorPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [userRole, setUserRole] = useState<"student" | "faculty" | "admin">(role);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      sender: "tutor",
      text: role === "faculty"
        ? "👨‍🏫 **Welcome Faculty Assistant!**\n\nAsk me for teaching notes, viva question ideas, classroom discussion topics, or common student pitfalls."
        : role === "admin"
          ? "📊 **Welcome Admin Analytics AI!**\n\nAsk me for student confusion statistics, daily AI usage trends, or suggested manual improvements."
          : "👋 **Hello! I'm your AI Lab Tutor.**\n\nAsk me any conceptual question or click a quick action chip above to learn without spoiling your code!",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [remainingRequests, setRemainingRequests] = useState<number>(DAILY_LIMIT);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Determine role from session if not explicitly passed
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const userMetaRole = String(session?.user?.user_metadata?.role || "").toLowerCase();
      if (userMetaRole === "faculty" || userMetaRole === "admin") {
        setUserRole(userMetaRole as "faculty" | "admin");
      }
    });
  }, []);

  // Fetch dynamic "Students Also Ask" questions for this experiment
  useEffect(() => {
    if (!experimentTitle) return;
    setSuggestedQuestions([
      `What is the primary aim of ${experimentTitle}?`,
      `Why is ${codeLanguage} used for this experiment?`,
      `What happens if a step in the procedure is skipped?`,
      `How do I verify if my output is correct?`,
      `What are the most common syntax errors in this experiment?`,
    ]);
  }, [experimentTitle, codeLanguage]);

  // Load usage state for today
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    const cacheKey = `ai_tutor_used_${today}`;
    const used = Number(localStorage.getItem(cacheKey) || 0);
    setRemainingRequests(Math.max(0, DAILY_LIMIT - used));
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isOpen]);

  const handleSendPrompt = async (promptToSend?: string) => {
    const textToSubmit = (promptToSend || inputPrompt).trim();
    if (!textToSubmit || loading || remainingRequests <= 0) return;

    const userMsg: Message = {
      id: String(Date.now()),
      sender: "user",
      text: textToSubmit,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!promptToSend) setInputPrompt("");
    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      // Try primary /api/ai/ask endpoint, fall back to /api/manual/ai-tutor
      let res = await fetch(`${MANUAL_API_BASE_URL}/api/ai/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token || ""}`,
        },
        body: JSON.stringify({
          prompt: textToSubmit,
          role: userRole,
          experimentTitle,
          aim,
          procedure,
          codeLanguage,
          codeValue,
          output,
          expId,
        }),
      });

      if (!res.ok) {
        res = await fetch(`${MANUAL_API_BASE_URL}/api/manual/ai-tutor`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token || ""}`,
          },
          body: JSON.stringify({
            prompt: textToSubmit,
            role: userRole,
            experimentTitle,
            aim,
            procedure,
            codeLanguage,
            codeValue,
            output,
            expId,
          }),
        });
      }

      const json = await res.json().catch(() => null);

      if (json?.success && json?.data) {
        const answer = String(json.data.answer || "No response generated.");
        const remaining = Number(json.data.remainingRequests ?? remainingRequests - 1);
        setRemainingRequests(remaining);

        const today = new Date().toISOString().split("T")[0];
        localStorage.setItem(`ai_tutor_used_${today}`, String(DAILY_LIMIT - remaining));

        const tutorMsg: Message = {
          id: String(Date.now() + 1),
          sender: "tutor",
          text: answer,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setMessages((prev) => [...prev, tutorMsg]);
      } else {
        const errorHint = json?.message || json?.error || "AI Tutor backend unavailable.";
        const tutorMsg: Message = {
          id: String(Date.now() + 1),
          sender: "tutor",
          text: `⚠️ **Notice**: ${errorHint}`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setMessages((prev) => [...prev, tutorMsg]);
      }
    } catch (_err) {
      const tutorMsg: Message = {
        id: String(Date.now() + 1),
        sender: "tutor",
        text: "💡 **Network Hint**: Unable to connect to AI Tutor API right now. Please check your connection.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, tutorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const activeQuickActions =
    userRole === "faculty"
      ? FACULTY_QUICK_ACTIONS
      : userRole === "admin"
        ? ADMIN_QUICK_ACTIONS
        : STUDENT_QUICK_ACTIONS;

  return (
    <>
      {/* Draggable & Movable Floating Action Button (FAB) */}
      <motion.div
        drag
        dragMomentum={false}
        dragConstraints={{ left: -window.innerWidth + 80, right: 0, top: -window.innerHeight + 80, bottom: 0 }}
        className="fixed bottom-6 right-6 z-50 cursor-grab active:cursor-grabbing"
      >
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.94 }}
          onClick={() => setIsOpen(!isOpen)}
          className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white shadow-[0_12px_28px_rgba(37,99,235,0.35)] transition-all hover:shadow-[0_16px_36px_rgba(37,99,235,0.45)] border border-white/30"
          title="Ask AI Tutor (Drag anywhere to reposition)"
        >
          {isOpen ? (
            <ChevronDown className="h-6 w-6" />
          ) : (
            <>
              <Bot className="h-6 w-6" />
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-amber-950 ring-2 ring-white">
                <Sparkles className="h-2.5 w-2.5" />
              </span>
            </>
          )}
        </motion.button>
      </motion.div>

      {/* Slide-Up Panel / Drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="fixed bottom-24 right-6 z-50 flex h-[540px] w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 backdrop-blur-xl shadow-[0_20px_50px_rgba(15,23,42,0.18)]"
          >
            {/* Panel Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-white px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    {userRole === "faculty"
                      ? "AI Faculty Assistant"
                      : userRole === "admin"
                        ? "AI Admin Analytics"
                        : "AI Lab Tutor"}
                    <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                      {userRole === "student" ? "Socratic" : userRole}
                    </span>
                  </h3>
                  <p className="text-[11px] font-medium text-slate-500">
                    AI Requests Remaining: {remainingRequests} / {DAILY_LIMIT}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Quick Action Chips */}
            <div className="border-b border-slate-100 bg-slate-50/60 p-2.5 overflow-x-auto scrollbar-none">
              <div className="flex flex-wrap gap-1.5">
                {activeQuickActions.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => handleSendPrompt(action.prompt)}
                    disabled={loading || remainingRequests <= 0}
                    className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs cursor-pointer"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>

            {/* "Students Also Ask" Dynamic Doubts Section (For Students) */}
            {userRole === "student" && suggestedQuestions.length > 0 && (
              <div className="border-b border-slate-100 bg-blue-50/40 p-2.5">
                <p className="text-[10px] font-bold text-blue-800 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <MessageSquare className="h-3 w-3 text-blue-600" />
                  Students Also Ask
                </p>
                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  {suggestedQuestions.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendPrompt(q)}
                      disabled={loading || remainingRequests <= 0}
                      className="shrink-0 rounded-lg border border-blue-200/80 bg-white px-2 py-1 text-[10.5px] text-blue-800 hover:bg-blue-600 hover:text-white transition disabled:opacity-50 cursor-pointer"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.sender === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl p-3 text-xs leading-relaxed ${
                      msg.sender === "user"
                        ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-br-none shadow-xs"
                        : "bg-white border border-slate-200/80 text-slate-800 rounded-bl-none shadow-xs whitespace-pre-wrap font-sans"
                    }`}
                  >
                    {msg.text}
                  </div>
                  <span className="mt-1 px-1 text-[10px] text-slate-400">{msg.timestamp}</span>
                </div>
              ))}

              {loading && (
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white p-3 text-xs text-slate-500 shadow-xs max-w-[85%]">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-600" />
                  <span>Analyzing experiment context & concepts...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Daily Limit Warning Banner if exhausted */}
            {remainingRequests <= 0 && (
              <div className="bg-amber-50 border-t border-amber-200 px-3 py-2 text-[11px] font-semibold text-amber-800 text-center">
                You have reached today's AI Tutor limit (3/3 used). Please try again tomorrow.
              </div>
            )}

            {/* Input Box */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendPrompt();
              }}
              className="border-t border-slate-100 bg-white p-3 flex items-center gap-2"
            >
              <input
                type="text"
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                disabled={loading || remainingRequests <= 0}
                placeholder={
                  remainingRequests > 0
                    ? "Ask a conceptual question..."
                    : "Limit reached (3/3 requests used)"
                }
                className="flex-1 rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 focus:bg-white disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!inputPrompt.trim() || loading || remainingRequests <= 0}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs transition hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
