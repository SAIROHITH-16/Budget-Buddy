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
    <div
      className="flex min-h-screen items-center justify-center bg-transparent p-4"
      style={{
        backgroundImage: [
          "radial-gradient(ellipse 80% 50% at 10% 0%, rgba(255,180,120,0.18) 0%, transparent 60%)",
          "radial-gradient(ellipse 55% 40% at 90% 100%, rgba(165,130,250,0.18) 0%, transparent 55%)",
        ].join(", "),
      }}
    >
      <div className="flex w-full max-w-5xl overflow-hidden rounded-[2rem] shadow-xl" style={{ minHeight: "580px" }}>

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
              Sign In with<br />Phone .!
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-white/75">
              Get a one-time SMS code and log in instantly — no password needed.
            </p>
          </div>
        </div>

        {/* RIGHT — glassmorphic form panel */}
        <div
          className="flex w-full flex-col justify-center px-8 py-10 md:w-1/2"
          style={{
            background: "rgba(255,255,255,0.85)",
            border: "1px solid rgba(255,255,255,0.95)",
            backdropFilter: "blur(20px)",
          }}
        >
          {/* Header */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#7C3AED]">
              {step === "OTP_INPUT"
                ? <ShieldCheck className="h-6 w-6 text-white" />
                : <Phone className="h-6 w-6 text-white" />}
            </div>
            <h2 className="text-2xl font-bold text-gray-900">
              {step === "OTP_INPUT" ? "Enter your OTP" : "Sign in with Phone"}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {step === "OTP_INPUT"
                ? `We sent a 6-digit code to +91 ${phoneNumber}`
                : "Get a one-time SMS code to your mobile number"}
            </p>
          </div>

          {/* Error / success banners */}
          {errorMsg && (
            <div className="mb-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <p className="text-sm text-red-600">{errorMsg}</p>
            </div>
          )}
          {successMsg && !errorMsg && (
            <div className="mb-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
              <p className="text-sm text-green-700">{successMsg}</p>
            </div>
          )}

          {/* Step 1 — Phone number input */}
          {step === "PHONE_INPUT" && (
            <form onSubmit={handleSendOtp} noValidate className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="phone-input" className="block text-sm font-medium text-gray-700">
                  Mobile number
                </label>
                <div className="flex">
                  <span className="inline-flex items-center rounded-l-xl border border-r-0 border-gray-200 bg-gray-50 px-3 text-sm text-gray-500 select-none">
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
                    className="flex-1 rounded-r-xl border border-gray-200 py-2.5 px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#7C3AED] focus:outline-none focus:ring-1 focus:ring-[#7C3AED] disabled:opacity-50"
                    placeholder="9876543210"
                    disabled={loading}
                  />
                </div>
                <p className="text-xs text-gray-400">10-digit Indian mobile number</p>
              </div>

              <button
                type="submit"
                disabled={loading || phoneNumber.replace(/\D/g, "").length < 10}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#7C3AED] py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Sending…</> : "Send OTP"}
              </button>
            </form>
          )}

          {/* Step 2 — OTP input */}
          {step === "OTP_INPUT" && (
            <form onSubmit={handleVerifyOtp} noValidate className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="otp-input" className="block text-sm font-medium text-gray-700">
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
                  className="w-full rounded-xl border border-gray-200 py-2.5 px-3 text-center text-xl tracking-[0.5em] text-gray-900 placeholder:text-gray-400 focus:border-[#7C3AED] focus:outline-none focus:ring-1 focus:ring-[#7C3AED] disabled:opacity-50"
                  placeholder="······"
                  disabled={loading}
                />
                <p className="text-xs text-gray-400">
                  Didn&apos;t receive it?{" "}
                  <button
                    type="button"
                    onClick={() => { setStep("PHONE_INPUT"); setOtp(""); setErrorMsg(null); setSuccessMsg(null); }}
                    className="font-medium text-[#7C3AED] hover:underline"
                  >
                    Resend OTP
                  </button>
                </p>
              </div>

              <button
                type="submit"
                disabled={loading || otp.length < 6}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#7C3AED] py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Verifying…</> : "Verify OTP"}
              </button>

              <button
                type="button"
                onClick={() => { setStep("PHONE_INPUT"); setOtp(""); setErrorMsg(null); }}
                className="flex w-full items-center justify-center gap-1 text-sm text-gray-400 hover:text-gray-600"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Change phone number
              </button>
            </form>
          )}

          {/* Footer */}
          <div className="relative my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400">or</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>
          <p className="text-center text-sm text-gray-500">
            <Link to="/login" className="font-semibold text-[#7C3AED] hover:underline">
              Sign in with email instead
            </Link>
          </p>
          <p className="mt-3 text-center text-sm text-gray-500">
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