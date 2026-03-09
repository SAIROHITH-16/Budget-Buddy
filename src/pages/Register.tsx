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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

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

  // Phone dialog (shown after Google sign-up)
  const [showPhoneDialog, setShowPhoneDialog] = useState<boolean>(false);
  const [dialogCountryCode, setDialogCountryCode] = useState<string>("+91");
  const [dialogPhone, setDialogPhone] = useState<string>("");
  const [dialogPhoneSaving, setDialogPhoneSaving] = useState<boolean>(false);
  const [googleUid, setGoogleUid] = useState<string>("");
  const [googleEmail, setGoogleEmail] = useState<string>("");

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
  // Google sign-up handler — opens phone dialog, then forces currency setup
  // -------------------------------------------------------------------------
  async function handleGoogleSignUp(): Promise<void> {
    setErrorMessage(null);
    setIsGoogleSubmitting(true);
    try {
      const credential = await signInGoogle();
      const user = credential.user;
      setGoogleUid(user.uid);
      setGoogleEmail(user.email ?? "");
      // Always force currency setup for Google sign-ins
      localStorage.setItem("showCurrencySetup", "true");
      // Show phone number dialog before proceeding to dashboard
      setShowPhoneDialog(true);
    } catch (err) {
      setErrorMessage(parseFirebaseError(err));
    } finally {
      setIsGoogleSubmitting(false);
    }
  }

  // -------------------------------------------------------------------------
  // Phone dialog — save phone then go to dashboard (currency dialog auto-opens)
  // -------------------------------------------------------------------------
  async function handleDialogSavePhone(): Promise<void> {
    setDialogPhoneSaving(true);
    try {
      const fullPhone = `${dialogCountryCode}${dialogPhone.trim()}`;
      await api.post("/users/profile", {
        firebaseUid: googleUid,
        email: googleEmail,
        phone: fullPhone,
      });
    } catch {
      // Non-fatal — proceed to dashboard regardless
    } finally {
      setDialogPhoneSaving(false);
    }
    setShowPhoneDialog(false);
    navigate("/dashboard", { replace: true });
  }

  function handleDialogSkip(): void {
    setShowPhoneDialog(false);
    navigate("/dashboard", { replace: true });
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
      <div className="flex w-full max-w-5xl overflow-hidden rounded-[2rem] shadow-xl">

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
              Create Your<br />Account .!
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-white/75">
              Start tracking your finances with AI-powered insights and smart budgeting.
            </p>
          </div>
        </div>

        {/* RIGHT — glassmorphic form panel */}
        <div
          className="flex w-full flex-col px-8 py-8 md:w-1/2"
          style={{
            background: "rgba(255,255,255,0.85)",
            border: "1px solid rgba(255,255,255,0.95)",
            backdropFilter: "blur(20px)",
          }}
        >
          {/* Header */}
          <div className="mb-5 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#7C3AED]">
              <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
                <line x1="20" y1="8" x2="20" y2="14"/>
                <line x1="23" y1="11" x2="17" y2="11"/>
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Create account</h2>
            <p className="mt-1 text-sm text-gray-500">Welcome to BudgetBuddy</p>
          </div>

          {/* Error */}
          {errorMessage && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-600">{errorMessage}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleEmailRegister} noValidate className="space-y-3">

            {/* Full Name */}
            <div className="space-y-1">
              <label htmlFor="register-name" className="block text-sm font-medium text-gray-700">Full Name</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                </span>
                <input
                  id="register-name"
                  type="text"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#7C3AED] focus:outline-none focus:ring-1 focus:ring-[#7C3AED] disabled:opacity-50"
                  placeholder="John Doe"
                  disabled={isSubmitting || isGoogleSubmitting}
                />
              </div>
            </div>

            {/* Phone */}
            <div className="space-y-1">
              <label htmlFor="register-phone" className="block text-sm font-medium text-gray-700">
                Phone Number <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <div className="flex gap-2">
                <Select value={countryCode} onValueChange={setCountryCode} disabled={isSubmitting || isGoogleSubmitting}>
                  <SelectTrigger className="w-[100px] rounded-xl border border-gray-200 bg-white text-sm text-gray-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
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
                  className="flex-1 rounded-xl border border-gray-200 py-2.5 px-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#7C3AED] focus:outline-none focus:ring-1 focus:ring-[#7C3AED] disabled:opacity-50"
                  placeholder={phonePlaceholders[countryCode] || "Enter phone"}
                  maxLength={phoneMaxLengths[countryCode] ?? 15}
                  disabled={isSubmitting || isGoogleSubmitting}
                />
              </div>
              <p className="text-xs text-gray-400">{phoneMaxLengths[countryCode] ?? 15} digits · {countryCode}</p>
            </div>

            {/* Email */}
            <div className="space-y-1">
              <label htmlFor="register-email" className="block text-sm font-medium text-gray-700">Email address</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 9.5 6.5a1 1 0 0 0 1 0L22 7"/>
                  </svg>
                </span>
                <input
                  id="register-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#7C3AED] focus:outline-none focus:ring-1 focus:ring-[#7C3AED] disabled:opacity-50"
                  placeholder="you@example.com"
                  disabled={isSubmitting || isGoogleSubmitting}
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1">
              <label htmlFor="register-password" className="block text-sm font-medium text-gray-700">Password</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </span>
                <input
                  id="register-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#7C3AED] focus:outline-none focus:ring-1 focus:ring-[#7C3AED] disabled:opacity-50"
                  placeholder="Min 8 chars, uppercase, number, special"
                  disabled={isSubmitting || isGoogleSubmitting}
                />
              </div>
              <p className="text-xs text-gray-400">Min 8 chars · uppercase · number · special char (@$!%*?&amp;)</p>
            </div>

            {/* Confirm Password */}
            <div className="space-y-1">
              <label htmlFor="register-confirm-password" className="block text-sm font-medium text-gray-700">Confirm password</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </span>
                <input
                  id="register-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#7C3AED] focus:outline-none focus:ring-1 focus:ring-[#7C3AED] disabled:opacity-50"
                  placeholder="Re-enter password"
                  disabled={isSubmitting || isGoogleSubmitting}
                />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting || isGoogleSubmitting}
              className="mt-1 w-full rounded-xl bg-[#7C3AED] py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Creating account…" : "Create account"}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400">or continue with</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          {/* Social */}
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleGoogleSignUp}
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
          </div>

          {/* Phone.Email widget */}
          <div className="mt-3 flex flex-col items-center">
            <div id="pheIncludedContent" />
            {isPhoneSubmitting && <p className="mt-2 text-xs text-gray-400">Verifying phone…</p>}
          </div>

          {/* Footer */}
          <p className="mt-auto pt-5 text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link to="/login" className="font-semibold text-[#7C3AED] hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>

    {/* ── Phone number dialog (shown after Google sign-up) ────────────── */}
    <Dialog open={showPhoneDialog} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-sm rounded-2xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#7C3AED]">
            <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </div>
          <DialogTitle className="text-center text-xl font-bold text-gray-900">
            Add your phone number
          </DialogTitle>
          <DialogDescription className="text-center text-sm text-gray-500">
            Add a phone number to sign in with SMS later. You can skip this step.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">Phone number <span className="font-normal text-gray-400">(optional)</span></label>
            <div className="flex gap-2">
              <Select value={dialogCountryCode} onValueChange={setDialogCountryCode} disabled={dialogPhoneSaving}>
                <SelectTrigger className="w-[110px] rounded-xl border border-gray-200 bg-white text-sm text-gray-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
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
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={dialogPhone}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "");
                  const maxLen = phoneMaxLengths[dialogCountryCode] ?? 15;
                  setDialogPhone(digits.slice(0, maxLen));
                }}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 px-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#7C3AED] focus:outline-none focus:ring-1 focus:ring-[#7C3AED] disabled:opacity-50"
                placeholder={phonePlaceholders[dialogCountryCode] || "Enter phone"}
                maxLength={phoneMaxLengths[dialogCountryCode] ?? 15}
                disabled={dialogPhoneSaving}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleDialogSavePhone}
            disabled={dialogPhoneSaving || dialogPhone.trim().length < 6}
            className="w-full rounded-xl bg-[#7C3AED] py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {dialogPhoneSaving ? "Saving…" : "Save & Continue"}
          </button>

          <button
            type="button"
            onClick={handleDialogSkip}
            disabled={dialogPhoneSaving}
            className="w-full rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            Skip for now
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
