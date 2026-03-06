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

import React, { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { type FirebaseError } from "firebase/app";
import { updateProfile } from "@/firebase";
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

      // Step D: Save user profile to MongoDB
      try {
        await api.post("/users/profile", {
          firebaseUid: user.uid,
          name: name.trim(),
          email: email.trim(),
          phone: fullPhone,
        });
      } catch (dbError) {
        // Log the database error but don't block login
        // The user account is already created in Firebase
        console.error("Failed to save user profile to database:", dbError);
      }

      // Mark that this is a brand-new registration so the currency
      // setup dialog shows exactly once on the first dashboard visit.
      localStorage.setItem("showCurrencySetup", "true");

      // Navigate to dashboard on successful registration
      navigate("/dashboard", { replace: true });

      // If no phone was entered, prompt the user to add it in Settings
      if (!phoneNumber.trim()) {
        setTimeout(() => {
          toast({
            title: "Add your phone number",
            description: "You can add a phone number in Settings so you can sign in with it later.",
            duration: 8000,
          });
        }, 800);
      }
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
    <div className="flex min-h-screen items-center justify-center bg-transparent px-4">
      <div className="w-full max-w-md rounded-2xl p-8" style={{ background: "rgba(255,255,255,0.85)", border: "1px solid rgba(255,255,255,0.95)", boxShadow: "0 4px 16px rgba(124,58,237,0.10), 0 12px 48px rgba(124,58,237,0.08), inset 0 1px 0 rgba(255,255,255,1)", backdropFilter: "blur(20px)" }}>

        {/* ---------------------------------------------------------------- */}
        {/* Header                                                            */}
        {/* ---------------------------------------------------------------- */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
            style={{
              background: "linear-gradient(135deg, #10b981, #059669)",
              boxShadow: "0 4px 20px rgba(5,150,105,0.35), inset 0 1px 0 rgba(255,255,255,0.20)",
            }}
          >
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
            Create your account
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Start tracking your finances with Budget Buddy
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
        {/* Registration form                                                 */}
        {/* ---------------------------------------------------------------- */}
        <form onSubmit={handleEmailRegister} noValidate className="space-y-4">
          {/* Full Name */}
          <div className="space-y-1.5">
            <label
              htmlFor="register-name"
              className="block text-sm font-medium text-foreground"
            >
              Full Name
            </label>
            <input
              id="register-name"
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="John Doe"
              disabled={isSubmitting || isGoogleSubmitting}
            />
          </div>

          {/* Phone Number with Country Code */}
          <div className="space-y-1.5">
            <label
              htmlFor="register-phone"
              className="block text-sm font-medium text-foreground"
            >
              Phone Number
            </label>
            <div className="flex gap-2">
              {/* Country Code Selector */}
              <Select
                value={countryCode}
                onValueChange={setCountryCode}
                disabled={isSubmitting || isGoogleSubmitting}
              >
                <SelectTrigger className="w-[100px] rounded-lg border border-input bg-background text-sm text-foreground focus:ring-2 focus:ring-primary focus:ring-offset-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="+91" className="text-foreground">+91 (IN)</SelectItem>
                  <SelectItem value="+1" className="text-foreground">+1 (US)</SelectItem>
                  <SelectItem value="+44" className="text-foreground">+44 (UK)</SelectItem>
                  <SelectItem value="+61" className="text-foreground">+61 (AU)</SelectItem>
                  <SelectItem value="+49" className="text-foreground">+49 (DE)</SelectItem>
                  <SelectItem value="+81" className="text-foreground">+81 (JP)</SelectItem>
                  <SelectItem value="+971" className="text-foreground">+971 (AE)</SelectItem>
                  <SelectItem value="+65" className="text-foreground">+65 (SG)</SelectItem>
                </SelectContent>
              </Select>

              {/* Phone Number Input */}
              <input
                id="register-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={phoneNumber}
                onChange={(e) => {
                  // Allow digits only
                  const digits = e.target.value.replace(/\D/g, "");
                  const maxLen = phoneMaxLengths[countryCode] ?? 15;
                  setPhoneNumber(digits.slice(0, maxLen));
                }}
                className="flex-1 rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder={phonePlaceholders[countryCode] || "Enter phone number"}
                maxLength={phoneMaxLengths[countryCode] ?? 15}
                disabled={isSubmitting || isGoogleSubmitting}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Digits only · {phoneMaxLengths[countryCode] ?? 15} digits required for {countryCode} · Optional
            </p>
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label
              htmlFor="register-email"
              className="block text-sm font-medium text-foreground"
            >
              Email address
            </label>
            <input
              id="register-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="you@example.com"
              disabled={isSubmitting || isGoogleSubmitting}
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label
              htmlFor="register-password"
              className="block text-sm font-medium text-foreground"
            >
              Password
            </label>
            <input
              id="register-password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Strong password required"
              disabled={isSubmitting || isGoogleSubmitting}
            />
            <p className="text-xs text-muted-foreground/60 mt-1">
              Must be at least 8 characters, include an uppercase letter, a number, and a special character (@$!%*?&).
            </p>
          </div>

          {/* Confirm password */}
          <div className="space-y-1.5">
            <label
              htmlFor="register-confirm-password"
              className="block text-sm font-medium text-foreground"
            >
              Confirm password
            </label>
            <input
              id="register-confirm-password"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Re-enter password"
              disabled={isSubmitting || isGoogleSubmitting}
            />
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={isSubmitting || isGoogleSubmitting}
            className="mt-2 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Creating account…" : "Create account"}
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
        {/* Google sign-up button                                             */}
        {/* ---------------------------------------------------------------- */}
        <button
          type="button"
          onClick={handleGoogleSignUp}
          disabled={isSubmitting || isGoogleSubmitting}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
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
          {isGoogleSubmitting ? "Signing up…" : "Continue with Google"}
        </button>

        {/* ---------------------------------------------------------------- */}
        {/* Footer — link to login                                           */}
        {/* ---------------------------------------------------------------- */}
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
