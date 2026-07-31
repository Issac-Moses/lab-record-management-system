import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";

type ToastType = "success" | "error" | "info" | "warning";

type ToastItem = {
  id: string;
  type: ToastType;
  message: string;
};

type ToastContextType = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
};

const ToastContext = createContext<ToastContextType | undefined>(undefined);

function getToastStyles(type: ToastType): string {
  if (type === "success") {
    return "border-emerald-500/40 bg-emerald-500/15 text-emerald-200";
  }
  if (type === "error") {
    return "border-rose-500/40 bg-rose-500/15 text-rose-200";
  }
  if (type === "warning") {
    return "border-amber-500/40 bg-amber-500/15 text-amber-200";
  }
  return "border-sky-500/40 bg-sky-500/15 text-sky-200";
}

function ToastIcon({ type }: { type: ToastType }) {
  if (type === "success") return <CheckCircle2 className="h-4 w-4" />;
  if (type === "error") return <AlertCircle className="h-4 w-4" />;
  if (type === "warning") return <AlertCircle className="h-4 w-4 text-amber-400" />;
  return <Info className="h-4 w-4" />;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((type: ToastType, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setItems((prev) => [...prev, { id, type, message }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  }, []);

  const contextValue = useMemo(
    () => ({
      success: (message: string) => push("success", message),
      error: (message: string) => push("error", message),
      info: (message: string) => push("info", message),
      warning: (message: string) => push("warning", message),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(90vw,22rem)] flex-col gap-2"
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {items.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 24, y: 8 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, x: 24, y: -4 }}
              transition={{ type: "spring", stiffness: 280, damping: 24 }}
              className={`pointer-events-auto flex items-start gap-2 rounded-xl border px-3 py-2 text-sm shadow-xl ${getToastStyles(toast.type)}`}
            >
              <ToastIcon type={toast.type} />
              <p className="leading-5">{toast.message}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return context;
}
