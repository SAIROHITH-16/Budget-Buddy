// src/pages/PhoneSignIn.tsx
// Native two-step SMS OTP sign-in.
//
// Step 1 â€” PHONE_INPUT: user enters their mobile number â†’ POST /api/auth/send-otp
// Step 2 â€” OTP_INPUT:   user enters the 6-digit code   â†’ POST /api/auth/verify-otp
//           On success, calls signInWithCustomToken() and navigates to /dashboard.

import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signInWithCustomToken, auth } from "@/firebase";
import api from "@/api";
import { Loader2, Phone, ShieldCheck, AlertCircle, ArrowLeft } from "lucide-react";

type Step = "PHONE_INPUT" | "OTP_INPUT";

export default function PhoneSignIn() {
  const navigate = useNavigate();

  const [step,        setStep]        = useState<Step>("PHONE_INPUT");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp,         setOtp]         = useState("");
  const [loading,     setLoading]     = useState(false);
  const [errorMsg,    setErrorMsg]    = useState<string | null>(null);
  const [successMsg,  setSuccessMsg]  = useState<string | null>(null);

  // â”€â”€ Step 1: send OTP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const digits = phoneNumber.replace(/\D/g, "");
    if (digits.length < 10) {
      setErrorMsg("Enter a valid 10-digit mobile number.");
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post("/auth/send-otp", { phoneNumber: digits });
      if (!data.success) throw new Error(data.error ?? "Failed to send OTP.");
      setSuccessMsg("OTP sent! Check your messages.");
      setStep("OTP_INPUT");
    } catch (err: unknown) {
      // Extract the backend error message from the axios response body if present
      const axiosBody = (err as { response?: { data?: { error?: string } } })?.response?.data;
      setErrorMsg(
        axiosBody?.error ?? (err instanceof Error ? err.message : "Could not send OTP. Please try again.")
      );
    } finally {
      setLoading(false);
    }
  }

  // â”€â”€ Step 2: verify OTP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!/^\d{6}$/.test(otp)) {
      setErrorMsg("OTP must be exactly 6 digits.");
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post("/auth/verify-otp", {
        phoneNumber: phoneNumber.replace(/\D/g, ""),
        otp,
      });
      if (!data.success || !data.customToken) {
        throw new Error(data.error ?? "Verification failed.");
      }
      await signInWithCustomToken(auth, data.customToken);
      navigate("/dashboard", { replace: true });
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "Verification failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  // â”€â”€ Shared card wrapper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div className="flex min-h-screen items-center justify-center bg-transparent px-4">
      <div
        className="w-full max-w-md rounded-2xl p-8"
        style={{
          background:    "rgba(255,255,255,0.85)",
          border:        "1px solid rgba(255,255,255,0.95)",
          boxShadow:     "0 4px 16px rgba(124,58,237,0.10), 0 12px 48px rgba(124,58,237,0.08), inset 0 1px 0 rgba(255,255,255,1)",
          backdropFilter: "blur(20px)",
        }}
      >
        {/* â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{
              background: "linear-gradient(135deg, #7c3aed, #a855f7)",
              boxShadow:  "0 4px 20px rgba(124,58,237,0.40), inset 0 1px 0 rgba(255,255,255,0.25)",
            }}
          >
            {step === "OTP_INPUT"
              ? <ShieldCheck className="h-7 w-7 text-white" />
              : <Phone       className="h-7 w-7 text-white" />}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {step === "OTP_INPUT" ? "Enter your OTP" : "Sign in with Phone"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {step === "OTP_INPUT"
              ? `We sent a 6-digit code to +91 ${phoneNumber}`
              : "Get a one-time SMS code to your mobile number"}
          </p>
        </div>

        {/* â”€â”€ Error / success banners â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {errorMsg && (
          <div className="mb-5 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-sm text-destructive">{errorMsg}</p>
          </div>
        )}
        {successMsg && !errorMsg && (
          <div className="mb-5 rounded-lg border border-green-300 bg-green-50 px-4 py-3">
            <p className="text-sm text-green-700">{successMsg}</p>
          </div>
        )}

        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        {/* Step 1 â€” Phone number input                                       */}
        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        {step === "PHONE_INPUT" && (
          <form onSubmit={handleSendOtp} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="phone-input" className="block text-sm font-medium text-foreground">
                Mobile number
              </label>
              <div className="flex">
                {/* Country code badge */}
                <span className="inline-flex items-center rounded-l-lg border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground select-none">
                  +91
                </span>
                <input
                  id="phone-input"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={10}
                  required
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  className="flex-1 rounded-r-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 disabled:opacity-50"
                  placeholder="9876543210"
                  disabled={loading}
                />
              </div>
              <p className="text-xs text-muted-foreground">10-digit Indian mobile number</p>
            </div>

            <button
              type="submit"
              disabled={loading || phoneNumber.replace(/\D/g, "").length < 10}
              className="mt-2 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Sendingâ€¦</> : "Send OTP"}
            </button>
          </form>
        )}

        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        {/* Step 2 â€” OTP input                                                */}
        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        {step === "OTP_INPUT" && (
          <form onSubmit={handleVerifyOtp} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="otp-input" className="block text-sm font-medium text-foreground">
                6-digit code
              </label>
              <input
                id="otp-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                autoFocus
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-center text-xl tracking-[0.5em] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 disabled:opacity-50"
                placeholder="Â·Â·Â·Â·Â·Â·"
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                Didn't receive it?{" "}
                <button
                  type="button"
                  onClick={() => { setStep("PHONE_INPUT"); setOtp(""); setErrorMsg(null); setSuccessMsg(null); }}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Resend OTP
                </button>
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || otp.length < 6}
              className="mt-2 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifyingâ€¦</> : "Verify OTP"}
            </button>

            {/* Back button */}
            <button
              type="button"
              onClick={() => { setStep("PHONE_INPUT"); setOtp(""); setErrorMsg(null); }}
              className="flex w-full items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Change phone number
            </button>
          </form>
        )}

        {/* â”€â”€ Footer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">or</span>
          </div>
        </div>
        <p className="text-center text-sm text-muted-foreground">
          <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Sign in with email instead
          </Link>
        </p>
        <p className="mt-3 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link to="/register" className="font-medium text-primary underline-offset-4 hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
