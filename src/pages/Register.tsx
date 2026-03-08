// src/pages/Register.tsx
// Full manual implementation of the Register page.
// No template. No scaffold. No auth preset.
//
// Features:
//   - Email + password account creation
//   - Google sign-up via popup (creates account on first use)
//   - Client-side validation (matching passwords, minimum length)
//   - Shows inline Firebase error messages
//   - After successful registration, navigates to "/"

import React, { useState, useEffect, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { type FirebaseError } from "firebase/app";
import { updateProfile, signInWithCustomToken, auth } from "@/firebase";
import { sendEmailVerification } from "firebase/auth";
import api from "@/api";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Phone number placeholders by country code
// ---------------------------------------------------------------------------
const phonePlaceholders: Record<string, string> = {
  '+91': '9876543210',
  '+1': '5550000000',
  '+44': '7000000000',
  '+61': '400000000',
  '+49': '15123456789',
  '+81': '09012345678',
  '+971': '501234567',
  '+65': '81234567',
};

// Max digit count for the local part of each country code
const phoneMaxLengths: Record<string, number> = {
  '+91':  10,
  '+1':   10,
  '+44':  10,
  '+61':   9,
  '+49':  11,
  '+81':  11,
  '+971':  9,
  '+65':   8,
};

// ---------------------------------------------------------------------------
// Strong password validation regex
// At least 8 characters, one uppercase, one lowercase, one number, one special char
// ---------------------------------------------------------------------------
const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

// ---------------------------------------------------------------------------
// Helper — convert Firebase error codes into human-readable messages
// ---------------------------------------------------------------------------
function parseFirebaseError(error: unknown): string {
  const firebaseError = error as FirebaseError;
  switch (firebaseError.code) {
    case "auth/email-already-in-use":
      return "An account with this email address already exists.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/operation-not-allowed":
      return "Email/password registration is not enabled. Contact support.";
    case "auth/popup-closed-by-user":
      return "Google sign-in was cancelled.";
    case "auth/popup-blocked":
      return "Pop-up was blocked by the browser. Please allow pop-ups for this site.";
    default:
      return firebaseError.message ?? "An unexpected error occurred.";
  }
}

// ---------------------------------------------------------------------------
// Register Component
// ---------------------------------------------------------------------------
export default function Register() {
  const { signUpEmail, signInGoogle } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Form state
  const [name, setName] = useState<string>("");
  const [countryCode, setCountryCode] = useState<string>("+91");
  const [phoneNumber, setPhoneNumber] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState<boolean>(false);
  const [isPhoneSubmitting, setIsPhoneSubmitting] = useState<boolean>(false);

  // -------------------------------------------------------------------------
  // Phone.Email handler — called by the global listener once the user verifies
  // -------------------------------------------------------------------------
  async function handlePhoneEmailToken(userJsonUrl: string): Promise<void> {
    setIsPhoneSubmitting(true);
    setErrorMessage(null);
    try {
      const { data } = await api.post("/auth/verify-phone-email", { token: userJsonUrl });
      await signInWithCustomToken(auth, data.customToken);
      localStorage.setItem("showCurrencySetup", "true");
      navigate("/dashboard", { replace: true });
    } catch {
      setErrorMessage("Phone verification failed. Please try again.");
    } finally {
      setIsPhoneSubmitting(false);
    }
  }

  // -------------------------------------------------------------------------
  // Phone.Email script injection
  // -------------------------------------------------------------------------
  useEffect(() => {
    // Define the global listener BEFORE the script is injected so it is
    // available the moment the widget calls it on successful OTP verification.
    (window as unknown as Record<string, unknown>).phoneEmailListener = (
      userObj: { user_json_url: string }
    ) => {
      handlePhoneEmailToken(userObj.user_json_url);
    };

    const script = document.createElement("script");
    script.src = "https://auth.phone.email/login_automated_v1_2.js";
    script.async = true;
    script.onload = () => {
      const logInWithPhone = (
        window as unknown as Record<string, (cfg: string) => void>
      ).log_in_with_phone;
      if (typeof logInWithPhone === "function") {
        logInWithPhone(JSON.stringify({
          client_id: import.meta.env.VITE_PHONE_EMAIL_CLIENT_ID as string,
          success_url: "",
        }));
      }
    };
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) document.body.removeChild(script);
      delete (window as unknown as Record<string, unknown>).phoneEmailListener;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------------
  // Client-side validation
  // -------------------------------------------------------------------------
  function validateForm(): string | null {
    if (!name.trim()) return "Full name is required.";
    if (name.trim().length < 2) return "Name must be at least 2 characters.";
    // Phone is optional — but if entered it must meet the length requirement
    if (phoneNumber.trim()) {
      const maxLen = phoneMaxLengths[countryCode] ?? 15;
      const digits = phoneNumber.replace(/\D/g, "");
      if (digits.length !== maxLen) return `Phone number must be exactly ${maxLen} digits for ${countryCode}.`;
    }
    if (!email.trim()) return "Email address is required.";
    if (!password) return "Password is required.";
    if (!strongPasswordRegex.test(password)) return "Password does not meet security requirements.";
    if (password !== confirmPassword) return "Passwords do not match.";
    return null;
  }

  // -------------------------------------------------------------------------
  // Email + password registration handler
  // -------------------------------------------------------------------------
  async function handleEmailRegister(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setErrorMessage(null);

    const validationError = validateForm();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      // Step A: Create the Firebase user account
      const userCredential = await signUpEmail(email.trim(), password);
      const user = userCredential.user;

      // Step B: Update Firebase profile with the user's display name
      await updateProfile(user, { displayName: name.trim() });

      // Step C: Combine country code and phone number
      const fullPhone = `${countryCode}${phoneNumber.trim()}`;

      // Step D: Save user profile to backend
      try {
        await api.post("/users/profile", {
          firebaseUid: user.uid,
          name: name.trim(),
          email: email.trim(),
          phone: fullPhone,
        });
      } catch (dbError) {
        // Log the database error but don't block login
        console.error("Failed to save user profile to database:", dbError);
      }

      // Mark that this is a brand-new registration so the currency
      // setup dialog shows exactly once on the first dashboard visit.
      localStorage.setItem("showCurrencySetup", "true");

      // Step E: Send Firebase email verification (non-fatal if it fails)
      let verifyEmailError: string | null = null;
      try {
        await sendEmailVerification(user);
      } catch (verifyErr: unknown) {
        verifyEmailError =
          verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
        console.error("[Register] sendEmailVerification failed:", verifyEmailError);
      }

      navigate("/verify-email", {
        replace: true,
        state: verifyEmailError ? { sendError: verifyEmailError } : undefined,
      });
    } catch (err) {
      setErrorMessage(parseFirebaseError(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  // -------------------------------------------------------------------------
  // Google sign-up handler
  // -------------------------------------------------------------------------
  async function handleGoogleSignUp(): Promise<void> {
    setErrorMessage(null);
    setIsGoogleSubmitting(true);
    try {
      await signInGoogle();
      // For Google sign-in, show currency setup only if this is a new account
      // (a simple check on whether preferredCurrency is already saved works for
      // all cases — returning users will already have this key set).
      if (!localStorage.getItem("preferredCurrency")) {
        localStorage.setItem("showCurrencySetup", "true");
      }
      navigate("/dashboard", { replace: true });
      // Google accounts have no phone by default — nudge user to add one
      setTimeout(() => {
        toast({
          title: "Add your phone number",
          description: "Visit Settings to add a phone number so you can sign in with it later.",
          duration: 8000,
        });
      }, 800);
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
          <h2 className="text-4xl font-bold text-white leading-tight mb-4">Join Budget Buddy</h2>
          <p className="text-indigo-200 text-base leading-relaxed">
            Create your account and start tracking finances with smart insights and beautiful charts.
          </p>
        </div>

        {/* Footer */}
        <p className="text-indigo-300 text-xs z-10">© {new Date().getFullYear()} Budget Buddy. All rights reserved.</p>
      </div>

      {/* ================================================================ */}
      {/* Right form panel                                                  */}
      {/* ================================================================ */}
      <div className="flex flex-1 flex-col items-center justify-center bg-white px-6 py-12 overflow-y-auto">
        <div className="w-full max-w-md">

          {/* Mobile-only logo */}
          <div className="mb-8 flex justify-center lg:hidden">
            <img src="/logo.png" alt="Budget Buddy" className="h-14 w-14 rounded-2xl object-contain" />
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Create Account</h1>
            <p className="mt-1 text-sm text-gray-500">Start tracking your finances with Budget Buddy</p>
          </div>

          {/* Error message */}
          {errorMessage && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-600">{errorMessage}</p>
            </div>
          )}

          {/* Registration form */}
          <form onSubmit={handleEmailRegister} noValidate className="space-y-4">
            {/* Full Name */}
            <div>
              <label htmlFor="register-name" className="block text-sm font-medium text-gray-700 mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                  <svg className="h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
                  </svg>
                </span>
                <input
                  id="register-name"
                  type="text"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="John Doe"
                  disabled={isSubmitting || isGoogleSubmitting}
                />
              </div>
            </div>

            {/* Phone Number with Country Code */}
            <div>
              <label htmlFor="register-phone" className="block text-sm font-medium text-gray-700 mb-1.5">
                Phone Number <span className="text-gray-400 font-normal">(Optional)</span>
              </label>
              <div className="flex gap-2">
                <Select value={countryCode} onValueChange={setCountryCode} disabled={isSubmitting || isGoogleSubmitting}>
                  <SelectTrigger className="w-[100px] rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    <SelectItem value="+91">+91 (IN)</SelectItem>
                    <SelectItem value="+1">+1 (US)</SelectItem>
                    <SelectItem value="+44">+44 (UK)</SelectItem>
                    <SelectItem value="+61">+61 (AU)</SelectItem>
                    <SelectItem value="+49">+49 (DE)</SelectItem>
                    <SelectItem value="+81">+81 (JP)</SelectItem>
                    <SelectItem value="+971">+971 (AE)</SelectItem>
                    <SelectItem value="+65">+65 (SG)</SelectItem>
                  </SelectContent>
                </Select>
                <input
                  id="register-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  value={phoneNumber}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "");
                    const maxLen = phoneMaxLengths[countryCode] ?? 15;
                    setPhoneNumber(digits.slice(0, maxLen));
                  }}
                  className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder={phonePlaceholders[countryCode] || "Enter phone number"}
                  maxLength={phoneMaxLengths[countryCode] ?? 15}
                  disabled={isSubmitting || isGoogleSubmitting}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label htmlFor="register-email" className="block text-sm font-medium text-gray-700 mb-1.5">
                Email address
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                  <svg className="h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/>
                  </svg>
                </span>
                <input
                  id="register-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="you@example.com"
                  disabled={isSubmitting || isGoogleSubmitting}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="register-password" className="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                  <svg className="h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                  </svg>
                </span>
                <input
                  id="register-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Strong password required"
                  disabled={isSubmitting || isGoogleSubmitting}
                />
              </div>
              <p className="mt-1.5 text-xs text-gray-400">
                Min 8 chars, uppercase, number & special character (@$!%*?&)
              </p>
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="register-confirm-password" className="block text-sm font-medium text-gray-700 mb-1.5">
                Confirm Password
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                  <svg className="h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                  </svg>
                </span>
                <input
                  id="register-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Re-enter password"
                  disabled={isSubmitting || isGoogleSubmitting}
                />
              </div>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isSubmitting || isGoogleSubmitting}
              className="mt-2 w-full rounded-xl py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}
            >
              {isSubmitting ? "Creating account…" : "Create Account"}
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
              onClick={handleGoogleSignUp}
              disabled={isSubmitting || isGoogleSubmitting}
              className="flex flex-1 items-center justify-center gap-2.5 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              {isGoogleSubmitting ? "Signing up…" : "Google"}
            </button>
            <div className="flex flex-1 flex-col items-center">
              <div id="pheIncludedContent" className="w-full" />
              {isPhoneSubmitting && (
                <p className="mt-1 text-xs text-gray-400">Verifying phone…</p>
              )}
            </div>
          </div>

          {/* Footer */}
          <p className="mt-8 text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-700">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
