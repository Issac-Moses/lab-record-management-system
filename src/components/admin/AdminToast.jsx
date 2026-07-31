import { motion, AnimatePresence } from "framer-motion";

export default function AdminToast({ toasts, onDismiss }) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 space-y-2">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            className={`pointer-events-auto min-w-[260px] rounded-xl border px-4 py-3 text-sm shadow-xl ${
              toast.type === "success"
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-100"
                : toast.type === "warning"
                  ? "border-amber-500/40 bg-amber-500/15 text-amber-100"
                  : "border-rose-500/40 bg-rose-500/15 text-rose-100"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <p>{toast.message}</p>
              <button
                onClick={() => onDismiss(toast.id)}
                className="rounded px-1 text-xs opacity-80 hover:opacity-100"
              >
                ✕
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
