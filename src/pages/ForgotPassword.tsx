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
            {/* ForgotPassword icon: shield with padlock + asterisk row */}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 64 64" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
              {/* Shield */}
              <path d="M32 4 L58 13 L58 32 C58 47 46 58 32 62 C18 58 6 47 6 32 L6 13 Z" />
              {/* Lock body */}
              <rect x="22" y="28" width="20" height="16" rx="3" />
              {/* Lock shackle */}
              <path d="M26 28 L26 23 A6 6 0 0 1 38 23 L38 28" />
              {/* Keyhole dot */}
              <line x1="32" y1="33" x2="32" y2="38" strokeWidth={2.5} />
              {/* Asterisks row */}
              {/* asterisk 1 */}
              <line x1="16" y1="50" x2="16" y2="56" /><line x1="13" y1="51.5" x2="19" y2="54.5" /><line x1="19" y1="51.5" x2="13" y2="54.5" />
              {/* asterisk 2 */}
              <line x1="24" y1="50" x2="24" y2="56" /><line x1="21" y1="51.5" x2="27" y2="54.5" /><line x1="27" y1="51.5" x2="21" y2="54.5" />
              {/* asterisk 3 */}
              <line x1="40" y1="50" x2="40" y2="56" /><line x1="37" y1="51.5" x2="43" y2="54.5" /><line x1="43" y1="51.5" x2="37" y2="54.5" />
              {/* asterisk 4 */}
              <line x1="48" y1="50" x2="48" y2="56" /><line x1="45" y1="51.5" x2="51" y2="54.5" /><line x1="51" y1="51.5" x2="45" y2="54.5" />
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
