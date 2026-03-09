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
    <div
      className="flex min-h-screen items-center justify-center bg-transparent p-4"
      style={{
        backgroundImage: [
          "radial-gradient(ellipse 80% 50% at 10% 0%, rgba(255,180,120,0.18) 0%, transparent 60%)",
          "radial-gradient(ellipse 55% 40% at 90% 100%, rgba(165,130,250,0.18) 0%, transparent 55%)",
        ].join(", "),
      }}
    >
      {/* Main card */}
      <div className="flex w-full max-w-5xl overflow-hidden rounded-[2rem] shadow-xl" style={{ minHeight: "600px" }}>

        {/* ---------------------------------------------------------------- */}
        {/* LEFT — blue branding panel                                        */}
        {/* ---------------------------------------------------------------- */}
        <div className="relative hidden w-1/2 flex-col bg-[#7C3AED] p-10 text-white md:flex">

          {/* Decorative floating shapes */}
          <div className="absolute -left-8 -top-8 h-40 w-40 rotate-12 rounded-3xl bg-white/10 backdrop-blur-sm" />
          <div className="absolute -right-6 top-16 h-28 w-28 -rotate-12 rounded-3xl bg-white/10 backdrop-blur-sm" />
          <div className="absolute bottom-24 -left-6 h-24 w-24 rotate-45 rounded-2xl bg-white/10 backdrop-blur-sm" />
          <div className="absolute -bottom-8 right-12 h-36 w-36 -rotate-6 rounded-3xl bg-white/10 backdrop-blur-sm" />
          <div className="absolute right-1/3 top-1/3 h-16 w-16 rotate-12 rounded-2xl bg-white/10 backdrop-blur-sm" />

          {/* Logo */}
          <div className="relative z-10 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
              <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
              </svg>
            </div>
            <span className="text-sm font-semibold tracking-wide">BudgetBuddy</span>
          </div>

          {/* Hero copy */}
          <div className="relative z-10 mt-auto pb-8">
            <h1 className="text-4xl font-extrabold leading-tight">
              Welcome<br />Back!
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-white/75">
              Sign in to access your AI-Powered Personal Finance &amp; Spending Analyzer.
            </p>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* RIGHT — white login form                                          */}
        {/* ---------------------------------------------------------------- */}
        <div
          className="flex w-full flex-col px-8 py-10 md:w-1/2"
          style={{
            background: "rgba(255,255,255,0.85)",
            border: "1px solid rgba(255,255,255,0.95)",
            backdropFilter: "blur(20px)",
          }}
        >

          {/* Header */}
          <div className="mb-8 text-center">
            {/* App logo mark */}
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#7C3AED]">
              <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2"/>
                <path d="M2 10h20"/>
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Login</h2>
            <p className="mt-1 text-sm text-gray-500">Welcome to BudgetBuddy</p>
          </div>

          {/* Error */}
          {errorMessage && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-600">{errorMessage}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleEmailSignIn} noValidate className="space-y-4">

            {/* Email / Phone */}
            <div className="space-y-1.5">
              <label htmlFor="login-identifier" className="block text-sm font-medium text-gray-700">
                Email / Phone Number
              </label>
              <div className="relative">
                {/* User icon */}
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </span>
                <input
                  id="login-identifier"
                  type="text"
                  autoComplete="username"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#7C3AED] focus:outline-none focus:ring-1 focus:ring-[#7C3AED] disabled:opacity-50"
                  placeholder="you@example.com or +1 234 567 8900"
                  disabled={isSubmitting || isGoogleSubmitting}
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="login-password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="relative">
                {/* Lock icon */}
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </span>
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-10 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#7C3AED] focus:outline-none focus:ring-1 focus:ring-[#7C3AED] disabled:opacity-50"
                  placeholder="••••••••"
                  disabled={isSubmitting || isGoogleSubmitting}
                />
                {/* Eye toggle */}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600"
                  disabled={isSubmitting || isGoogleSubmitting}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {/* Forgot password */}
              <Link
                to="/forgot-password"
                className="block text-xs font-medium text-[#7C3AED] hover:underline"
              >
                Forgot password?
              </Link>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting || isGoogleSubmitting}
              className="mt-2 w-full rounded-xl bg-[#7C3AED] py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Signing in…" : "Login"}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400">or continue with</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          {/* Social buttons */}
          <div className="flex items-center justify-center gap-3">
            {/* Google */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isSubmitting || isGoogleSubmitting}
              title="Continue with Google"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            </button>
            {/* Phone */}
            <Link
              to="/phone-signin"
              title="Continue with Phone"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white transition-colors hover:bg-gray-50"
            >
              <svg className="h-4 w-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.7 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.61 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l.97-.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
            </Link>
          </div>

          {/* Footer */}
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
