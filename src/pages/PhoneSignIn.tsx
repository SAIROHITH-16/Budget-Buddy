// src/pages/PhoneSignIn.tsx
// Firebase Phone Authentication — sign in via SMS OTP.
//
// Flow:
//   PHONE_INPUT → user enters phone number with country code → handleSendOtp()
//                 → invisible reCAPTCHA fires → SMS sent → step switches to OTP_INPUT
//
//   OTP_INPUT   → user enters 6-digit code → handleVerifyOtp()
//               → Firebase confirms code → user is authenticated → /dashboard
//
// Notes:
//   • Requires Firebase Blaze (pay-as-you-go) plan — Phone Auth is not available on Spark.
//   • reCAPTCHA verifier is created once per mount and cleared on unmount / OTP error.
//   • Phone-auth users bypass the email verification check in ProtectedRoute.

import React, { useState, useRef, useEffect, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signInWithPhoneNumber, RecaptchaVerifier, type ConfirmationResult } from "firebase/auth";
import { auth } from "@/firebase";
import { useAuth } from "@/context/AuthContext";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Phone,
  KeyRound,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { type FirebaseError } from "firebase/app";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parsePhoneAuthError(error: unknown): string {
  const e = error as FirebaseError;
  switch (e?.code) {
    case "auth/invalid-phone-number":
      return "Invalid phone number. Include the country code, e.g. +919876543210.";
    case "auth/missing-phone-number":
      return "Please enter a phone number.";
    case "auth/quota-exceeded":
      return "SMS quota exceeded. Please try again later.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/operation-not-allowed":
      return "Phone authentication is not enabled. Contact support.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a few minutes before trying again.";
    case "auth/invalid-verification-code":
      return "Incorrect code. Please check the SMS and try again.";
    case "auth/code-expired":
      return "The verification code has expired. Please request a new one.";
    case "auth/missing-verification-code":
      return "Please enter the verification code.";
    case "auth/captcha-check-failed":
      return "reCAPTCHA verification failed. Please refresh the page and try again.";
    default:
      return e?.message ?? "An unexpected error occurred.";
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
type Step = "PHONE_INPUT" | "OTP_INPUT";
const RESEND_COOLDOWN_SECONDS = 60;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function PhoneSignIn() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  // ── State ────────────────────────────────────────────────────────────────
  const [step, setStep]                           = useState<Step>("PHONE_INPUT");
  const [phoneNumber, setPhoneNumber]             = useState("");
  const [otp, setOtp]                             = useState("");
  const [error, setError]                         = useState<string | null>(null);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  const [sending, setSending]     = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown]   = useState(0);

  // Holds the RecaptchaVerifier instance across renders — never recreated unless cleared
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  // ── Redirect already-authenticated users ─────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    const isPhoneUser = currentUser.providerData.some((p) => p.providerId === "phone");
    if (isPhoneUser || currentUser.emailVerified) {
      navigate("/dashboard", { replace: true });
    }
  }, [currentUser, navigate]);

  // ── Cooldown countdown ───────────────────────────────────────────────────
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  // ── Cleanup reCAPTCHA on unmount ─────────────────────────────────────────
  useEffect(() => {
    return () => {
      recaptchaVerifierRef.current?.clear();
      recaptchaVerifierRef.current = null;
    };
  }, []);

  // ── reCAPTCHA setup — idempotent ─────────────────────────────────────────
  function setupRecaptcha(): RecaptchaVerifier {
    if (recaptchaVerifierRef.current) return recaptchaVerifierRef.current;

    const verifier = new RecaptchaVerifier(auth, "recaptcha-container", {
      size: "invisible",
      callback: () => {
        // reCAPTCHA solved — signInWithPhoneNumber will call this automatically
      },
      "expired-callback": () => {
        // Token expired; clear so it's recreated on next attempt
        recaptchaVerifierRef.current?.clear();
        recaptchaVerifierRef.current = null;
      },
    });

    recaptchaVerifierRef.current = verifier;
    return verifier;
  }

  // ── Send OTP ─────────────────────────────────────────────────────────────
  async function handleSendOtp(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);

    const trimmed = phoneNumber.trim();
    if (!trimmed) {
      setError("Please enter your phone number.");
      return;
    }

    // Ensure E.164 format — prepend + if the user omitted it
    const formatted = trimmed.startsWith("+") ? trimmed : `+${trimmed}`;

    setSending(true);
    try {
      const appVerifier = setupRecaptcha();
      const result = await signInWithPhoneNumber(auth, formatted, appVerifier);
      setConfirmationResult(result);
      setStep("OTP_INPUT");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      // Reset reCAPTCHA so the next attempt can create a fresh one
      recaptchaVerifierRef.current?.clear();
      recaptchaVerifierRef.current = null;
      setError(parsePhoneAuthError(err));
    } finally {
      setSending(false);
    }
  }

  // ── Verify OTP ───────────────────────────────────────────────────────────
  async function handleVerifyOtp(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!confirmationResult) return;
    setError(null);

    if (!otp.trim()) {
      setError("Please enter the verification code from the SMS.");
      return;
    }

    setVerifying(true);
    try {
      await confirmationResult.confirm(otp.trim());
      // Firebase onAuthStateChanged in AuthContext picks up the new user;
      // ProtectedRoute lets phone users through without email verification.
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(parsePhoneAuthError(err));
    } finally {
      setVerifying(false);
    }
  }

  // ── Resend OTP ───────────────────────────────────────────────────────────
  async function handleResend(): Promise<void> {
    if (cooldown > 0) return;
    setError(null);
    setOtp("");

    // Clear existing verifier so Firebase creates a fresh reCAPTCHA token
    recaptchaVerifierRef.current?.clear();
    recaptchaVerifierRef.current = null;

    setSending(true);
    try {
      const formatted = phoneNumber.trim().startsWith("+")
        ? phoneNumber.trim()
        : `+${phoneNumber.trim()}`;
      const appVerifier = setupRecaptcha();
      const result = await signInWithPhoneNumber(auth, formatted, appVerifier);
      setConfirmationResult(result);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      recaptchaVerifierRef.current?.clear();
      recaptchaVerifierRef.current = null;
      setError(parsePhoneAuthError(err));
    } finally {
      setSending(false);
    }
  }

  // ── JSX ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      {/*
        recaptcha-container MUST be in the DOM when RecaptchaVerifier renders.
        It is invisible — Firebase handles the widget entirely.
      */}
      <div id="recaptcha-container" />

      <Card className="glass-card w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-3 pb-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Phone className="h-8 w-8 text-primary" />
          </div>

          {step === "PHONE_INPUT" ? (
            <>
              <CardTitle className="text-2xl">Sign in with phone</CardTitle>
              <CardDescription>
                Enter your number with the country code (e.g.{" "}
                <span className="font-mono text-foreground">+919876543210</span>).
                We'll send a one-time code via SMS.
              </CardDescription>
            </>
          ) : (
            <>
              <CardTitle className="text-2xl">Enter verification code</CardTitle>
              <CardDescription>
                We sent a 6-digit code to{" "}
                <span className="font-medium text-foreground">{phoneNumber}</span>.
                Check your messages.
              </CardDescription>
            </>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {/* ── STEP 1: Phone number input ─────────────────────────────── */}
          {step === "PHONE_INPUT" && (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+919876543210"
                    value={phoneNumber}
                    onChange={(e) => {
                      setPhoneNumber(e.target.value);
                      setError(null);
                    }}
                    className="pl-10"
                    autoComplete="tel"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Include the country code — e.g. <span className="font-mono">+1</span> for US,{" "}
                  <span className="font-mono">+91</span> for India.
                </p>
              </div>

              {error && (
                <p className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full btn-primary-gradient" disabled={sending}>
                {sending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending code…</>
                ) : (
                  <><Phone className="mr-2 h-4 w-4" />Send verification code</>
                )}
              </Button>
            </form>
          )}

          {/* ── STEP 2: OTP input ─────────────────────────────────────── */}
          {step === "OTP_INPUT" && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="otp">6-digit verification code</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="123456"
                    value={otp}
                    onChange={(e) => {
                      setOtp(e.target.value.replace(/\D/g, ""));
                      setError(null);
                    }}
                    className="pl-10 font-mono tracking-[0.4em] text-center text-lg"
                    autoComplete="one-time-code"
                    autoFocus
                  />
                </div>
              </div>

              {error && (
                <p className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </p>
              )}

              <Button
                type="submit"
                className="w-full btn-primary-gradient"
                disabled={verifying || otp.length < 6}
              >
                {verifying ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying…</>
                ) : (
                  <><CheckCircle2 className="mr-2 h-4 w-4" />Verify & sign in</>
                )}
              </Button>

              {/* Resend with cooldown */}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleResend}
                disabled={sending || cooldown > 0}
              >
                {sending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</>
                ) : cooldown > 0 ? (
                  <><RefreshCw className="mr-2 h-4 w-4" />Resend in {cooldown}s</>
                ) : (
                  <><RefreshCw className="mr-2 h-4 w-4" />Resend code</>
                )}
              </Button>

              {/* Go back to change number */}
              <Button
                type="button"
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => {
                  setStep("PHONE_INPUT");
                  setOtp("");
                  setError(null);
                  setConfirmationResult(null);
                  setCooldown(0);
                }}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Use a different number
              </Button>
            </form>
          )}

          {/* ── Divider + other sign-in options ─────────────────────── */}
          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 text-center text-sm text-muted-foreground">
            <Link to="/login" className="text-primary hover:underline font-medium">
              Sign in with email &amp; password
            </Link>
            <span>
              No account?{" "}
              <Link to="/register" className="text-primary hover:underline font-medium">
                Register
              </Link>
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
