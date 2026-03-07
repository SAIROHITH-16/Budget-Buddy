// src/pages/VerifyEmail.tsx
// Public page — activated when the user clicks the email activation link.
// Reads ?token= from the URL, calls the backend, shows success or error.

import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import api from "@/api";

type Status = "loading" | "success" | "error" | "already";

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      setMessage("No activation token found in the link. Please check your email.");
      return;
    }

    api
      .get(`/users/activate-email?token=${encodeURIComponent(token)}`)
      .then((res) => {
        if (res.data?.message?.includes("already")) {
          setStatus("already");
        } else {
          setStatus("success");
        }
        setMessage(res.data?.message ?? "");
      })
      .catch((err) => {
        setStatus("error");
        setMessage(
          err.response?.data?.error ??
          "Activation failed. The link may have expired or already been used."
        );
      });
  }, [searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-transparent px-4">
      <div
        className="w-full max-w-md rounded-2xl p-8 text-center"
        style={{
          background:    "rgba(255,255,255,0.85)",
          border:        "1px solid rgba(255,255,255,0.95)",
          boxShadow:     "0 4px 16px rgba(124,58,237,0.10), 0 12px 48px rgba(124,58,237,0.08), inset 0 1px 0 rgba(255,255,255,1)",
          backdropFilter: "blur(20px)",
        }}
      >
        {/* Icon */}
        <div
          className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full"
          style={{
            background: status === "error"
              ? "linear-gradient(135deg, #ef4444, #dc2626)"
              : "linear-gradient(135deg, #0ea5e9, #2563eb)",
            boxShadow: "0 4px 20px rgba(37,99,235,0.35), inset 0 1px 0 rgba(255,255,255,0.25)",
          }}
        >
          {status === "loading" && (
            /* Spinner */
            <svg className="h-7 w-7 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          )}
          {(status === "success" || status === "already") && (
            /* Checkmark */
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
          {status === "error" && (
            /* X */
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {status === "loading" && "Verifying your email…"}
          {status === "success" && "Email verified!"}
          {status === "already" && "Already verified"}
          {status === "error"   && "Verification failed"}
        </h1>

        {/* Message */}
        <p className="mt-3 text-sm text-muted-foreground">
          {status === "loading" && "Please wait a moment."}
          {status === "success" && "Your account is now active. You can sign in and start using Budget Buddy."}
          {status === "already" && "Your email has already been verified. You can sign in normally."}
          {status === "error"   && (message || "Something went wrong. Please try again.")}
        </p>

        {/* CTA */}
        {status !== "loading" && (
          <Link
            to="/login"
            className="mt-6 inline-block rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Go to Sign in
          </Link>
        )}
      </div>
    </div>
  );
}
