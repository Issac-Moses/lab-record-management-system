import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { postAdminApi, parseAdminApiError } from "@/services/adminApiClient";

export default function AddStudentForm({ onCreated, notify }) {
  const [form, setForm] = useState({
    register_no: "",
    name: "",
    email: "",
    password: "",
    department: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const email = form.email.trim();
    const registerNo = form.register_no.trim();
    const name = form.name.trim();
    const password = form.password;
    const department = form.department.trim();

    if (!registerNo || !name || !email || !password || !department) {
      setError("All fields are required.");
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError("Please enter a valid email.");
      return;
    }
    if (password.length < 6) {
      setError("Password should be at least 6 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const duplicateRes = await supabase
        .from("profiles")
        .select("id, register_no, email")
        .or(`register_no.eq.${registerNo},email.eq.${email}`)
        .eq("role", "student")
        .limit(1);

      if ((duplicateRes.data || []).length > 0) {
        setError("Student with this register number or email already exists.");
        setSubmitting(false);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setError("Admin session expired. Please login again.");
        setSubmitting(false);
        return;
      }

      const requestPayload = {
        email,
        password,
        role: "student",
        name,
        department,
        register_no: registerNo,
        year: "",
        semester: "",
      };

      const { response } = await postAdminApi("admin/create-user", requestPayload, token);
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.success === false) {
        const message =
          payload?.error ||
          payload?.message ||
          (await parseAdminApiError(response, "Failed to create student."));
        setError(message);
        setSubmitting(false);
        return;
      }

      notify("success", "Student created successfully.");
      setForm({
        register_no: "",
        name: "",
        email: "",
        password: "",
        department: "",
      });
      onCreated?.();
    } catch (createError) {
      console.error("Create student failed:", createError);
      setError("Could not create student. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="faculty-surface rounded-2xl p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">Manual Student Add</h3>
      <div className="grid gap-3 md:grid-cols-2">
        <input
          value={form.register_no}
          onChange={(event) => setField("register_no", event.target.value)}
          placeholder="Reg Number"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none"
        />
        <input
          value={form.name}
          onChange={(event) => setField("name", event.target.value)}
          placeholder="Student Name"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none"
        />
        <input
          type="email"
          value={form.email}
          onChange={(event) => setField("email", event.target.value)}
          placeholder="Email"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none"
        />
        <input
          type="password"
          value={form.password}
          onChange={(event) => setField("password", event.target.value)}
          placeholder="Password"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none"
        />
        <input
          value={form.department}
          onChange={(event) => setField("department", event.target.value)}
          placeholder="Department"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none md:col-span-2"
        />
      </div>
      {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
      <button
        type="submit"
        disabled={submitting}
        className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white transition hover:bg-indigo-500 disabled:opacity-60"
      >
        {submitting ? "Adding..." : "Add Student"}
      </button>
    </form>
  );
}
