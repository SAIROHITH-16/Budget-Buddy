// src/pages/ForgotPassword.tsx
// Forgot Password page — allows users to request a password reset email
// Uses Firebase sendPasswordResetEmail functionality
// Styled consistently with Login and Register pages

import React, { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { type FirebaseError } from "firebase/app";

// ---------------------------------------------------------------------------
// Helper — convert Firebase error codes into human-readable messages
// ---------------------------------------------------------------------------
function parseFirebaseError(error: unknown): string {
  const firebaseError = error as FirebaseError;
  switch (firebaseError.code) {
    case "auth/user-not-found":
      return "No account found with this email address.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a few minutes before trying again.";
    default:
      return firebaseError.message ?? "An unexpected error occurred.";
  }
}

// ---------------------------------------------------------------------------
// ForgotPassword Component
// ---------------------------------------------------------------------------
export default function ForgotPassword() {
  const { sendPasswordReset } = useAuth();

  const [email, setEmail] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  // ---------------------------------------------------------------------------
  // Password reset handler
  // ---------------------------------------------------------------------------
  async function handleResetPassword(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    setIsLoading(true);
    try {
      await sendPasswordReset(email.trim());
      setSuccess(true);
    } catch (err) {
      setError(parseFirebaseError(err));
    } finally {
      setIsLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-transparent p-4"
      style={{
        backgroundImage: [
          "radial-gradient(ellipse 80% 50% at 10% 0%, rgba(255,180,120,0.18) 0%, transparent 60%)",
          "radial-gradient(ellipse 55% 40% at 90% 100%, rgba(165,130,250,0.18) 0%, transparent 55%)",
        ].join(", "),
      }}
    >
      <div className="flex w-full max-w-5xl overflow-hidden rounded-[2rem] shadow-xl" style={{ minHeight: "600px" }}>

        {/* LEFT — purple branding panel */}
        <div className="relative hidden w-1/2 flex-col bg-[#7C3AED] p-10 text-white md:flex">
          <div className="absolute -left-8 -top-8 h-40 w-40 rotate-12 rounded-3xl bg-white/10 backdrop-blur-sm" />
          <div className="absolute -right-6 top-16 h-28 w-28 -rotate-12 rounded-3xl bg-white/10 backdrop-blur-sm" />
          <div className="absolute bottom-24 -left-6 h-24 w-24 rotate-45 rounded-2xl bg-white/10 backdrop-blur-sm" />
          <div className="absolute -bottom-8 right-12 h-36 w-36 -rotate-6 rounded-3xl bg-white/10 backdrop-blur-sm" />
          <div className="absolute right-1/3 top-1/3 h-16 w-16 rotate-12 rounded-2xl bg-white/10 backdrop-blur-sm" />

          <div className="relative z-10 flex items-center gap-2">
            <img src="/logo.png" alt="BudgetBuddy" className="h-8 w-8 rounded-lg object-contain" />
            <span className="text-sm font-semibold tracking-wide">BudgetBuddy</span>
          </div>

          <div className="relative z-10 mt-auto pb-8">
            <h1 className="text-4xl font-extrabold leading-tight">
              Reset Your<br />Password .!
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-white/75">
              We&apos;ll send a secure link straight to your inbox.
            </p>
          </div>
        </div>

        {/* RIGHT — glassmorphic form panel */}
        <div
          className="flex w-full flex-col justify-center px-8 py-10 md:w-1/2"
          style={{
            background: "rgba(255,255,255,0.85)",
            border: "1px solid rgba(255,255,255,0.95)",
            backdropFilter: "blur(20px)",
          }}
        >
          {/* Header */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#7C3AED]">
              <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Reset password</h2>
            <p className="mt-1 text-sm text-gray-500">
              {success ? "We've sent you an email" : "Enter your email and we'll send you a reset link"}
            </p>
          </div>

          {success ? (
            <div className="space-y-5">
              <div className="rounded-xl border border-[#7C3AED]/30 bg-[#7C3AED]/10 px-4 py-4">
                <p className="text-center text-sm text-gray-700">
                  Check your inbox for a reset link. If you don&apos;t see it, check your spam folder.
                </p>
              </div>
              <Link
                to="/login"
                className="block w-full rounded-xl bg-[#7C3AED] py-2.5 text-center text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                Back to Login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleResetPassword} noValidate className="space-y-4">
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email address
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 9.5 6.5a1 1 0 0 0 1 0L22 7"/>
                    </svg>
                  </span>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    disabled={isLoading}
                    className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#7C3AED] focus:outline-none focus:ring-1 focus:ring-[#7C3AED] disabled:opacity-50"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-xl bg-[#7C3AED] py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? "Sending…" : "Send reset link"}
              </button>

              <p className="text-center">
                <Link to="/login" className="text-sm font-medium text-[#7C3AED] hover:underline">
                  Back to Login
                </Link>
              </p>
            </form>
          )}

          <p className="mt-auto pt-8 text-center text-sm text-gray-500">
            Don&apos;t have an account?{" "}
            <Link to="/register" className="font-semibold text-[#7C3AED] hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
