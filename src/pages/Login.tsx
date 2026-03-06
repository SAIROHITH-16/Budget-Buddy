// src/pages/Login.tsx
// Full manual implementation of the Login page.
// No template. No scaffold. No auth preset.
//
// Features:
//   - Email + password sign-in
//   - Google sign-in via popup
//   - Link to the register page
//   - Shows inline Firebase error messages
//   - After successful sign-in, redirects to the page the user originally tried
//     to visit (stored in router location.state.from) or falls back to "/"

import React, { useState, type FormEvent } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { type FirebaseError } from "firebase/app";
import { Eye, EyeOff } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

// ---------------------------------------------------------------------------
// Helper — detect phone number vs email
// ---------------------------------------------------------------------------
function isPhoneNumber(value: string): boolean {
  // Matches strings that are mostly digits with optional +, spaces, dashes, parens
  return /^[+\d][\d\s\-().]{6,19}$/.test(value.trim()) && !value.includes("@");
}

// ---------------------------------------------------------------------------
// Helper — resolve phone → email via the backend
// ---------------------------------------------------------------------------
async function resolvePhoneToEmail(phone: string): Promise<string> {
  const res = await fetch(
    `${API_BASE}/api/users/lookup-by-phone?phone=${encodeURIComponent(phone)}`
  );
  const json = await res.json();
  if (!res.ok || !json.email) {
    throw new Error(json.error ?? "No account found with this phone number.");
  }
  return json.email as string;
}

// ---------------------------------------------------------------------------
// Helper — convert Firebase error codes into human-readable messages
// ---------------------------------------------------------------------------
function parseFirebaseError(error: unknown): string {
  const firebaseError = error as FirebaseError;
  switch (firebaseError.code) {
    case "auth/user-not-found":
      return "No account found with this email address.";
    case "auth/wrong-password":
      return "Incorrect password. Please try again.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/invalid-credential":
      return "Invalid email or password.";
    case "auth/too-many-requests":
      return "Too many failed attempts. Please wait a few minutes before trying again.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/popup-closed-by-user":
      return "Google sign-in was cancelled.";
    case "auth/popup-blocked":
      return "Pop-up was blocked by the browser. Please allow pop-ups for this site.";
    default:
      return firebaseError.message ?? "An unexpected error occurred.";
  }
}

// ---------------------------------------------------------------------------
// Login Component
// ---------------------------------------------------------------------------
export default function Login() {
  const { signInEmail, signInGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Where to redirect after sign-in (defaults to dashboard)
  const from: string = (location.state as { from?: Location })?.from?.pathname ?? "/dashboard";

  // Form state
  const [identifier, setIdentifier] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState<boolean>(false);

  // -------------------------------------------------------------------------
  // Email + password sign-in handler
  // -------------------------------------------------------------------------
  async function handleEmailSignIn(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setErrorMessage(null);

    if (!identifier.trim() || !password) {
      setErrorMessage("Please enter your email (or phone number) and password.");
      return;
    }

    setIsSubmitting(true);
    try {
      let loginEmail = identifier.trim();

      // If a phone number was entered, resolve it to the stored email first
      if (isPhoneNumber(loginEmail)) {
        loginEmail = await resolvePhoneToEmail(loginEmail);
      }

      await signInEmail(loginEmail, password);
      navigate(from, { replace: true });
    } catch (err) {
      // resolvePhoneToEmail throws a plain Error; Firebase throws FirebaseError
      const fe = err as FirebaseError;
      setErrorMessage(fe.code ? parseFirebaseError(err) : (err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  // -------------------------------------------------------------------------
  // Google sign-in handler
  // -------------------------------------------------------------------------
  async function handleGoogleSignIn(): Promise<void> {
    setErrorMessage(null);
    setIsGoogleSubmitting(true);
    try {
      await signInGoogle();
      navigate(from, { replace: true });
    } catch (err) {
      setErrorMessage(parseFirebaseError(err));
    } finally {
      setIsGoogleSubmitting(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="flex min-h-screen items-center justify-center bg-transparent px-4"
      style={{
        backgroundImage: [
          "radial-gradient(ellipse 80% 50% at 10% 0%, rgba(253,164,175,0.15) 0%, transparent 60%)",
          "radial-gradient(ellipse 55% 40% at 90% 100%, rgba(110,231,183,0.15) 0%, transparent 55%)",
        ].join(", ")
      }}
    >
      <div className="w-full max-w-md rounded-2xl p-8"
        style={{
          background: "rgba(255,255,255,0.85)",
          border: "1px solid rgba(255,255,255,0.95)",
          boxShadow: [
            "0 4px 16px rgba(124,58,237,0.10)",
            "0 12px 48px rgba(124,58,237,0.08)",
            "inset 0 1px 0 rgba(255,255,255,1)",
          ].join(", "),
          backdropFilter: "blur(20px)",
        }}
      >

        {/* ---------------------------------------------------------------- */}
        {/* Header                                                            */}
        {/* ---------------------------------------------------------------- */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{
              background: "linear-gradient(135deg, #0891b2, #0f766e)",
              boxShadow: "0 4px 20px rgba(8,145,178,0.40), inset 0 1px 0 rgba(255,255,255,0.20)",
            }}
          >
            {/* Wallet icon – inline SVG, no icon library dependency */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-7 w-7 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16 11a1 1 0 110 2 1 1 0 010-2z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Welcome back
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to your Budget Buddy account
          </p>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Error message                                                     */}
        {/* ---------------------------------------------------------------- */}
        {errorMessage && (
          <div className="mb-5 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
            <p className="text-sm text-destructive">{errorMessage}</p>
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Email + password form                                             */}
        {/* ---------------------------------------------------------------- */}
        <form onSubmit={handleEmailSignIn} noValidate className="space-y-4">
          {/* Email or Phone */}
          <div className="space-y-1.5">
            <label
              htmlFor="login-identifier"
              className="block text-sm font-medium text-foreground"
            >
              Email or Phone Number
            </label>
            <input
              id="login-identifier"
              type="text"
              autoComplete="username"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="you@example.com or +1 234 567 8900"
              disabled={isSubmitting || isGoogleSubmitting}
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="login-password"
                className="block text-sm font-medium text-foreground"
              >
                Password
              </label>
              <Link
                to="/forgot-password"
                className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative w-full">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="••••••••"
                disabled={isSubmitting || isGoogleSubmitting}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                disabled={isSubmitting || isGoogleSubmitting}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={isSubmitting || isGoogleSubmitting}
            className="mt-2 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {/* ---------------------------------------------------------------- */}
        {/* Divider                                                           */}
        {/* ---------------------------------------------------------------- */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">or continue with</span>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Google sign-in button                                             */}
        {/* ---------------------------------------------------------------- */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isSubmitting || isGoogleSubmitting}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          {/* Google "G" logo SVG */}
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          {isGoogleSubmitting ? "Signing in…" : "Continue with Google"}
        </button>

        {/* ---------------------------------------------------------------- */}
        {/* Footer — link to register                                        */}
        {/* ---------------------------------------------------------------- */}
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            to="/register"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
