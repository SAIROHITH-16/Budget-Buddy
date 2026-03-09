import { useState, useEffect } from "react";
import { updateProfile, sendPasswordResetEmail } from "firebase/auth";
import { User, Mail, KeyRound, Loader2, Save, CheckCircle2, AlertCircle, Phone } from "lucide-react";
import { auth } from "@/firebase";
import { useAuth } from "@/context/AuthContext";
import api from "@/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

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

  // ── Phone number state (fetched from backend profile) ─────────────────────────
  const [phone, setPhone] = useState<string | null>(null);

  useEffect(() => {
    api.get("/users/profile")
      .then((res) => {
        const data = res.data?.data;
        setPhone(data?.phone ?? null);
      })
      .catch(() => setPhone(null));
  }, [currentUser?.uid]);

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

        {/* ── Email (read-only) ─────────────────────────────────────────── */}
        <div className="space-y-2">
          <Label htmlFor="email" className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" />
            Email
          </Label>
          <Input
            id="email"
            type="email"
            value={email}
            readOnly
            disabled
            className="opacity-70 cursor-not-allowed"
          />
          <p className="text-xs text-muted-foreground">Email address cannot be changed here.</p>
        </div>

        {/* ── Phone number (read-only) ──────────────────────────────────── */}
        <div className="space-y-2">
          <Label htmlFor="phone" className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5" />
            Phone Number
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
          {!phone && (
            <p className="text-xs text-muted-foreground">
              No phone number saved. Use the <span className="font-medium text-foreground">Update Phone Number</span> section below to add one.
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
