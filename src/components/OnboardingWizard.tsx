// src/components/OnboardingWizard.tsx
// Single-component, two-step onboarding wizard shown to every authenticated
// user who has not yet chosen a preferred currency.
//
// Step 1 — Phone number  → PATCH /api/users/update-phone   (skippable)
// Step 2 — Currency      → localStorage + currencyChange event
//
// The overlay is blocking — it has NO close / dismiss button.
// The parent must call `onComplete` (fires after Step 2) to unmount it.

import { useState } from "react";
import {
  ShieldCheck,
  Coins,
  ArrowRight,
  Check,
  Loader2,
  AlertCircle,
} from "lucide-react";
import api from "@/api";
import { Button } from "@/components/ui/button";
import { Input }  from "@/components/ui/input";
import { Label }  from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Static data ─────────────────────────────────────────────────────────────

const COUNTRY_CODES = [
  { code: "+91",  flag: "🇮🇳", label: "+91",  max: 10 },
  { code: "+1",   flag: "🇺🇸", label: "+1",   max: 10 },
  { code: "+44",  flag: "🇬🇧", label: "+44",  max: 10 },
  { code: "+61",  flag: "🇦🇺", label: "+61",  max:  9 },
  { code: "+49",  flag: "🇩🇪", label: "+49",  max: 11 },
  { code: "+81",  flag: "🇯🇵", label: "+81",  max: 11 },
  { code: "+971", flag: "🇦🇪", label: "+971", max:  9 },
  { code: "+65",  flag: "🇸🇬", label: "+65",  max:  8 },
  { code: "+86",  flag: "🇨🇳", label: "+86",  max: 11 },
  { code: "+55",  flag: "🇧🇷", label: "+55",  max: 11 },
] as const;

const CURRENCIES = [
  { code: "INR", symbol: "₹",    name: "Indian Rupee"       },
  { code: "USD", symbol: "$",    name: "US Dollar"           },
  { code: "EUR", symbol: "€",    name: "Euro"                },
  { code: "GBP", symbol: "£",    name: "British Pound"       },
  { code: "JPY", symbol: "¥",    name: "Japanese Yen"        },
  { code: "AUD", symbol: "A$",   name: "Australian Dollar"   },
  { code: "CAD", symbol: "C$",   name: "Canadian Dollar"     },
  { code: "SGD", symbol: "S$",   name: "Singapore Dollar"    },
  { code: "AED", symbol: "د.إ",  name: "UAE Dirham"          },
  { code: "CHF", symbol: "CHF",  name: "Swiss Franc"         },
  { code: "KRW", symbol: "₩",    name: "South Korean Won"    },
  { code: "BRL", symbol: "R$",   name: "Brazilian Real"      },
  { code: "ZAR", symbol: "R",    name: "South African Rand"  },
  { code: "MXN", symbol: "Mex$", name: "Mexican Peso"        },
  { code: "SEK", symbol: "kr",   name: "Swedish Krona"       },
  { code: "NZD", symbol: "NZ$",  name: "New Zealand Dollar"  },
  { code: "HKD", symbol: "HK$",  name: "Hong Kong Dollar"    },
  { code: "CNY", symbol: "¥",    name: "Chinese Yuan"        },
] as const;

type CurrencyCode = (typeof CURRENCIES)[number]["code"];

// ─── Props ────────────────────────────────────────────────────────────────────

interface OnboardingWizardProps {
  /** Called after the user completes (or skips through) both steps. */
  onComplete: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 — phone
  const [countryCode, setCountryCode] = useState("+91");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneError, setPhoneError]     = useState("");

  // Step 2 — currency
  const [currency, setCurrency]         = useState<CurrencyCode>("INR");
  const [isLoading, setIsLoading]       = useState(false);
  const [error, setError]               = useState("");

  // Derived
  const country = COUNTRY_CODES.find((c) => c.code === countryCode)!;
  const selectedCurrency = CURRENCIES.find((c) => c.code === currency)!;
  const phoneDigits = phoneNumber.replace(/\D/g, "");
  const phoneValid  = phoneDigits.length === country.max;

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleSavePhone() {
    if (!phoneValid) {
      setPhoneError(`Enter exactly ${country.max} digits for ${countryCode}.`);
      return;
    }
    setPhoneError("");
    setPhoneLoading(true);
    try {
      await api.patch("/users/update-phone", {
        phone: `${countryCode}${phoneDigits}`,
      });
    } catch {
      // Non-fatal — backend failure should not prevent onboarding from continuing.
    } finally {
      setPhoneLoading(false);
    }
    setStep(2);
  }

  async function handleCompleteCurrency() {
    setError("");
    setIsLoading(true);
    try {
      localStorage.setItem("preferredCurrency", currency);
      window.dispatchEvent(new CustomEvent("currencyChange", { detail: currency }));
      // Ensure backend profile exists regardless of path taken through wizard
      // (fire-and-forget — non-blocking).
      api.post("/auth/firebase-login").catch(() => {});
      // Brief pause so the button spinner is visible
      await new Promise((r) => setTimeout(r, 350));
      onComplete();
    } catch {
      setError("Something went wrong. Please try again.");
      setIsLoading(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    // Blocking full-screen overlay — no close / escape interaction
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      // Swallow all pointer-down events on the backdrop so clicking outside
      // the card does nothing (non-dismissable).
      onPointerDown={(e) => e.target === e.currentTarget && e.preventDefault()}
    >
      {/* Step progress dots */}
      <div className="absolute top-5 flex items-center gap-2">
        {([1, 2] as const).map((s) => (
          <span
            key={s}
            className={`block h-2 rounded-full transition-all duration-300 ${
              s === step   ? "w-7 bg-white"     :
              s < step     ? "w-2 bg-white/60"  :
                             "w-2 bg-white/25"
            }`}
          />
        ))}
      </div>

      {/* Card */}
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">

        {/* ── Purple header ── */}
        <div className="bg-[#7C3AED] px-8 py-6 text-white">
          <div className="flex items-center gap-3">
            {step === 1
              ? <ShieldCheck className="h-7 w-7 shrink-0" />
              : <Coins       className="h-7 w-7 shrink-0" />
            }
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60">
                Step {step} of 2
              </p>
              <h1 className="mt-0.5 text-xl font-bold tracking-tight">
                {step === 1 ? "Secure Your Account" : "Choose Default Currency"}
              </h1>
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="px-8 py-7 space-y-5">

          {/* ════════ STEP 1 — Phone ════════ */}
          {step === 1 && (
            <>
              <p className="text-sm text-gray-500 leading-relaxed">
                Add your phone number to keep your account safe. You can skip this
                and add it later from Settings.
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="wizard-phone">Phone number</Label>
                <div className="flex gap-2">
                  {/* Country code picker */}
                  <Select
                    value={countryCode}
                    onValueChange={(v) => {
                      setCountryCode(v);
                      setPhoneNumber("");
                      setPhoneError("");
                    }}
                    disabled={phoneLoading}
                  >
                    <SelectTrigger className="w-[110px] shrink-0 font-mono text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRY_CODES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.flag} {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Digit input */}
                  <Input
                    id="wizard-phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder={`${country.max}-digit number`}
                    value={phoneNumber}
                    onChange={(e) => {
                      setPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, country.max));
                      setPhoneError("");
                    }}
                    disabled={phoneLoading}
                    maxLength={country.max}
                  />
                </div>
                <p className="text-xs text-gray-400">
                  {phoneDigits.length}/{country.max} digits
                </p>
              </div>

              {/* Error */}
              {phoneError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                  <AlertCircle className="mt-px h-4 w-4 shrink-0 text-red-500" />
                  <p className="text-xs text-red-600">{phoneError}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-2 pt-1">
                <Button
                  onClick={handleSavePhone}
                  disabled={phoneLoading}
                  size="lg"
                  className="w-full gap-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white"
                >
                  {phoneLoading
                    ? <><Loader2 className="h-4 w-4 animate-spin" />Loading…</>
                    : <><ArrowRight className="h-4 w-4" />Save &amp; Continue</>
                  }
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setStep(2)}
                  disabled={phoneLoading}
                  className="w-full text-sm text-gray-400 hover:text-gray-600"
                >
                  Skip for now
                </Button>
              </div>
            </>
          )}

          {/* ════════ STEP 2 — Currency ════════ */}
          {step === 2 && (
            <>
              <p className="text-sm text-gray-500 leading-relaxed">
                All amounts in BudgetBuddy will be displayed in this currency.
                You can change it at any time from Settings.
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="wizard-currency">Currency</Label>
                <Select
                  value={currency}
                  onValueChange={(v) => { setCurrency(v as CurrencyCode); setError(""); }}
                  disabled={isLoading}
                >
                  <SelectTrigger id="wizard-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        <span className="font-mono text-xs text-gray-400 w-8 inline-block">
                          {c.symbol}
                        </span>
                        {c.name}{" "}
                        <span className="text-gray-400">({c.code})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Live preview */}
              <div className="rounded-xl border border-[#7C3AED]/25 bg-[#7C3AED]/5 px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-gray-500">Preview</span>
                <span className="font-bold text-[#7C3AED] text-lg">
                  {selectedCurrency.symbol}1,234.56
                </span>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                  <AlertCircle className="mt-px h-4 w-4 shrink-0 text-red-500" />
                  <p className="text-xs text-red-600">{error}</p>
                </div>
              )}

              <Button
                onClick={handleCompleteCurrency}
                disabled={isLoading}
                size="lg"
                className="w-full gap-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white mt-1"
              >
                {isLoading
                  ? <><Loader2 className="h-4 w-4 animate-spin" />Loading…</>
                  : <><Check className="h-4 w-4" />Complete Setup</>
                }
              </Button>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
