// src/components/OnboardingWizard.tsx
// Two-step onboarding wizard shown to every authenticated user who has not yet
// completed initial setup.
//
// Step 1 — Phone number  → PUT /api/users/setup { phone }
// Step 2 — Currency      → localStorage + currencyChange event
//
// The overlay is blocking — it has NO close / dismiss button.
// The parent must call `onComplete` (fires after currency is saved) to unmount it.

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
  { code: "+91",  flag: "🇮🇳", max: 10 },
  { code: "+1",   flag: "🇺🇸", max: 10 },
  { code: "+44",  flag: "🇬🇧", max: 10 },
  { code: "+61",  flag: "🇦🇺", max: 9  },
  { code: "+81",  flag: "🇯🇵", max: 10 },
  { code: "+49",  flag: "🇩🇪", max: 11 },
  { code: "+33",  flag: "🇫🇷", max: 9  },
  { code: "+86",  flag: "🇨🇳", max: 11 },
  { code: "+971", flag: "🇦🇪", max: 9  },
  { code: "+65",  flag: "🇸🇬", max: 8  },
] as const;

type CountryCode = (typeof COUNTRY_CODES)[number]["code"];

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
  /** Called after the user completes both steps. */
  onComplete: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 — phone
  const [countryCode, setCountryCode] = useState<CountryCode>("+91");
  const [phoneDigits, setPhoneDigits] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneError, setPhoneError] = useState("");

  // Step 2 — currency
  const [currency, setCurrency]   = useState<CurrencyCode>("INR");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState("");

  const selectedCountry  = COUNTRY_CODES.find((c) => c.code === countryCode)!;
  const selectedCurrency = CURRENCIES.find((c) => c.code === currency)!;

  // ── Step 1 handler ─────────────────────────────────────────────────────────

  async function handleSavePhone() {
    setPhoneError("");

    const digits = phoneDigits.replace(/\D/g, "");
    if (digits.length < 6) {
      setPhoneError("Please enter a valid phone number.");
      return;
    }
    if (digits.length > selectedCountry.max) {
      setPhoneError(`Phone number must be at most ${selectedCountry.max} digits for ${countryCode}.`);
      return;
    }

    setPhoneLoading(true);
    try {
      await api.put("/users/setup", { phone: `${countryCode}${digits}` });
      setStep(2);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Could not save phone number. Please try again.";
      setPhoneError(msg);
    } finally {
      setPhoneLoading(false);
    }
  }

  // ── Step 2 handler ─────────────────────────────────────────────────────────

  async function handleCompleteCurrency() {
    setError("");
    setIsLoading(true);
    try {
      localStorage.setItem("preferredCurrency", currency);
      window.dispatchEvent(new CustomEvent("currencyChange", { detail: currency }));
      // Fire-and-forget — currency is stored client-side; backend just acknowledges.
      api.put("/users/setup", { currency }).catch(() => {});
      await new Promise((r) => setTimeout(r, 300));
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
      onPointerDown={(e) => e.target === e.currentTarget && e.preventDefault()}
    >
      {/* Card */}
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 bg-[#7C3AED]/5 py-3">
          <span
            className={`h-2.5 w-2.5 rounded-full transition-colors ${
              step === 1 ? "bg-[#7C3AED]" : "bg-[#7C3AED]/30"
            }`}
          />
          <span
            className={`h-2.5 w-2.5 rounded-full transition-colors ${
              step === 2 ? "bg-[#7C3AED]" : "bg-[#7C3AED]/30"
            }`}
          />
          <span className="ml-2 text-xs text-gray-400 font-medium">
            Step {step} of 2
          </span>
        </div>

        {/* ── STEP 1: Phone ─────────────────────────────────────────────── */}
        {step === 1 && (
          <>
            {/* Purple header */}
            <div className="bg-[#7C3AED] px-8 py-6 text-white">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-7 w-7 shrink-0" />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60">
                    Step 1 of 2
                  </p>
                  <h1 className="mt-0.5 text-xl font-bold tracking-tight">
                    Secure Your Account
                  </h1>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-8 py-7 space-y-5">
              <p className="text-sm text-gray-500 leading-relaxed">
                Add a phone number to help recover your account and receive
                important notifications.
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="wizard-phone">Phone Number</Label>
                <div className="flex gap-2">
                  {/* Country code select */}
                  <Select
                    value={countryCode}
                    onValueChange={(v) => {
                      setCountryCode(v as CountryCode);
                      setPhoneError("");
                    }}
                    disabled={phoneLoading}
                  >
                    <SelectTrigger className="w-24 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRY_CODES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.flag} {c.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Digits */}
                  <Input
                    id="wizard-phone"
                    type="tel"
                    inputMode="numeric"
                    placeholder={`${selectedCountry.max}-digit number`}
                    value={phoneDigits}
                    onChange={(e) => {
                      setPhoneDigits(e.target.value.replace(/\D/g, ""));
                      setPhoneError("");
                    }}
                    maxLength={selectedCountry.max}
                    disabled={phoneLoading}
                    className="flex-1"
                    onKeyDown={(e) => e.key === "Enter" && handleSavePhone()}
                  />
                </div>
              </div>

              {/* Error */}
              {phoneError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                  <AlertCircle className="mt-px h-4 w-4 shrink-0 text-red-500" />
                  <p className="text-xs text-red-600">{phoneError}</p>
                </div>
              )}

              <div className="space-y-2">
                <Button
                  onClick={handleSavePhone}
                  disabled={phoneLoading}
                  size="lg"
                  className="w-full gap-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white"
                >
                  {phoneLoading
                    ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</>
                    : <><ArrowRight className="h-4 w-4" />Save &amp; Continue</>
                  }
                </Button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={phoneLoading}
                  className="w-full text-xs text-gray-400 hover:text-gray-600 transition-colors py-1"
                >
                  Skip for now
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── STEP 2: Currency ──────────────────────────────────────────── */}
        {step === 2 && (
          <>
            {/* Purple header */}
            <div className="bg-[#7C3AED] px-8 py-6 text-white">
              <div className="flex items-center gap-3">
                <Coins className="h-7 w-7 shrink-0" />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60">
                    Step 2 of 2
                  </p>
                  <h1 className="mt-0.5 text-xl font-bold tracking-tight">
                    Choose Default Currency
                  </h1>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-8 py-7 space-y-5">
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
                  ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</>
                  : <><Check className="h-4 w-4" />Complete Setup</>
                }
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

