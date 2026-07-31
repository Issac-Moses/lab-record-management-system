import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Send, MessagesSquare, RefreshCw } from "lucide-react";
import {
  createStudentNotification,
  getSentStudentNotifications,
  getNotificationSenderContext,
  type NotificationTargetRole,
  type StudentNotification,
} from "@/services/studentNotificationsService";

type Props = {
  defaultDepartment?: string;
  title?: string;
  onSent?: () => void | Promise<void>;
};

function formatTime(value: string | null): string {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function NotificationComposerCard({
  defaultDepartment = "",
  title = "Student Notifications",
  onSent,
}: Props) {
  const [notificationTitle, setNotificationTitle] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [targetAudience, setTargetAudience] = useState<NotificationTargetRole>("student");
  const [targetMode, setTargetMode] = useState<"all" | "department">("all");
  const [targetDepartment, setTargetDepartment] = useState(defaultDepartment);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [items, setItems] = useState<StudentNotification[]>([]);
  const [senderRole, setSenderRole] = useState<"admin" | "faculty" | "student" | null>(null);
  const [senderDepartment, setSenderDepartment] = useState("");

  const loadSent = async () => {
    setLoading(true);
    setError("");
    const result = await getSentStudentNotifications(12);
    if (!result.success) {
      setItems([]);
      setError(result.error);
    } else {
      setItems(result.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadSent();
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const context = await getNotificationSenderContext();
      if (!active) return;
      setSenderRole(context.role);
      const resolvedDepartment = String(context.department || defaultDepartment || "").trim();
      setSenderDepartment(resolvedDepartment);
      if (resolvedDepartment) {
        setTargetDepartment(resolvedDepartment);
      }
      if (context.role === "faculty") {
        setTargetMode("department");
      }
    })();
    return () => {
      active = false;
    };
  }, [defaultDepartment]);

  const isFacultySender = senderRole === "faculty";
  const isAdminSender = senderRole === "admin";
  const canSend = isFacultySender || isAdminSender;

  const sendNow = async () => {
    setSuccess("");
    setError("");
    const finalDepartment =
      isFacultySender
        ? String(senderDepartment || targetDepartment || "").trim()
        : targetMode === "department"
          ? String(targetDepartment || "").trim()
          : "";

    if (isFacultySender && !finalDepartment) {
      setError("Your department is missing in profile. Contact admin to set it.");
      return;
    }

    setSending(true);
    const result = await createStudentNotification({
      title: notificationTitle,
      message: messageBody,
      targetRole: isFacultySender ? "student" : targetAudience,
      targetDepartment: finalDepartment || null,
    });
    setSending(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setSuccess(
      finalDepartment
        ? `Notification sent to ${finalDepartment.toUpperCase()} ${isFacultySender ? "students" : targetAudience === "faculty" ? "faculty" : "students"}.`
        : `Notification sent to all ${isFacultySender ? "students" : targetAudience === "faculty" ? "faculty" : "students"}.`
    );
    setNotificationTitle("");
    setMessageBody("");
    await loadSent();
    if (onSent) {
      await onSent();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
            <MessagesSquare className="h-4 w-4 text-blue-700" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        </div>
        <button
          type="button"
          onClick={() => void loadSent()}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="md:col-span-2 space-y-3">
          <input
            value={notificationTitle}
            onChange={(event) => setNotificationTitle(event.target.value)}
            placeholder="Notification title"
            className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          />
          <textarea
            value={messageBody}
            onChange={(event) => setMessageBody(event.target.value)}
            placeholder={`Type message for ${isFacultySender ? "students" : targetAudience === "faculty" ? "faculty" : "students"}...`}
            rows={5}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          />
          <div className="flex flex-wrap items-center gap-2">
            {isAdminSender ? (
              <select
                value={targetAudience}
                onChange={(event) => setTargetAudience(event.target.value as NotificationTargetRole)}
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
              >
                <option value="student">Students</option>
                <option value="faculty">Faculty</option>
              </select>
            ) : null}
            {!isFacultySender ? (
              <>
                <select
                  value={targetMode}
                  onChange={(event) => setTargetMode(event.target.value as "all" | "department")}
                  className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
                >
                  <option value="all">All departments</option>
                  <option value="department">Specific department</option>
                </select>
                {targetMode === "department" ? (
                  <input
                    value={targetDepartment}
                    onChange={(event) => setTargetDepartment(event.target.value)}
                    placeholder="Department (e.g. CSE)"
                    className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
                  />
                ) : null}
              </>
            ) : null}
            <button
              type="button"
              onClick={() => void sendNow()}
              disabled={sending || !canSend}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {sending ? "Sending..." : "Send Notification"}
            </button>
          </div>
          {isFacultySender ? (
            <p className="text-xs text-slate-500">
              Faculty messages are automatically delivered to your department students.
            </p>
          ) : null}
          {success ? <p className="text-xs text-emerald-700">{success}</p> : null}
          {error ? <p className="text-xs text-rose-700">{error}</p> : null}
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Recent Sent
          </p>
          {loading ? (
            <p className="text-xs text-slate-500">Loading...</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-slate-500">No messages sent yet.</p>
          ) : (
            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {items.map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-2">
                  <p className="truncate text-xs font-semibold text-slate-800">{item.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-600">{item.message}</p>
                  <p className="mt-1 text-[10px] text-slate-500">
                    {(item.targetRole || "student") === "faculty" ? "Faculty" : "Students"}
                    {item.targetDepartment ? ` • Dept: ${item.targetDepartment}` : " • All departments"} •{" "}
                    {formatTime(item.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
