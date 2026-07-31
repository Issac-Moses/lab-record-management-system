import { motion } from "framer-motion";
import ShellCard from "@/components/admin/ShellCard";

export default function InsightCard({ icon, headline, metric, type = "blue" }) {
  return (
    <motion.div whileHover={{ y: -3 }}>
      <ShellCard glow={type}>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{headline}</p>
          <div className="text-slate-600">{icon}</div>
        </div>
        <p className="text-sm text-slate-800">{metric}</p>
      </ShellCard>
    </motion.div>
  );
}

