import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function BackButton({ className = "", label = "Back" }) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate(-1)}
      title="Go to previous page"
      className={`group inline-flex items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm backdrop-blur transition hover:border-blue-300 hover:bg-blue-50/80 hover:text-blue-700 active:scale-95 shrink-0 ${className}`}
    >
      <ArrowLeft className="h-3.5 w-3.5 text-slate-500 transition-transform group-hover:-translate-x-0.5 group-hover:text-blue-600" />
      <span>{label}</span>
    </button>
  );
}
