// src/pages/PhoneSignIn.tsx
// Phone.Email OTP sign-in page.
//
// Flow:
//   1. Renders the Phone.Email "Log in with Phone" button (injected via their script).
//   2. Phone.Email calls window.phoneEmailListener(token) after the user verifies OTP.
//   3. We POST the token to our backend at POST /api/auth/verify-phone-email.
//   4. Backend verifies it, upserts the user in SQLite, and returns a Firebase Custom Token.
//   5. We call signInWithCustomToken(auth, customToken) — Firebase fires onAuthStateChanged
//      → AuthContext picks it up → user is now authenticated across the whole app.
//   6. Navigate to /dashboard.
//
// Setup:
//   Add to your .env file:  VITE_PHONE_EMAIL_CLIENT_ID=your-client-id-from-phone.email

import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signInWithCustomToken } from "@/firebase";
import { auth } from "@/firebase";
import { useAuth } from "@/context/AuthContext";
import api from "@/api";
import { Loader2, Phone, AlertCircle } from "lucide-react";

// ---------------------------------------------------------------------------
// Type declaration for the Phone.Email global callback
// ---------------------------------------------------------------------------
declare global {
  interface Window {
    phoneEmailListener: (userJson: string | Record<string, unknown>) => void;
  }
}

// ---------------------------------------------------------------------------
// PhoneSignIn Component
// ---------------------------------------------------------------------------
export default function PhoneSignIn() {
  const { currentUser }  = useAuth();
  const navigate         = useNavigate();
  const scriptRef        = useRef<HTMLScriptElement | null>(null);
  const btnContainerRef  = useRef<HTMLDivElement>(null);

  const [status,    setStatus]    = useState<"idle" | "verifying" | "signing-in">("idle");
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null);

  // ── Redirect if already signed in ─────────────────────────────────────
  useEffect(() => {
    if (currentUser) navigate("/dashboard", { replace: true });
  }, [currentUser, navigate]);

  // ── Core: POST token to backend → Firebase custom sign-in ─────────────
  async function handlePhoneEmailToken(rawToken: string): Promise<void> {
    setStatus("verifying");
    setErrorMsg(null);

    try {
      // Step 1 — verify the Phone.Email JWT on our backend
      const { data } = await api.post<{
        success: boolean;
        customToken: string;
        phone: string;
        error?: string;
      }>("/auth/verify-phone-email", { token: rawToken });

      if (!data.success || !data.customToken) {
        throw new Error(data.error ?? "Backend returned no custom token.");
      }

      // Step 2 — sign into Firebase with the custom token
      setStatus("signing-in");
      await signInWithCustomToken(auth, data.customToken);

      // Step 3 — AuthContext's onAuthStateChanged fires; navigate to dashboard
      navigate("/dashboard", { replace: true });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Phone sign-in failed. Please try again.";
      setErrorMsg(msg);
      setStatus("idle");
    }
  }

  // ── Register global callback BEFORE the Phone.Email script loads ───────
  useEffect(() => {
    window.phoneEmailListener = (userJson) => {
      // Phone.Email passes either the raw JWT string, or an object whose
      // string form IS the JWT (some SDK versions differ).
      const token =
        typeof userJson === "string"
          ? userJson
          : (userJson as Record<string, unknown>).token as string | undefined
            ?? JSON.stringify(userJson);

      if (!token) {
        setErrorMsg("Phone.Email did not return a valid token. Please try again.");
        return;
      }

      handlePhoneEmailToken(token);
    };

    // ── Inject the Phone.Email widget script ───────────────────────────
    const clientId = import.meta.env.VITE_PHONE_EMAIL_CLIENT_ID as string | undefined;
    if (!clientId) {
      console.warn(
        "[PhoneSignIn] VITE_PHONE_EMAIL_CLIENT_ID is not set. " +
        "Add it to your .env file to enable phone sign-in."
      );
      setErrorMsg("Phone sign-in is not configured. VITE_PHONE_EMAIL_CLIENT_ID is missing.");
      return;
    }

    // Set the data-client-id on the button container before loading the script
    if (btnContainerRef.current) {
      btnContainerRef.current.setAttribute("data-client-id", clientId);
    }

    // Only inject the script once
    if (!document.querySelector('script[src*="phone.email"]')) {
      const script   = document.createElement("script");
      script.src     = "https://www.phone.email/sign_in_button_v1.js";
      script.async   = true;
      scriptRef.current = script;
      document.body.appendChild(script);
    }

    return () => {
      // Cleanup: remove the script tag on unmount so it doesn't double-load
      // if the user navigates away and back.
      if (scriptRef.current && document.body.contains(scriptRef.current)) {
        document.body.removeChild(scriptRef.current);
        scriptRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Disable the button container while a verification is in progress ───
  const isBusy = status !== "idle";

  // ── Status label shown below the button ────────────────────────────────
  const statusLabel =
    status === "verifying"   ? "Verifying your phone number…" :
    status === "signing-in"  ? "Signing you in…"              :
    null;

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-transparent px-4"
      style={{
        backgroundImage: [
          "radial-gradient(ellipse 80% 50% at 10% 0%, rgba(255,180,120,0.18) 0%, transparent 60%)",
          "radial-gradient(ellipse 55% 40% at 90% 100%, rgba(165,130,250,0.18) 0%, transparent 55%)",
        ].join(", "),
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-8"
        style={{
          background: "rgba(255,255,255,0.85)",
          border: "1px solid rgba(255,255,255,0.95)",
          boxShadow: [
            "0 4px 16px rgba(124,58,237,0.10)",
            "0 12px 48px rgba(124,58,237,0.08)",
            "inset 0 1px 0 rgba(255,255,255,1)",
          ].join(", "),
          backdropFilter: "blur(20px)",
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{
              background: "linear-gradient(135deg, #7c3aed, #a855f7)",
              boxShadow:
                "0 4px 20px rgba(124,58,237,0.40), inset 0 1px 0 rgba(255,255,255,0.25)",
            }}
          >
            <Phone className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Sign in with Phone
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your phone number to receive a one-time passcode
          </p>
        </div>

        {/* ── Error message ───────────────────────────────────────────── */}
        {errorMsg && (
          <div className="mb-5 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-sm text-destructive">{errorMsg}</p>
          </div>
        )}

        {/* ── Status indicator while busy ─────────────────────────────── */}
        {isBusy && (
          <div className="mb-5 flex items-center justify-center gap-3 rounded-lg bg-primary/8 px-4 py-3">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <p className="text-sm font-medium text-primary">{statusLabel}</p>
          </div>
        )}

        {/* ── Phone.Email button ──────────────────────────────────────── */}
        {/* The script targets elements with class="pe_signin_button"      */}
        {/* and replaces them with the Phone.Email sign-in button widget.  */}
        <div
          className={`flex justify-center transition-opacity ${isBusy ? "pointer-events-none opacity-40" : ""}`}
        >
          <div
            ref={btnContainerRef}
            className="pe_signin_button"
            // data-client-id is set dynamically in useEffect once env is read
          />
        </div>

        {/* ── Divider ─────────────────────────────────────────────────── */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">or</span>
          </div>
        </div>

        {/* ── Links ───────────────────────────────────────────────────── */}
        <p className="text-center text-sm text-muted-foreground">
          <Link
            to="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Sign in with email instead
          </Link>
        </p>
        <p className="mt-3 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            to="/register"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
