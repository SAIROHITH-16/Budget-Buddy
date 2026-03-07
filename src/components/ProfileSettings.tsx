import { useState, useEffect, useRef, type FormEvent } from "react";
import { updateProfile, sendPasswordResetEmail, sendEmailVerification, reload } from "firebase/auth";
import { User, Mail, KeyRound, Loader2, Save, CheckCircle2, AlertCircle, Phone, ShieldCheck, ShieldAlert, RefreshCw } from "lucide-react";
import { auth, RecaptchaVerifier, linkWithPhoneNumber, type ConfirmationResult } from "@/firebase";
import { useAuth } from "@/context/AuthContext";
import api from "@/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the 1–2 initial characters to show in the avatar circle. */
function getInitials(displayName: string | null, email: string | null): string {
  if (displayName?.trim()) {
    return displayName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("");
  }
  return email?.[0]?.toUpperCase() ?? "?";
}

// ---------------------------------------------------------------------------
// ProfileSettings
// ---------------------------------------------------------------------------
export function ProfileSettings() {
  const { currentUser } = useAuth();

  // ── Display-name state ───────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState(currentUser?.displayName ?? "");
  const [nameSaving, setNameSaving]   = useState(false);
  const [nameSaved,  setNameSaved]    = useState(false);
  const [nameError,  setNameError]    = useState<string | null>(null);

  // ── Password-reset state ─────────────────────────────────────────────────
  const [resetSending, setResetSending] = useState(false);
  const [resetSent,    setResetSent]    = useState(false);
  const [resetError,   setResetError]   = useState<string | null>(null);

  // ── Phone number + verification state (fetched from backend profile) ──────
  const [phone,           setPhone]           = useState<string | null>(null);
  const [isPhoneVerified, setIsPhoneVerified] = useState<boolean | null>(null);
  // isEmailVerified is derived below from currentUser.emailVerified (not from state)

  // ── Resend activation email state ────────────────────────────────────────
  const [resendSending, setResendSending] = useState(false);
  const [resendSent,    setResendSent]    = useState(false);
  const [resendError,   setResendError]   = useState<string | null>(null);

  // ── Phone OTP state ───────────────────────────────────────────────────────
  const [phoneOtpStep,       setPhoneOtpStep]       = useState<"idle" | "sending" | "otp" | "verifying">("idle");
  const [phoneOtpCode,       setPhoneOtpCode]       = useState("");
  const [phoneOtpError,      setPhoneOtpError]      = useState<string | null>(null);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    // Reload the Firebase user to get the freshest emailVerified flag
    if (auth.currentUser) {
      reload(auth.currentUser).catch(() => {});
    }
    api.get("/users/profile")
      .then((res) => {
        const data = res.data?.data;
        setPhone(data?.phone ?? null);
        setIsPhoneVerified(data?.isPhoneVerified ?? false);
      })
      .catch(() => setPhone(null));
  }, [currentUser?.uid]);

  // Derive email verified directly from Firebase (live, same as password reset flow)
  const isEmailVerified = currentUser?.emailVerified ?? false;

  const email    = currentUser?.email ?? "";
  const initials = getInitials(currentUser?.displayName ?? null, email);

  // ── Is the user signed in via Google / OAuth (no password)? ─────────────
  const isPasswordProvider = currentUser?.providerData.some(
    (p) => p.providerId === "password"
  );

  // ── Save display name ────────────────────────────────────────────────────
  const handleSaveName = async () => {
    if (!auth.currentUser) return;
    const trimmed = displayName.trim();
    if (!trimmed) {
      setNameError("Display name cannot be empty.");
      return;
    }
    setNameSaving(true);
    setNameError(null);
    setNameSaved(false);
    try {
      await updateProfile(auth.currentUser, { displayName: trimmed });
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 3000);
    } catch (e: any) {
      setNameError(e.message ?? "Failed to update display name.");
    } finally {
      setNameSaving(false);
    }
  };

  // ── Resend Firebase email verification (same as password reset — no SMTP needed) ──
  const handleResendActivationEmail = async () => {
    if (!auth.currentUser) return;
    setResendSending(true);
    setResendError(null);
    setResendSent(false);
    try {
      await sendEmailVerification(auth.currentUser);
      setResendSent(true);
      setTimeout(() => setResendSent(false), 8000);
    } catch (e: any) {
      setResendError(e.message ?? "Failed to send verification email.");
    } finally {
      setResendSending(false);
    }
  };

  // ── Send phone OTP via Firebase ──────────────────────────────────────────
  const handleSendPhoneOtp = async () => {
    if (!phone || !auth.currentUser) return;
    setPhoneOtpStep("sending");
    setPhoneOtpError(null);
    try {
      if (recaptchaRef.current) { recaptchaRef.current.clear(); recaptchaRef.current = null; }
      const verifier = new RecaptchaVerifier(auth, "settings-recaptcha-container", { size: "invisible" });
      recaptchaRef.current = verifier;
      const result = await linkWithPhoneNumber(auth.currentUser, phone, verifier);
      setConfirmationResult(result);
      setPhoneOtpStep("otp");
    } catch (err: any) {
      // Phone may already be linked to this Firebase account — just mark verified
      if (err.code === "auth/provider-already-linked" || err.code === "auth/credential-already-in-use") {
        try {
          await api.post("/users/mark-phone-verified");
          setIsPhoneVerified(true);
        } catch {
          setPhoneOtpError("Failed to record phone verification. Please try again.");
        }
      } else {
        setPhoneOtpError(err.message ?? "Failed to send OTP.");
      }
      setPhoneOtpStep("idle");
      if (recaptchaRef.current) { recaptchaRef.current.clear(); recaptchaRef.current = null; }
    }
  };

  // ── Confirm phone OTP ────────────────────────────────────────────────────
  const handleConfirmPhoneOtp = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!confirmationResult) return;
    setPhoneOtpStep("verifying");
    setPhoneOtpError(null);
    try {
      await confirmationResult.confirm(phoneOtpCode.trim());
      await api.post("/users/mark-phone-verified");
      setIsPhoneVerified(true);
      setPhoneOtpStep("idle");
      setPhoneOtpCode("");
    } catch {
      setPhoneOtpError("Invalid code. Please check and try again.");
      setPhoneOtpStep("otp");
    }
  };

  // ── Send password reset email ────────────────────────────────────────────
  const handleResetPassword = async () => {
    if (!email) return;
    setResetSending(true);
    setResetError(null);
    setResetSent(false);
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
      setTimeout(() => setResetSent(false), 6000);
    } catch (e: any) {
      setResetError(e.message ?? "Failed to send reset email.");
    } finally {
      setResetSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5 text-primary" />
          Profile
        </CardTitle>
        <CardDescription>
          Your account information and security settings.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">

        {/* ── Avatar + identity summary ──────────────────────────────────── */}
        <div className="flex items-center gap-4">
          {/* Avatar circle */}
          <div className="h-14 w-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center select-none shrink-0">
            <span className="text-lg font-bold text-primary">{initials}</span>
          </div>

          <div className="min-w-0">
            <p className="font-semibold truncate">
              {currentUser?.displayName || <span className="text-muted-foreground italic">No display name set</span>}
            </p>
            <p className="text-sm text-muted-foreground truncate">{email}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {currentUser?.providerData.map((p) =>
                p.providerId === "google.com" ? "Google account" :
                p.providerId === "password"   ? "Email & password" : p.providerId
              ).join(", ")}
            </p>
          </div>
        </div>

        <Separator />

        {/* ── Display name ──────────────────────────────────────────────── */}
        <div className="space-y-2">
          <Label htmlFor="display-name">Display Name</Label>
          <div className="flex gap-2">
            <Input
              id="display-name"
              placeholder="Your name"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setNameError(null);
                setNameSaved(false);
              }}
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveName(); }}
              maxLength={80}
            />
            <Button
              onClick={handleSaveName}
              disabled={nameSaving || displayName.trim() === (currentUser?.displayName ?? "")}
              className="shrink-0"
            >
              {nameSaving
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Save className="h-4 w-4" />}
              <span className="ml-2 hidden sm:inline">
                {nameSaving ? "Saving…" : "Save"}
              </span>
            </Button>
          </div>

          {nameError && (
            <p className="flex items-center gap-1.5 text-sm expense-text">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {nameError}
            </p>
          )}
          {nameSaved && (
            <p className="flex items-center gap-1.5 text-sm income-text">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              Display name updated.
            </p>
          )}
        </div>

        {/* ── Email (read-only) + verification status ───────────────────── */}
        <div className="space-y-2">
          <Label htmlFor="email" className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" />
            Email
            {isPasswordProvider && isEmailVerified !== null && (
              isEmailVerified
                ? <Badge variant="secondary" className="ml-1 gap-1 text-green-700 bg-green-100 border-green-200"><ShieldCheck className="h-3 w-3" />Verified</Badge>
                : <Badge variant="secondary" className="ml-1 gap-1 text-amber-700 bg-amber-100 border-amber-200"><ShieldAlert className="h-3 w-3" />Unverified</Badge>
            )}
          </Label>
          <Input
            id="email"
            type="email"
            value={email}
            readOnly
            disabled
            className="opacity-70 cursor-not-allowed"
          />
          {/* Resend activation link — only for email/password + unverified */}
          {isPasswordProvider && isEmailVerified === false && (
            <div className="space-y-1.5">
              <Button
                size="sm"
                onClick={handleResendActivationEmail}
                disabled={resendSending || resendSent}
                className={`gap-2 font-semibold transition-all ${
                  resendSent
                    ? "bg-green-600 hover:bg-green-600 text-white border-green-600"
                    : "bg-amber-500 hover:bg-amber-600 text-white border-transparent"
                }`}
              >
                {resendSending
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Sending…</>
                  : resendSent
                  ? <><CheckCircle2 className="h-3.5 w-3.5" />Email sent!</>
                  : <><RefreshCw className="h-3.5 w-3.5" />Resend activation email</>}
              </Button>
              {resendSent && <p className="text-xs text-muted-foreground">Check your inbox — the link expires in 24 hours.</p>}
              {resendError && <p className="flex items-center gap-1.5 text-xs expense-text"><AlertCircle className="h-3.5 w-3.5 shrink-0" />{resendError}</p>}
            </div>
          )}
          {(!isPasswordProvider) && (
            <p className="text-xs text-muted-foreground">
              Email address cannot be changed here.
            </p>
          )}
          {isPasswordProvider && isEmailVerified && (
            <p className="text-xs text-muted-foreground">
              Email address cannot be changed here.
            </p>
          )}
        </div>

        {/* ── Phone number + verification ───────────────────────────────── */}
        <div className="space-y-2">
          {/* Hidden reCAPTCHA mount point for phone OTP */}
          <div id="settings-recaptcha-container" />

          <Label htmlFor="phone" className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5" />
            Phone Number
            {isPhoneVerified !== null && phone && (
              isPhoneVerified
                ? <Badge variant="secondary" className="ml-1 gap-1 text-green-700 bg-green-100 border-green-200"><ShieldCheck className="h-3 w-3" />Verified</Badge>
                : <Badge variant="secondary" className="ml-1 gap-1 text-amber-700 bg-amber-100 border-amber-200"><ShieldAlert className="h-3 w-3" />Unverified</Badge>
            )}
          </Label>
          <Input
            id="phone"
            type="tel"
            value={phone ?? ""}
            readOnly
            disabled
            placeholder={phone === null ? "Not set" : undefined}
            className="opacity-70 cursor-not-allowed"
          />

          {/* Verify phone button — shown when phone is saved but not verified */}
          {phone && isPhoneVerified === false && phoneOtpStep === "idle" && (
            <div className="space-y-1.5">
              <Button
                size="sm"
                onClick={handleSendPhoneOtp}
                className="gap-2 font-semibold bg-amber-500 hover:bg-amber-600 text-white border-transparent transition-all"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Verify phone number
              </Button>
              {phoneOtpError && (
                <p className="flex items-center gap-1.5 text-xs expense-text">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />{phoneOtpError}
                </p>
              )}
            </div>
          )}

          {/* Sending OTP spinner */}
          {phoneOtpStep === "sending" && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />Sending verification code…
            </p>
          )}

          {/* OTP input form */}
          {phoneOtpStep === "otp" && (
            <form onSubmit={handleConfirmPhoneOtp} className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 dark:bg-amber-900/10 dark:border-amber-800/40 p-4">
              <p className="text-sm font-medium text-foreground">
                Enter the 6-digit code sent to{" "}
                <span className="font-bold">{phone}</span>
              </p>
              <div className="flex gap-2">
                <Input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={phoneOtpCode}
                  onChange={(e) => setPhoneOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="— — — — — —"
                  className="tracking-[0.5em] text-center font-mono text-lg h-11 border-amber-300 focus-visible:ring-amber-400"
                />
                <Button
                  type="submit"
                  disabled={phoneOtpCode.length !== 6}
                  className="shrink-0 h-11 px-5 font-semibold gap-2"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Verify
                </Button>
              </div>
              {phoneOtpError && (
                <p className="flex items-center gap-1.5 text-xs expense-text">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />{phoneOtpError}
                </p>
              )}
            </form>
          )}

          {/* Verifying spinner */}
          {phoneOtpStep === "verifying" && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />Verifying code…
            </p>
          )}

          {/* Success */}
          {isPhoneVerified && (
            <p className="text-xs text-muted-foreground">
              Phone number verified.
            </p>
          )}
          {!phone && (
            <p className="text-xs text-muted-foreground">
              No phone number saved. You can add one by re-registering or updating your profile.
            </p>
          )}
        </div>

        {/* ── Password reset (only for email/password accounts) ─────────── */}
        {isPasswordProvider && (
          <>
            <Separator />

            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5" />
                  Change Password
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  We'll send a password-reset link to <strong>{email}</strong>.
                </p>
              </div>

              <Button
                variant="outline"
                onClick={handleResetPassword}
                disabled={resetSending || resetSent}
                className={`w-full sm:w-auto gap-2 font-semibold transition-all ${
                  resetSent
                    ? "border-green-500 text-green-700 bg-green-50 hover:bg-green-50 dark:bg-green-900/20"
                    : "hover:border-primary hover:text-primary"
                }`}
              >
                {resetSending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Sending…</>
                ) : resetSent ? (
                  <><CheckCircle2 className="h-4 w-4" />Email sent!</>
                ) : (
                  <><KeyRound className="h-4 w-4" />Send reset email</>
                )}
              </Button>

              {resetError && (
                <p className="flex items-center gap-1.5 text-sm expense-text">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {resetError}
                </p>
              )}
              {resetSent && (
                <p className="text-xs text-muted-foreground">
                  Check your inbox. The link expires after 1 hour.
                </p>
              )}
            </div>
          </>
        )}

      </CardContent>
    </Card>
  );
}
