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

import React, { useState, useRef, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { type FirebaseError } from "firebase/app";
import { updateProfile, sendEmailVerification, auth, RecaptchaVerifier, linkWithPhoneNumber, type ConfirmationResult } from "@/firebase";
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

  // Phone OTP / email-verify / phone-setup step flow
  const [step, setStep] = useState<"form" | "phone-otp" | "email-verify" | "phone-setup">("form");
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [phoneOtp, setPhoneOtp] = useState<string>("");
  const [verifyingPhone, setVerifyingPhone] = useState<boolean>(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  // Resend activation email (from the email-verify step)
  const [resendEmailSending, setResendEmailSending] = useState(false);
  const [resendEmailSent,    setResendEmailSent]    = useState(false);
  const [resendEmailError,   setResendEmailError]   = useState<string | null>(null);
  // whether the initial activation email send succeeded
  const [initialEmailFailed, setInitialEmailFailed] = useState(false);

  // phone-setup step — add/verify phone after email-verify
  const [setupCountryCode,  setSetupCountryCode]  = useState<string>("+91");
  const [setupPhoneInput,   setSetupPhoneInput]   = useState<string>("");
  const [setupSending,      setSetupSending]      = useState(false);
  const [setupConfirmation, setSetupConfirmation] = useState<ConfirmationResult | null>(null);
  const [setupOtpCode,      setSetupOtpCode]      = useState("");
  const [setupOtpVisible,   setSetupOtpVisible]   = useState(false);
  const [setupOtpError,     setSetupOtpError]     = useState<string | null>(null);
  const [setupVerifying,    setSetupVerifying]    = useState(false);
  const setupRecaptchaRef = useRef<RecaptchaVerifier | null>(null);

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

      // Step E: Send Firebase email verification (same infrastructure as password reset)
      let emailSent = false;
      try {
        await sendEmailVerification(user);
        emailSent = true;
      } catch (mailErr: any) {
        console.error("Email verification send failed:", mailErr);
        emailSent = false;
      }

      // If phone was entered, verify it via Firebase SMS before proceeding
      if (phoneNumber.trim()) {
        try {
          const verifier = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
          recaptchaVerifierRef.current = verifier;
          const result = await linkWithPhoneNumber(user, fullPhone, verifier);
          setConfirmationResult(result);
          setStep("phone-otp");
          return;
        } catch (phoneErr: any) {
          if (phoneErr.code === "auth/billing-not-enabled") {
            // Firebase phone SMS requires Blaze plan — skip silently
            console.warn("Phone auth skipped: Firebase Blaze plan required for SMS.");
          } else {
            console.warn("Phone OTP send failed, skipping:", phoneErr);
          }
          // Fall through to email-verify
        }
      }

      // Mark that this is a brand-new registration so the currency
      // setup dialog shows exactly once on the first dashboard visit.
      localStorage.setItem("showCurrencySetup", "true");
      if (!emailSent) setInitialEmailFailed(true);

      // Show the email verification prompt before entering the app
      setStep("email-verify");
    } catch (err) {
      setErrorMessage(parseFirebaseError(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  // -------------------------------------------------------------------------
  // Phone OTP verification handler
  // -------------------------------------------------------------------------
  async function handleVerifyPhone(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!confirmationResult) return;
    setErrorMessage(null);
    setVerifyingPhone(true);
    try {
      await confirmationResult.confirm(phoneOtp.trim());

      // Tell the backend to mark the phone as verified
      try {
        await api.post("/users/mark-phone-verified");
      } catch (backendErr) {
        console.warn("Backend mark-phone-verified failed:", backendErr);
      }

      setPhoneVerified(true);
      localStorage.setItem("showCurrencySetup", "true");
      // Retry email verification if the initial attempt failed
      if (initialEmailFailed && auth.currentUser) {
        sendEmailVerification(auth.currentUser).catch(() => {});
        setInitialEmailFailed(false);
      }
      setStep("email-verify");
    } catch (err) {
      setErrorMessage("Invalid code. Please check and try again.");
    } finally {
      setVerifyingPhone(false);
    }
  }

  // Skip phone verification — still show the email verification prompt
  function handleSkipPhoneVerification(): void {
    localStorage.setItem("showCurrencySetup", "true");
    setStep("email-verify");
  }

  // Resend Firebase email verification from the email-verify step
  async function handleResendEmailFromStep(): Promise<void> {
    if (!auth.currentUser) return;
    setResendEmailSending(true);
    setResendEmailError(null);
    setResendEmailSent(false);
    try {
      await sendEmailVerification(auth.currentUser);
      setResendEmailSent(true);
      setTimeout(() => setResendEmailSent(false), 8000);
    } catch (e: any) {
      setResendEmailError(e.message ?? "Failed to resend. Please try again.");
    } finally {
      setResendEmailSending(false);
    }
  }

  // Pre-fill phone-setup from form values and navigate to that step
  function goToPhoneSetup(): void {
    setSetupCountryCode(countryCode);
    setSetupPhoneInput(phoneNumber);
    setSetupOtpVisible(false);
    setSetupOtpCode("");
    setSetupOtpError(null);
    setStep("phone-setup");
  }

  // Send OTP for the phone entered in the phone-setup step
  async function handleSetupSendOtp(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!auth.currentUser) return;
    const digits = setupPhoneInput.replace(/\D/g, "");
    const maxLen = phoneMaxLengths[setupCountryCode] ?? 15;
    if (digits.length !== maxLen) {
      setSetupOtpError(`Phone number must be exactly ${maxLen} digits for ${setupCountryCode}.`);
      return;
    }
    setSetupSending(true);
    setSetupOtpError(null);
    try {
      if (setupRecaptchaRef.current) { setupRecaptchaRef.current.clear(); setupRecaptchaRef.current = null; }
      const verifier = new RecaptchaVerifier(auth, "setup-recaptcha-container", { size: "invisible" });
      setupRecaptchaRef.current = verifier;
      const fullPhone = `${setupCountryCode}${setupPhoneInput.trim()}`;
      const result = await linkWithPhoneNumber(auth.currentUser, fullPhone, verifier);
      setSetupConfirmation(result);
      setSetupOtpVisible(true);
    } catch (err: any) {
      if (err.code === "auth/provider-already-linked" || err.code === "auth/credential-already-in-use") {
        try { await api.post("/users/mark-phone-verified"); } catch { /* ignore */ }
        navigate("/dashboard", { replace: true });
        return;
      }
      if (err.code === "auth/billing-not-enabled") {
        setSetupOtpError("Phone verification requires Firebase Blaze plan. Please upgrade your Firebase project at console.firebase.google.com, or skip for now.");
      } else {
        setSetupOtpError(err.message ?? "Failed to send verification code.");
      }
      if (setupRecaptchaRef.current) { setupRecaptchaRef.current.clear(); setupRecaptchaRef.current = null; }
    } finally {
      setSetupSending(false);
    }
  }

  // Confirm OTP for the phone-setup step
  async function handleSetupConfirmOtp(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!setupConfirmation) return;
    setSetupVerifying(true);
    setSetupOtpError(null);
    try {
      await setupConfirmation.confirm(setupOtpCode.trim());
      const fullPhone = `${setupCountryCode}${setupPhoneInput.trim()}`;
      // If no phone was in the original form, update the backend profile now
      if (!phoneNumber.trim()) {
        await api.post("/users/profile", {
          firebaseUid: auth.currentUser!.uid,
          name: auth.currentUser!.displayName ?? "",
          email: email.trim(),
          phone: fullPhone,
        }).catch(() => {});
      }
      await api.post("/users/mark-phone-verified");
      navigate("/dashboard", { replace: true });
    } catch {
      setSetupOtpError("Invalid code. Please check and try again.");
    } finally {
      setSetupVerifying(false);
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
      {/* Invisible reCAPTCHA mount point — must always be in the DOM */}
      <div id="recaptcha-container" />

      <div className="w-full max-w-md rounded-2xl p-8" style={{ background: "rgba(255,255,255,0.85)", border: "1px solid rgba(255,255,255,0.95)", boxShadow: "0 4px 16px rgba(124,58,237,0.10), 0 12px 48px rgba(124,58,237,0.08), inset 0 1px 0 rgba(255,255,255,1)", backdropFilter: "blur(20px)" }}>

        {/* ================================================================ */}
        {/* Email verification prompt (after registration / phone OTP)       */}
        {/* ================================================================ */}
        {step === "email-verify" && (
          <>
            <div className="mb-8 text-center">
              <div
                className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
                style={{
                  background: "linear-gradient(135deg, #f59e0b, #d97706)",
                  boxShadow: "0 4px 20px rgba(245,158,11,0.40), inset 0 1px 0 rgba(255,255,255,0.25)",
                }}
              >
                {/* Envelope icon */}
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Verify your email</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                We sent an activation link to
              </p>
              <p className="mt-0.5 text-sm font-semibold text-foreground">{email.trim()}</p>
            </div>

            {/* Warning banner if initial send failed */}
            {initialEmailFailed && !resendEmailSent && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50/70 dark:bg-red-900/10 dark:border-red-800/40 px-4 py-3">
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">Email could not be sent</p>
                <p className="text-xs text-red-600 dark:text-red-300 mt-0.5">
                  Our mail server may not be configured yet. Click <strong>Resend</strong> below to try again, or contact support.
                </p>
              </div>
            )}

            {/* Info box */}
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/70 dark:bg-amber-900/10 dark:border-amber-800/40 px-4 py-4 space-y-1.5">
              <p className="text-sm text-foreground font-medium">What to do next:</p>
              <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                <li>Open the email in your inbox</li>
                <li>Click the <strong className="text-foreground">Activate account</strong> button</li>
                <li>Come back and sign in</li>
              </ol>
              <p className="text-xs text-muted-foreground pt-1">The link expires in <strong>24 hours</strong>. Check your spam folder if you don't see it.</p>
            </div>

            {/* Resend button */}
            <button
              type="button"
              onClick={handleResendEmailFromStep}
              disabled={resendEmailSending || resendEmailSent}
              className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                resendEmailSent
                  ? "bg-green-600 text-white"
                  : "bg-amber-500 hover:bg-amber-600 text-white"
              }`}
            >
              {resendEmailSending
                ? "Sending…"
                : resendEmailSent
                ? "✓ Email resent! Check your inbox"
                : "Resend activation email"}
            </button>

            {resendEmailError && (
              <p className="mt-2 text-xs text-destructive text-center">{resendEmailError}</p>
            )}

            {/* Continue — go to phone-setup if phone not yet verified */}
            <button
              type="button"
              onClick={() => phoneVerified ? navigate("/dashboard", { replace: true }) : goToPhoneSetup()}
              className="mt-4 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              {phoneVerified ? "Continue to dashboard →" : "Next: verify phone number →"}
            </button>
          </>
        )}

        {/* ================================================================ */}
        {/* Phone setup step — add + verify phone after email-verify          */}
        {/* ================================================================ */}
        {step === "phone-setup" && (
          <>
            {/* Hidden reCAPTCHA for phone-setup OTP */}
            <div id="setup-recaptcha-container" />

            <div className="mb-8 text-center">
              <div
                className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
                style={{
                  background: "linear-gradient(135deg, #0ea5e9, #2563eb)",
                  boxShadow: "0 4px 20px rgba(37,99,235,0.40), inset 0 1px 0 rgba(255,255,255,0.25)",
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Verify your phone</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {phoneNumber.trim()
                  ? "Enter the code sent to your phone number"
                  : "Add a phone number to secure your account"}
              </p>
            </div>

            {/* Phase 1: phone input + send code */}
            {!setupOtpVisible && (
              <form onSubmit={handleSetupSendOtp} noValidate className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-foreground">Phone Number</label>
                  <div className="flex gap-2">
                    <Select value={setupCountryCode} onValueChange={setSetupCountryCode}>
                      <SelectTrigger className="w-[100px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="+91">🇮🇳 +91</SelectItem>
                        <SelectItem value="+1">🇺🇸 +1</SelectItem>
                        <SelectItem value="+44">🇬🇧 +44</SelectItem>
                        <SelectItem value="+61">🇦🇺 +61</SelectItem>
                        <SelectItem value="+49">🇩🇪 +49</SelectItem>
                        <SelectItem value="+81">🇯🇵 +81</SelectItem>
                        <SelectItem value="+971">🇦🇪 +971</SelectItem>
                        <SelectItem value="+65">🇸🇬 +65</SelectItem>
                      </SelectContent>
                    </Select>
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={setupPhoneInput}
                      onChange={(e) => setSetupPhoneInput(e.target.value.replace(/\D/g, ""))}
                      placeholder={phonePlaceholders[setupCountryCode] ?? "Phone number"}
                      maxLength={phoneMaxLengths[setupCountryCode] ?? 15}
                      className="flex-1 rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
                      disabled={setupSending}
                    />
                  </div>
                  {setupOtpError && (
                    <p className="flex items-center gap-1.5 text-sm text-destructive">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                      {setupOtpError}
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={setupSending || setupPhoneInput.replace(/\D/g, "").length < 7}
                  className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {setupSending ? "Sending code…" : "Send verification code"}
                </button>
              </form>
            )}

            {/* Phase 2: OTP input */}
            {setupOtpVisible && (
              <form onSubmit={handleSetupConfirmOtp} noValidate className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-foreground">Verification code</label>
                  <p className="text-xs text-muted-foreground">
                    Sent to <span className="font-medium text-foreground">{setupCountryCode} {setupPhoneInput}</span>
                  </p>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={setupOtpCode}
                    onChange={(e) => setSetupOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-center text-xl tracking-[0.4em] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
                    placeholder="------"
                    disabled={setupVerifying}
                  />
                  {setupOtpError && (
                    <p className="text-sm text-destructive">{setupOtpError}</p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={setupVerifying || setupOtpCode.length !== 6}
                  className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {setupVerifying ? "Verifying…" : "Verify phone"}
                </button>
                <button
                  type="button"
                  onClick={() => { setSetupOtpVisible(false); setSetupOtpCode(""); setSetupOtpError(null); }}
                  className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
                >
                  Re-enter phone number
                </button>
              </form>
            )}

            <button
              type="button"
              onClick={() => navigate("/dashboard", { replace: true })}
              className="mt-5 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Skip for now
            </button>
          </>
        )}

        {/* ================================================================ */}
        {/* Phone OTP verification step                                       */}
        {/* ================================================================ */}
        {step === "phone-otp" && (
          <>
            <div className="mb-8 text-center">
              <div
                className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
                style={{
                  background: "linear-gradient(135deg, #0ea5e9, #2563eb)",
                  boxShadow: "0 4px 20px rgba(37,99,235,0.40), inset 0 1px 0 rgba(255,255,255,0.25)",
                }}
              >
                {/* Phone / SMS icon */}
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Verify your phone</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter the 6-digit code sent to{" "}
                <span className="font-medium text-foreground">{countryCode} {phoneNumber}</span>
              </p>
            </div>

            {errorMessage && (
              <div className="mb-5 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
                <p className="text-sm text-destructive">{errorMessage}</p>
              </div>
            )}

            <form onSubmit={handleVerifyPhone} noValidate className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="phone-otp-input" className="block text-sm font-medium text-foreground">
                  Verification code
                </label>
                <input
                  id="phone-otp-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={phoneOtp}
                  onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-center text-xl tracking-[0.4em] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
                  placeholder="------"
                  disabled={verifyingPhone}
                />
              </div>

              <button
                type="submit"
                disabled={verifyingPhone || phoneOtp.length !== 6}
                className="mt-2 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {verifyingPhone ? "Verifying…" : "Verify phone"}
              </button>
            </form>

            <button
              type="button"
              onClick={handleSkipPhoneVerification}
              className="mt-4 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Skip phone verification
            </button>
          </>
        )}

        {/* ================================================================ */}
        {/* Main registration form (step === "form")                          */}
        {/* ================================================================ */}
        {step === "form" && (
        <>
        {/* ---------------------------------------------------------------- */}
        {/* Header                                                            */}
        {/* ---------------------------------------------------------------- */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
            style={{
              background: "linear-gradient(135deg, #0ea5e9, #2563eb)",
              boxShadow: "0 4px 20px rgba(37,99,235,0.40), inset 0 1px 0 rgba(255,255,255,0.25)",
            }}
          >
            {/* Add user / signup icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-7 w-7 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h11" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11v6m-3-3h6" />
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
        </>
        )}
      </div>
    </div>
  );
}
