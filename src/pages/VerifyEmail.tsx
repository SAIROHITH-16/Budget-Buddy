// src/pages/VerifyEmail.tsx
// Shown immediately after email+password registration.
// Blocks access to the app until the user clicks the Firebase verification link.
//
// Flow:
//   1. Freshly registered user lands here — email verification already sent by Register.tsx.
//   2. User clicks "I've verified my email" → we call reload() to refresh the Firebase User
//      object, then redirect to /dashboard if emailVerified becomes true.
//   3. "Resend" button with 60-second cooldown to prevent spam.
//   4. "Sign out" link in case they used a wrong email address.

import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { sendEmailVerification, reload } from "firebase/auth";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/firebase";
import {
  Mail,
  RefreshCw,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";

const RESEND_COOLDOWN_SECONDS = 60;

export default function VerifyEmail() {
  const { currentUser, signOutUser } = useAuth();
  const navigate = useNavigate();
  const location  = useLocation();

  // Error forwarded from Register.tsx if sendEmailVerification failed at signup
  const initialSendError: string | null =
    (location.state as { sendError?: string } | null)?.sendError ?? null;

  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendSending, setResendSending] = useState(false);
  const [resendSent, setResendSent]       = useState(false);
  const [resendError, setResendError]     = useState<string | null>(null);

  const [checking, setChecking]     = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  // ── Guard: redirect if not signed in or already verified ────────────────
  useEffect(() => {
    if (!currentUser) {
      navigate("/login", { replace: true });
      return;
    }
    if (currentUser.emailVerified) {
      navigate("/dashboard", { replace: true });
    }
  }, [currentUser, navigate]);

  // ── Countdown timer for resend cooldown ──────────────────────────────────
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  // ── Resend verification email ────────────────────────────────────────────
  async function handleResend() {
    if (!auth.currentUser) return;
    setResendSending(true);
    setResendError(null);
    setResendSent(false);
    try {
      await sendEmailVerification(auth.currentUser);
      setResendSent(true);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setTimeout(() => setResendSent(false), 5_000);
    } catch (e: any) {
      setResendError(e.message ?? "Failed to send verification email.");
    } finally {
      setResendSending(false);
    }
  }

  // ── Check if user has verified since landing on this page ───────────────
  async function handleCheckVerified() {
    if (!auth.currentUser) return;
    setChecking(true);
    setCheckError(null);
    try {
      // reload() fetches the latest account data from Firebase servers,
      // updating emailVerified on the local User object.
      await reload(auth.currentUser);
      if (auth.currentUser.emailVerified) {
        navigate("/dashboard", { replace: true });
      } else {
        setCheckError(
          "Email not verified yet — please check your inbox and click the link."
        );
      }
    } catch {
      setCheckError("Could not check verification status. Please try again.");
    } finally {
      setChecking(false);
    }
  }

  // ── Sign out and let the user try a different address ───────────────────
  async function handleSignOut() {
    await signOutUser();
    navigate("/login", { replace: true });
  }

  // Don't render anything while the redirect fires
  if (!currentUser) return null;

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
      <div className="flex w-full max-w-5xl overflow-hidden rounded-[2rem] shadow-xl" style={{ minHeight: "520px" }}>

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
              Verify Your<br />Email .!
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-white/75">
              One last step — confirm your address and you&apos;re in.
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
              <Mail className="h-6 w-6 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Verify your email</h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">
              We sent a verification link to{" "}
              <span className="font-semibold text-gray-800">{currentUser.email}</span>.
              <br />
              Click the link, then press the button below.
            </p>
          </div>

          {/* Error from initial send at registration */}
          {initialSendError && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p className="text-xs text-amber-700">
                <span className="font-semibold">Initial email failed:</span> {initialSendError}. Use Resend below.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {/* Primary CTA */}
            <button
              onClick={handleCheckVerified}
              disabled={checking}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#7C3AED] py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {checking ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Checking…</>
              ) : (
                <><CheckCircle2 className="h-4 w-4" />I&apos;ve verified my email</>
              )}
            </button>

            {checkError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <p className="text-xs text-red-600">{checkError}</p>
              </div>
            )}

            {/* Resend */}
            <button
              onClick={handleResend}
              disabled={resendSending || resendCooldown > 0}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resendSending ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Sending…</>
              ) : resendSent ? (
                <><CheckCircle2 className="h-4 w-4 text-green-500" />Email sent!</>
              ) : resendCooldown > 0 ? (
                <><RefreshCw className="h-4 w-4" />Resend in {resendCooldown}s</>
              ) : (
                <><RefreshCw className="h-4 w-4" />Resend verification email</>
              )}
            </button>

            {resendError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <p className="text-xs text-red-600">{resendError}</p>
              </div>
            )}

            {/* Divider */}
            <div className="relative flex items-center gap-3 py-1">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs text-gray-400">or</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            {/* Sign out */}
            <button
              onClick={handleSignOut}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm text-gray-400 transition-colors hover:text-gray-600"
            >
              <LogOut className="h-4 w-4" />
              Sign out and use a different account
            </button>

            <p className="text-center text-xs text-gray-400">
              Didn&apos;t receive the email? Check spam, wait 60 s, then use <span className="font-medium text-gray-500">Resend</span>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
