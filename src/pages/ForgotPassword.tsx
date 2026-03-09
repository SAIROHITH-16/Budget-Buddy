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
      className="flex min-h-screen items-center justify-center bg-background px-4"
      style={{
        backgroundImage: [
          "radial-gradient(ellipse 80% 50% at 10% 0%, rgba(255,180,120,0.18) 0%, transparent 60%)",
          "radial-gradient(ellipse 55% 40% at 90% 100%, rgba(165,130,250,0.18) 0%, transparent 55%)",
        ].join(", ")
      }}
    >
      <div 
        className="w-full max-w-md rounded-2xl border border-border bg-card p-8"
        style={{
          boxShadow: [
            "0 4px 16px rgba(124,58,237,0.10)",
            "0 12px 48px rgba(124,58,237,0.08)",
            "inset 0 1px 0 rgba(255,255,255,1)",
          ].join(", ")
        }}
      >
        {/* ---------------------------------------------------------------- */}
        {/* Header                                                            */}
        {/* ---------------------------------------------------------------- */}
        <div className="mb-8 text-center">
          <div 
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{
              background: "linear-gradient(135deg, #7c3aed, #a855f7)",
              boxShadow: "0 4px 20px rgba(124,58,237,0.40), inset 0 1px 0 rgba(255,255,255,0.25)",
            }}
          >
            {/* ForgotPassword icon: speech bubble with padlock + asterisks */}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 512 512" stroke="currentColor" strokeWidth={22} strokeLinecap="round" strokeLinejoin="round">
              {/* Speech bubble body + tail */}
              <path d="M55 18 H457 A55 55 0 0 1 512 73 V355 A55 55 0 0 1 457 410 H268 L225 468 L225 410 H55 A55 55 0 0 1 0 355 V73 A55 55 0 0 1 55 18 Z" />
              {/* Lock shackle */}
              <path d="M198 188 V148 A58 58 0 0 1 314 148 V188" strokeWidth={20} />
              {/* Lock body */}
              <rect x="170" y="188" width="172" height="118" rx="16" />
              {/* Keyhole slot */}
              <line x1="256" y1="222" x2="256" y2="268" strokeWidth={16} />
              {/* 4 asterisks (3 lines each = 6 spokes) */}
              <line x1="110" y1="325" x2="110" y2="375" /><line x1="87" y1="334" x2="133" y2="366" /><line x1="133" y1="334" x2="87" y2="366" />
              <line x1="202" y1="325" x2="202" y2="375" /><line x1="179" y1="334" x2="225" y2="366" /><line x1="225" y1="334" x2="179" y2="366" />
              <line x1="310" y1="325" x2="310" y2="375" /><line x1="287" y1="334" x2="333" y2="366" /><line x1="333" y1="334" x2="287" y2="366" />
              <line x1="402" y1="325" x2="402" y2="375" /><line x1="379" y1="334" x2="425" y2="366" /><line x1="425" y1="334" x2="379" y2="366" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Reset your password
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {success
              ? "We've sent you an email"
              : "Enter your email address and we'll send you a reset link"}
          </p>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Success or Form Content                                           */}
        {/* ---------------------------------------------------------------- */}
        {success ? (
          // Success state
          <div className="space-y-6">
            <div className="rounded-lg border border-primary/40 bg-primary/10 p-4">
              <p className="text-sm text-center text-foreground">
                Check your inbox for a reset link. If you don't see it, check your spam folder.
              </p>
            </div>

            <Link
              to="/login"
              className="block w-full rounded-lg border border-input bg-background px-4 py-2.5 text-center text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Back to Login
            </Link>
          </div>
        ) : (
          // Form state
          <form onSubmit={handleResetPassword} noValidate className="space-y-4">
            {/* Error message */}
            {error && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {/* Email input */}
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-foreground"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={isLoading}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? "Sending..." : "Send reset link"}
            </button>

            {/* Back to login link */}
            <div className="text-center">
              <Link
                to="/login"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
              >
                Back to Login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
