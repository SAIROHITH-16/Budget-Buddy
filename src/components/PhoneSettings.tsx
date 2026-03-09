// src/components/PhoneSettings.tsx
// Settings card that lets an authenticated user change their phone number.
//
// Flow:
//   Step 1 — user enters a new phone number → Firebase sends SMS OTP
//             via PhoneAuthProvider.verifyPhoneNumber (invisible reCAPTCHA).
//   Step 2 — user enters the 6-digit OTP → we build a PhoneAuthCredential,
//             call updatePhoneNumber() to update Firebase, then PATCH the
//             backend so SQLite stays in sync.
//
// Security notes:
//   • reCAPTCHA is scoped to the button element (invisible mode).
//   • updatePhoneNumber() requires a recently-signed-in session; if Firebase
//     rejects with "requires-recent-login" we surface a clear error message.
//   • The backend PATCH route is also protected by the Firebase JWT verifier.

import { useState, useRef, useEffect } from "react";
import {
  PhoneAuthProvider,
  updatePhoneNumber,
  RecaptchaVerifier,
} from "firebase/auth";
import { auth } from "@/firebase";
import api from "@/api";
import { useAuth } from "@/context/AuthContext";
import {
  Phone,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Country-code data
// ---------------------------------------------------------------------------
const COUNTRY_CODES: { code: string; label: string; maxLen: number }[] = [
  { code: "+91",  label: "+91 (IN)",  maxLen: 10 },
  { code: "+1",   label: "+1 (US)",   maxLen: 10 },
  { code: "+44",  label: "+44 (UK)",  maxLen: 10 },
  { code: "+61",  label: "+61 (AU)",  maxLen:  9 },
  { code: "+49",  label: "+49 (DE)",  maxLen: 11 },
  { code: "+81",  label: "+81 (JP)",  maxLen: 11 },
  { code: "+971", label: "+971 (AE)", maxLen:  9 },
  { code: "+65",  label: "+65 (SG)",  maxLen:  8 },
];

function maxLen(code: string): number {
  return COUNTRY_CODES.find((c) => c.code === code)?.maxLen ?? 15;
}

// ---------------------------------------------------------------------------
// Parse Firebase error codes into readable messages
// ---------------------------------------------------------------------------
function parseError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/requires-recent-login":
      return "For security, please sign out and sign back in before changing your phone number.";
    case "auth/invalid-verification-code":
      return "Incorrect OTP — please double-check the code and try again.";
    case "auth/code-expired":
      return "OTP has expired. Please go back and request a new one.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a few minutes before trying again.";
    case "auth/invalid-phone-number":
      return "The phone number format is invalid. Please include the country code.";
    case "auth/phone-number-already-exists":
      return "This phone number is already linked to another account.";
    case "auth/provider-already-linked":
      return "A phone number is already linked. It will be updated.";
    default:
      return (err as Error)?.message ?? "An unexpected error occurred.";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function PhoneSettings() {
  const { currentUser } = useAuth();

  const [step,         setStep]         = useState<1 | 2>(1);
  const [countryCode,  setCountryCode]  = useState("+91");
  const [localPhone,   setLocalPhone]   = useState("");
  const [otp,          setOtp]          = useState("");
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [success,      setSuccess]      = useState<string | null>(null);

  // Holds the verificationId returned by Firebase after sending the SMS
  const verificationIdRef = useRef<string>("");
  // Hold a reference to the RecaptchaVerifier so it can be cleared on reset
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  // Clean up reCAPTCHA when component unmounts
  useEffect(() => {
    return () => {
      recaptchaRef.current?.clear();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Step 1 — send OTP
  // ---------------------------------------------------------------------------
  async function handleSendOtp() {
    if (!auth.currentUser) return;

    setError(null);
    setSuccess(null);

    const digits = localPhone.replace(/\D/g, "");
    const max    = maxLen(countryCode);
    if (digits.length !== max) {
      setError(`Phone number must be exactly ${max} digits for ${countryCode}.`);
      return;
    }

    const fullPhone = `${countryCode}${digits}`;
    setLoading(true);

    try {
      // Destroy any previous reCAPTCHA instance before creating a new one
      recaptchaRef.current?.clear();

      const verifier = new RecaptchaVerifier(auth, "recaptcha-container-phone-settings", {
        size: "invisible",
      });
      recaptchaRef.current = verifier;

      const provider = new PhoneAuthProvider(auth);
      const verificationId = await provider.verifyPhoneNumber(fullPhone, verifier);
      verificationIdRef.current = verificationId;

      setStep(2);
    } catch (err) {
      setError(parseError(err));
      recaptchaRef.current?.clear();
      recaptchaRef.current = null;
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Step 2 — verify OTP, update Firebase, sync backend
  // ---------------------------------------------------------------------------
  async function handleVerifyOtp() {
    if (!auth.currentUser) return;
    if (!/^\d{6}$/.test(otp)) {
      setError("OTP must be exactly 6 digits.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      // Build the credential from the verificationId + entered OTP
      const credential = PhoneAuthProvider.credential(verificationIdRef.current, otp);

      // Update the phone number in Firebase Auth
      await updatePhoneNumber(auth.currentUser, credential);

      // Sync the new number to SQLite via the protected backend route
      const fullPhone = `${countryCode}${localPhone.replace(/\D/g, "")}`;
      await api.patch("/users/update-phone", { phone: fullPhone });

      setSuccess("Phone number updated successfully.");
      setStep(1);
      setLocalPhone("");
      setOtp("");
      recaptchaRef.current?.clear();
      recaptchaRef.current = null;
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    setStep(1);
    setOtp("");
    setError(null);
    recaptchaRef.current?.clear();
    recaptchaRef.current = null;
  }

  if (!currentUser) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5 text-primary" />
          Update Phone Number
        </CardTitle>
        <CardDescription>
          Verify a new phone number via SMS. Your current number will be replaced.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">

        {/* Success banner */}
        {success && (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
            <p className="text-sm text-green-700">{success}</p>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Step 1 - phone input */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ps-phone">New Phone Number</Label>
              <div className="flex gap-2">
                <Select
                  value={countryCode}
                  onValueChange={(v) => { setCountryCode(v); setLocalPhone(""); setError(null); }}
                  disabled={loading}
                >
                  <SelectTrigger className="w-[110px] shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRY_CODES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  id="ps-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  value={localPhone}
                  onChange={(e) => {
                    const d = e.target.value.replace(/\D/g, "").slice(0, maxLen(countryCode));
                    setLocalPhone(d);
                    setError(null);
                    setSuccess(null);
                  }}
                  placeholder={`${maxLen(countryCode)}-digit number`}
                  maxLength={maxLen(countryCode)}
                  disabled={loading}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {maxLen(countryCode)} digits required · {countryCode}
              </p>
            </div>

            <Separator />

            <Button
              onClick={handleSendOtp}
              disabled={loading || localPhone.replace(/\D/g, "").length !== maxLen(countryCode)}
              className="gap-2"
            >
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin" />Sending OTP…</>
                : <><Phone className="h-4 w-4" />Send Verification Code</>}
            </Button>
          </div>
        )}

        {/* Step 2 - OTP input */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ps-otp" className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                6-digit verification code
              </Label>
              <p className="text-xs text-muted-foreground">
                Sent to {countryCode}&nbsp;{localPhone}
              </p>
              <Input
                id="ps-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
                value={otp}
                onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(null); }}
                placeholder="······"
                className="text-center text-xl tracking-[0.5em]"
                disabled={loading}
              />
            </div>

            <Separator />

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={loading}
                className="gap-1.5"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>

              <Button
                onClick={handleVerifyOtp}
                disabled={loading || otp.length < 6}
                className="gap-2"
              >
                {loading
                  ? <><Loader2 className="h-4 w-4 animate-spin" />Verifying…</>
                  : <><ShieldCheck className="h-4 w-4" />Verify &amp; Update</>}
              </Button>
            </div>
          </div>
        )}

        {/* Invisible reCAPTCHA mount point - must be in the DOM at all times */}
        <div id="recaptcha-container-phone-settings" />
      </CardContent>
    </Card>
  );
}
