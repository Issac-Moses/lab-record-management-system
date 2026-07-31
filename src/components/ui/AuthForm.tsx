

import React from "react";

interface AuthFormProps {
  role: "student" | "faculty" | "admin";
  email: string;
  password: string;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onSubmit: () => void;
  onGoogleLogin?: () => void;
}

export default function AuthForm({
  role,
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onGoogleLogin,
}: AuthFormProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-100 px-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="bg-white p-8 rounded-2xl w-full max-w-md shadow-xl space-y-5"
      >
        <h2 className="text-2xl font-bold text-center text-gray-800">
          {role === "student" && "Student Login"}
          {role === "faculty" && "Faculty Login"}
          {role === "admin" && "Admin Login"}
        </h2>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-gray-700">Email</label>
          <div className="flex items-center border rounded-lg px-3 h-12 focus-within:border-indigo-500">
            <input
              type="email"
              placeholder="Enter email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              className="w-full outline-none text-sm"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-gray-700">Password</label>
          <div className="flex items-center border rounded-lg px-3 h-12 focus-within:border-indigo-500">
            <input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              className="w-full outline-none text-sm"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          className="w-full h-12 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition"
        >
          Login
        </button>

        {onGoogleLogin && (
          <button
            type="button"
            onClick={onGoogleLogin}
            className="w-full h-12 rounded-lg border flex items-center justify-center gap-2 hover:border-indigo-500 transition text-sm font-medium"
          >
            Continue with Google
          </button>
        )}

        <p className="text-xs text-center text-gray-400">
          Secure Digital Lab Record System
        </p>
      </form>
    </div>
  );
}