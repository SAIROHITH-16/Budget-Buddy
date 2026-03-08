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
          <h2 className="text-4xl font-bold text-white leading-tight mb-4">Welcome Back!</h2>
          <p className="text-indigo-200 text-base leading-relaxed">
            Sign in to your account and pick up right where you left off tracking your finances.
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
            <h1 className="text-3xl font-bold text-gray-900">Login</h1>
            <p className="mt-1 text-sm text-gray-500">Welcome to Budget Buddy</p>
          </div>

          {/* Error message */}
          {errorMessage && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-600">{errorMessage}</p>
            </div>
          )}

          {/* Email + password form */}
          <form onSubmit={handleEmailSignIn} noValidate className="space-y-4">
            {/* Email or Phone */}
            <div>
              <label htmlFor="login-identifier" className="block text-sm font-medium text-gray-700 mb-1.5">
                Email or Phone Number
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                  <svg className="h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
                  </svg>
                </span>
                <input
                  id="login-identifier"
                  type="text"
                  autoComplete="username"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="you@example.com or +1 234 567 8900"
                  disabled={isSubmitting || isGoogleSubmitting}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="login-password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <Link to="/forgot-password" className="text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                  <svg className="h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                  </svg>
                </span>
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-10 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="••••••••"
                  disabled={isSubmitting || isGoogleSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  disabled={isSubmitting || isGoogleSubmitting}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isSubmitting || isGoogleSubmitting}
              className="mt-2 w-full rounded-xl py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}
            >
              {isSubmitting ? "Signing in…" : "Sign In"}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-3 text-gray-400 tracking-wider">or continue with</span>
            </div>
          </div>

          {/* Google + Phone buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isSubmitting || isGoogleSubmitting}
              className="flex flex-1 items-center justify-center gap-2.5 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              {isGoogleSubmitting ? "Signing in…" : "Google"}
            </button>
            <Link
              to="/phone-signin"
              className="flex flex-1 items-center justify-center gap-2.5 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.7 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.61 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l.97-.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              Phone
            </Link>
          </div>

          {/* Footer */}
          <p className="mt-8 text-center text-sm text-gray-500">
            Don&apos;t have an account?{" "}
            <Link to="/register" className="font-semibold text-indigo-600 hover:text-indigo-700">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
