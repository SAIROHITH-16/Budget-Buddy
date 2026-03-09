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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0a0a0a] px-4">

      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[600px] w-[600px] rounded-full bg-purple-800/20 blur-[140px]" />
        <div className="absolute -bottom-40 right-0 h-[700px] w-[700px] rounded-full bg-purple-600/20 blur-[140px]" />
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm">
        <div className="rounded-3xl border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.05)] p-8 backdrop-blur-[20px]">

          {/* Icon + heading */}
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6366f1] to-[#a855f7]">
              <Mail className="h-7 w-7 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white">Verify your email</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/50">
              We sent a verification link to{" "}
              <span className="font-semibold text-white/80">{currentUser.email}</span>.
              <br />
              Click the link, then press the button below.
            </p>
          </div>

          {/* Error from initial send at registration */}
          {initialSendError && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <p className="text-xs text-amber-300">
                <span className="font-semibold">Initial email failed:</span> {initialSendError}. Use Resend below.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {/* Primary CTA */}
            <button
              onClick={handleCheckVerified}
              disabled={checking}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#6366f1] to-[#a855f7] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {checking ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Checking…</>
              ) : (
                <><CheckCircle2 className="h-4 w-4" />I&apos;ve verified my email</>
              )}
            </button>

            {checkError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <p className="text-xs text-red-400">{checkError}</p>
              </div>
            )}

            {/* Resend */}
            <button
              onClick={handleResend}
              disabled={resendSending || resendCooldown > 0}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resendSending ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Sending…</>
              ) : resendSent ? (
                <><CheckCircle2 className="h-4 w-4 text-green-400" />Email sent!</>
              ) : resendCooldown > 0 ? (
                <><RefreshCw className="h-4 w-4" />Resend in {resendCooldown}s</>
              ) : (
                <><RefreshCw className="h-4 w-4" />Resend verification email</>
              )}
            </button>

            {resendError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <p className="text-xs text-red-400">{resendError}</p>
              </div>
            )}

            {/* Divider */}
            <div className="relative flex items-center gap-3 py-1">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs text-white/30">or</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            {/* Sign out */}
            <button
              onClick={handleSignOut}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm text-white/40 transition-colors hover:text-white/70"
            >
              <LogOut className="h-4 w-4" />
              Sign out and use a different account
            </button>

            <p className="text-center text-xs text-white/25">
              Didn&apos;t receive the email? Check spam, wait 60 s, then use <span className="text-white/50">Resend</span>.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
