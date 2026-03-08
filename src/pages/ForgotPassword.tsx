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
    <div className="flex min-h-screen">
      {/* ================================================================ */}
      {/* Left branding panel (desktop only)                               */}
      {/* ================================================================ */}
      <div
        className="hidden lg:flex lg:w-5/12 flex-col justify-between px-12 py-10 relative overflow-hidden"
        style={{ background: "linear-gradient(145deg, #3730a3, #4f46e5, #7c3aed)" }}
      >
        {/* Decorative shapes */}
        <div className="absolute top-16 right-10 h-20 w-20 rounded-2xl bg-white/10 rotate-12" />
        <div className="absolute top-36 right-28 h-10 w-10 rounded-full bg-white/10" />
        <div className="absolute bottom-40 left-8 h-14 w-14 rounded-2xl bg-white/10 -rotate-12" />
        <div className="absolute bottom-20 left-24 h-8 w-8 rotate-45 bg-white/10" />
        <div className="absolute top-1/2 right-6 h-6 w-6 rounded-full bg-white/10" />

        {/* Logo */}
        <div className="flex items-center gap-3 z-10">
          <img src="/logo.png" alt="Budget Buddy" className="h-10 w-10 rounded-xl object-contain bg-white/10 p-1" />
          <span className="text-lg font-bold text-white">Budget Buddy</span>
        </div>

        {/* Center text */}
        <div className="z-10">
          <h2 className="text-4xl font-bold text-white leading-tight mb-4">Reset Password</h2>
          <p className="text-indigo-200 text-base leading-relaxed">
            We'll send a reset link to your inbox so you can get back to managing your finances.
          </p>
        </div>

        {/* Footer */}
        <p className="text-indigo-300 text-xs z-10">© {new Date().getFullYear()} Budget Buddy. All rights reserved.</p>
      </div>

      {/* ================================================================ */}
      {/* Right form panel                                                  */}
      {/* ================================================================ */}
      <div className="flex flex-1 flex-col items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-md">

          {/* Mobile-only logo */}
          <div className="mb-8 flex justify-center lg:hidden">
            <img src="/logo.png" alt="Budget Buddy" className="h-14 w-14 rounded-2xl object-contain" />
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Reset Password</h1>
            <p className="mt-1 text-sm text-gray-500">
              {success ? "Check your inbox for the reset link" : "Enter your email and we'll send you a reset link"}
            </p>
          </div>

          {success ? (
            // Success state
            <div className="space-y-6">
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                <p className="text-sm text-center text-indigo-800">
                  A password reset link has been sent to <strong>{email}</strong>. Check your spam folder if you don't see it.
                </p>
              </div>
              <Link
                to="/login"
                className="flex w-full items-center justify-center rounded-xl py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}
              >
                Back to Login
              </Link>
            </div>
          ) : (
            // Form state
            <form onSubmit={handleResetPassword} noValidate className="space-y-4">
              {/* Error message */}
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {/* Email input */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email address
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                    <svg className="h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/>
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
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}
              >
                {isLoading ? "Sending…" : "Send Reset Link"}
              </button>

              {/* Back to login */}
              <div className="text-center">
                <Link
                  to="/login"
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
                >
                  Back to Login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
