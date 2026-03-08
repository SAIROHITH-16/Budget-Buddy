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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-3 pb-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Verify your email</CardTitle>
          <CardDescription className="text-sm leading-relaxed">
            We sent a verification link to{" "}
            <strong className="text-foreground">{currentUser.email}</strong>.
            <br />
            Click the link in that email, then come back and press the button below.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* ── Primary CTA: confirm verification ─────────────────────── */}
          <Button className="w-full" onClick={handleCheckVerified} disabled={checking}>
            {checking ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking…</>
            ) : (
              <><CheckCircle2 className="mr-2 h-4 w-4" />I've verified my email</>
            )}
          </Button>

          {checkError && (
            <p className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {checkError}
            </p>
          )}

          {/* ── Error from initial send at registration ────────────── */}
          {initialSendError && (
            <p className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span><strong>Initial email failed to send:</strong> {initialSendError}. Use the Resend button below.</span>
            </p>
          )}

          {/* ── Resend button ──────────────────────────────────────────── */}
          <Button
            variant="outline"
            className="w-full"
            onClick={handleResend}
            disabled={resendSending || resendCooldown > 0}
          >
            {resendSending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</>
            ) : resendSent ? (
              <><CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />Email sent!</>
            ) : resendCooldown > 0 ? (
              <><RefreshCw className="mr-2 h-4 w-4" />Resend in {resendCooldown}s</>
            ) : (
              <><RefreshCw className="mr-2 h-4 w-4" />Resend verification email</>
            )}
          </Button>

          {resendError && (
            <p className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {resendError}
            </p>
          )}

          {/* ── Divider ───────────────────────────────────────────────── */}
          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">or</span>
            </div>
          </div>

          {/* ── Sign out ──────────────────────────────────────────────── */}
          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={handleSignOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out and use a different account
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Didn&apos;t receive the email? Check your spam folder, wait 60 seconds,
            then use <strong>Resend</strong> above.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
