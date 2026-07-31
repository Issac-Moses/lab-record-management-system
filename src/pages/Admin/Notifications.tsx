import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Clock, MessageSquare, Shield, Inbox, Send } from "lucide-react";
import NotificationComposerCard from "@/components/notifications/NotificationComposerCard";
import { getAdminInboxNotifications } from "@/services/studentNotificationsService";
import AdminShell from "@/layouts/AdminShell";



function formatTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-GB");
}

function SourceBadge({ role }: { role?: string }) {
  if (role === "faculty") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
        <MessageSquare className="h-2.5 w-2.5" />
        Faculty
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
      <Shield className="h-2.5 w-2.5" />
      Admin
    </span>
  );
}

function NotificationsContent() {
  const [messages, setMessages] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    const result = await getAdminInboxNotifications(30);
    if (result.success) {
      setMessages(
        result.data.map((item) => ({
          id: item.id,
          title: item.title,
          message: item.message,
          createdAt: item.createdAt,
          senderRole: item.senderRole,
        }))
      );
    } else {
      setMessages([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchMessages();
  }, [fetchMessages]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Compose Section */}
      <div>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 ring-1 ring-indigo-200">
            <Send className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Send Notification</h1>
            <p className="text-xs text-slate-500">Broadcast messages to students or faculty</p>
          </div>
        </div>
        <NotificationComposerCard onSent={fetchMessages} />
      </div>

      {/* Sent / All Notifications */}
      <div>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 ring-1 ring-blue-200">
            <Bell className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">All Notifications</h2>
            <p className="text-xs text-slate-500">Complete log of sent notifications</p>
          </div>
          {!loading && messages.length > 0 && (
            <span className="ml-auto rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
              {messages.length}
            </span>
          )}
        </div>

        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        )}

        {!loading && messages.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white py-12 text-center shadow-sm"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <Inbox className="h-6 w-6 text-slate-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">No notifications sent yet</p>
              <p className="mt-0.5 text-xs text-slate-500">Use the form above to send your first notification.</p>
            </div>
          </motion.div>
        )}

        {!loading && messages.length > 0 && (
          <div className="space-y-2">
            <AnimatePresence>
              {messages.map((item, idx) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04, duration: 0.18 }}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="text-sm font-semibold text-slate-800 leading-snug">{item.title}</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{item.message}</p>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <SourceBadge role={item.senderRole} />
                    {item.createdAt && (
                      <span className="flex items-center gap-1 text-[10px] text-slate-400">
                        <Clock className="h-3 w-3" />
                        {formatTime(item.createdAt)}
                      </span>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <AdminShell title="Notifications">
      <div className="col-span-12">
        <NotificationsContent />
      </div>
    </AdminShell>
  );
}
