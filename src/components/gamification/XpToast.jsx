import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";

export default function XpToast({ xpAmount = 0, message = "", visible = false, onComplete }) {
  useEffect(() => {
    if (!visible || typeof onComplete !== "function") return;
    const timer = setTimeout(onComplete, 3000);
    return () => clearTimeout(timer);
  }, [visible, onComplete]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed bottom-6 right-6 z-50 flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xl shadow-slate-300/40"
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-yellow-500">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-amber-600">+{xpAmount} XP</p>
            {message && <p className="mt-0.5 text-sm text-slate-600">{message}</p>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
