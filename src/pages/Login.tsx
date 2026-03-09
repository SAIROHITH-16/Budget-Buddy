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
import { Eye, EyeOff, Github } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

// ---------------------------------------------------------------------------
// Helper â€” detect phone number vs email
// ---------------------------------------------------------------------------
function isPhoneNumber(value: string): boolean {
  // Matches strings that are mostly digits with optional +, spaces, dashes, parens
  return /^[+\d][\d\s\-().]{6,19}$/.test(value.trim()) && !value.includes("@");
}

// ---------------------------------------------------------------------------
// Helper â€” resolve phone â†’ email via the backend
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
// Helper â€” convert Firebase error codes into human-readable messages
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
    <div className="relative flex min-h-screen overflow-hidden bg-[#0f0f11]">

      {/* Decorative glow blobs */}
      <div className="pointer-events-none absolute -left-40 -top-40 h-[600px] w-[600px] rounded-full bg-purple-900/50 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 right-0 h-[500px] w-[500px] rounded-full bg-blue-900/40 blur-[120px]" />

      {/* â”€â”€ Left panel â”€â”€ */}
      <div className="relative hidden flex-col items-start justify-center px-16 lg:flex lg:w-1/2">
        <p className="mb-2 text-sm font-medium uppercase tracking-widest text-purple-400">Budget Buddy</p>
        <h1 className="text-6xl font-extrabold leading-tight text-white">
          Welcome<br />Back .!
        </h1>
        <p className="mt-4 max-w-sm text-base text-gray-400">
          Track your spending, manage budgets, and take control of your finances.
        </p>
        <Link
          to="/register"
          className="mt-8 rounded-lg border border-white px-6 py-2.5 text-sm font-medium italic text-white transition-colors hover:bg-white hover:text-black"
        >
          Skip the lag ?
        </Link>
      </div>

      {/* â”€â”€ Right panel â€” glassmorphic card â”€â”€ */}
      <div className="relative flex w-full items-center justify-center px-6 py-12 lg:w-1/2">
        <div
          className="w-full max-w-md rounded-3xl border border-white/10 p-8"
          style={{ background: "rgba(0,0,0,0.40)", backdropFilter: "blur(24px)" }}
        >
          {/* Header */}
          <h2 className="text-3xl font-bold text-white">Login</h2>
          <p className="mt-1 text-sm text-gray-400">Glad you&apos;re back.!</p>

          {/* Error */}
          {errorMessage && (
            <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3">
              <p className="text-sm text-red-400">{errorMessage}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleEmailSignIn} noValidate className="mt-6 space-y-4">
            {/* Username / Email */}
            <div>
              <label htmlFor="login-identifier" className="mb-1.5 block text-sm font-medium text-gray-300">
                Username
              </label>
              <input
                id="login-identifier"
                type="text"
                autoComplete="username"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="you@example.com or +1 234 567 8900"
                disabled={isSubmitting || isGoogleSubmitting}
                className="w-full rounded-xl border border-white/10 bg-transparent px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium text-gray-300">
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                  disabled={isSubmitting || isGoogleSubmitting}
                  className="w-full rounded-xl border border-white/10 bg-transparent px-4 py-2.5 pr-10 text-sm text-white placeholder:text-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <div className="flex items-center gap-2">
              <input
                id="remember"
                type="checkbox"
                className="h-4 w-4 rounded accent-purple-500"
              />
              <label htmlFor="remember" className="text-sm text-gray-400">Remember me</label>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting || isGoogleSubmitting}
              className="mt-1 w-full rounded-xl bg-gradient-to-r from-blue-500 to-purple-700 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Signing inâ€¦" : "Login"}
            </button>
          </form>

          {/* Forgot password */}
          <p className="mt-3 text-center text-sm text-gray-400">
            <Link to="/forgot-password" className="hover:text-white hover:underline underline-offset-2">
              Forgot password ?
            </Link>
          </p>

          {/* Divider */}
          <div className="relative my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-xs text-gray-500">Or</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          {/* Social icons */}
          <div className="flex justify-center gap-4">
            {/* Google */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isSubmitting || isGoogleSubmitting}
              title="Continue with Google"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
            </button>
            {/* Facebook */}
            <button
              type="button"
              title="Continue with Facebook"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition-colors hover:bg-white/10"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.276h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
              </svg>
            </button>
            {/* GitHub */}
            <Link
              to="/phone-signin"
              title="Continue with Phone"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition-colors hover:bg-white/10"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.7 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.61 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l.97-.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </Link>
          </div>

          {/* Sign up link */}
          <p className="mt-6 text-center text-sm text-gray-400">
            Don&apos;t have an account?{" "}
            <Link to="/register" className="font-semibold text-white hover:underline underline-offset-2">
              Signup
            </Link>
          </p>

          {/* Footer links */}
          <div className="mt-4 flex justify-center gap-4 text-xs text-gray-600">
            <a href="#" className="hover:text-gray-400">Terms &amp; Conditions</a>
            <a href="#" className="hover:text-gray-400">Support</a>
            <a href="#" className="hover:text-gray-400">Customer Care</a>
          </div>
        </div>
      </div>
    </div>
  );
}
