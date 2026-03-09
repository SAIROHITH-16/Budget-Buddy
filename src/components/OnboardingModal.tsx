// src/components/OnboardingModal.tsx
// Forced 2-step onboarding modal shown to any authenticated user who has
// not yet completed their initial profile setup.
//
// Step 1 — Phone number   → PATCH /api/users/update-phone (non-fatal if skipped)
// Step 2 — Currency pick  → localStorage.preferredCurrency + dispatches currencyChange event
//
// The modal is non-dismissable (no backdrop click, no Escape) so every user
// must complete (or explicitly skip) both steps before reaching the app.
//
// Props
//   onComplete  called after Step 2 is confirmed — parent removes the overlay

import { useState } from "react";
import { Phone, DollarSign, Check, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import api from "@/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------
const COUNTRY_CODES: { code: string; label: string; max: number }[] = [
  { code: "+91",  label: "+91 (IN)",  max: 10 },
  { code: "+1",   label: "+1 (US)",   max: 10 },
  { code: "+44",  label: "+44 (UK)",  max: 10 },
  { code: "+61",  label: "+61 (AU)",  max:  9 },
  { code: "+49",  label: "+49 (DE)",  max: 11 },
  { code: "+81",  label: "+81 (JP)",  max: 11 },
  { code: "+971", label: "+971 (AE)", max:  9 },
  { code: "+65",  label: "+65 (SG)",  max:  8 },
];

const CURRENCIES: { code: string; symbol: string; name: string }[] = [
  { code: "INR", symbol: "₹",    name: "Indian Rupee" },
  { code: "USD", symbol: "$",    name: "US Dollar" },
  { code: "EUR", symbol: "€",    name: "Euro" },
  { code: "GBP", symbol: "£",    name: "British Pound" },
  { code: "JPY", symbol: "¥",    name: "Japanese Yen" },
  { code: "AUD", symbol: "A$",   name: "Australian Dollar" },
  { code: "CAD", symbol: "C$",   name: "Canadian Dollar" },
  { code: "SGD", symbol: "S$",   name: "Singapore Dollar" },
  { code: "AED", symbol: "د.إ",  name: "UAE Dirham" },
  { code: "CHF", symbol: "CHF",  name: "Swiss Franc" },
  { code: "KRW", symbol: "₩",    name: "South Korean Won" },
  { code: "BRL", symbol: "R$",   name: "Brazilian Real" },
  { code: "ZAR", symbol: "R",    name: "South African Rand" },
  { code: "MXN", symbol: "Mex$", name: "Mexican Peso" },
  { code: "SEK", symbol: "kr",   name: "Swedish Krona" },
  { code: "NZD", symbol: "NZ$",  name: "New Zealand Dollar" },
  { code: "HKD", symbol: "HK$",  name: "Hong Kong Dollar" },
  { code: "RUB", symbol: "₽",    name: "Russian Ruble" },
  { code: "TRY", symbol: "₺",    name: "Turkish Lira" },
  { code: "CNY", symbol: "¥",    name: "Chinese Yuan" },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface OnboardingModalProps {
  onComplete: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function OnboardingModal({ onComplete }: OnboardingModalProps) {
  // --- Step ---
  const [step, setStep] = useState<1 | 2>(1);

  // --- Phone state ---
  const [countryCode, setCountryCode] = useState("+91");
  const [phone, setPhone] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneError, setPhoneError]   = useState<string | null>(null);

  // --- Currency state ---
  const [currency, setCurrency] = useState("INR");
  const [currencyLoading, setCurrencyLoading] = useState(false);

  // Current country metadata
  const country = COUNTRY_CODES.find((c) => c.code === countryCode)!;
  const selectedCurrency = CURRENCIES.find((c) => c.code === currency)!;

  // -------------------------------------------------------------------------
  // Step 1 — save phone
  // -------------------------------------------------------------------------
  async function handleSavePhone(): Promise<void> {
    setPhoneError(null);
    const digits = phone.replace(/\D/g, "");

    if (digits.length !== country.max) {
      setPhoneError(`Please enter exactly ${country.max} digits for ${countryCode}.`);
      return;
    }

    const fullPhone = `${countryCode}${digits}`;
    setPhoneLoading(true);
    try {
      await api.patch("/users/update-phone", { phone: fullPhone });
    } catch {
      // Non-fatal — proceed to step 2 even if the backend call fails
    } finally {
      setPhoneLoading(false);
    }
    setStep(2);
  }

  // Skip phone — still need to pick currency
  function handleSkipPhone(): void {
    setStep(2);
  }

  // -------------------------------------------------------------------------
  // Step 2 — save currency + close
  // -------------------------------------------------------------------------
  async function handleSaveCurrency(): Promise<void> {
    setCurrencyLoading(true);
    // Currency is stored client-side (localStorage); dispatch event for live update
    localStorage.setItem("preferredCurrency", currency);
    window.dispatchEvent(new CustomEvent("currencyChange", { detail: currency }));
    // Small artificial delay so the spinner is visible
    await new Promise((r) => setTimeout(r, 300));
    setCurrencyLoading(false);
    onComplete();
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    // Full-screen overlay — blocks the rest of the UI until setup is complete
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">

      {/* Step indicator dots */}
      <div className="absolute top-6 flex gap-2">
        {([1, 2] as const).map((s) => (
          <span
            key={s}
            className={`h-2 rounded-full transition-all duration-300 ${
              s === step
                ? "w-6 bg-white"
                : s < step
                  ? "w-2 bg-white/70"
                  : "w-2 bg-white/30"
            }`}
          />
        ))}
      </div>

      {/* ── Card ─────────────────────────────────────────────────────── */}
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">

        {/* Purple header band */}
        <div className="bg-[#7C3AED] px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            {step === 1
              ? <Phone className="h-6 w-6 shrink-0" />
              : <DollarSign className="h-6 w-6 shrink-0" />
            }
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-white/70">
                Step {step} of 2
              </p>
              <h2 className="text-xl font-bold leading-tight">
                {step === 1 ? "Add your phone number" : "Choose your currency"}
              </h2>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-5">

          {/* ── STEP 1 ── */}
          {step === 1 && (
            <>
              <p className="text-sm text-gray-500">
                Enter your phone number to secure your account and enable quick SMS sign-in.
              </p>

              <div className="space-y-2">
                <Label htmlFor="ob-phone">Phone number</Label>
                <div className="flex gap-2">
                  <Select
                    value={countryCode}
                    onValueChange={(v) => { setCountryCode(v); setPhone(""); setPhoneError(null); }}
                    disabled={phoneLoading}
                  >
                    <SelectTrigger className="w-[120px] shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRY_CODES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input
                    id="ob-phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value.replace(/\D/g, "").slice(0, country.max));
                      setPhoneError(null);
                    }}
                    placeholder={`${country.max}-digit number`}
                    maxLength={country.max}
                    disabled={phoneLoading}
                  />
                </div>
                <p className="text-xs text-gray-400">{country.max} digits · {countryCode}</p>
              </div>

              {phoneError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  <p className="text-xs text-red-600">{phoneError}</p>
                </div>
              )}

              <div className="flex flex-col gap-2 pt-1">
                <Button
                  onClick={handleSavePhone}
                  disabled={phoneLoading || phone.replace(/\D/g, "").length !== country.max}
                  className="w-full gap-2"
                  size="lg"
                >
                  {phoneLoading
                    ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</>
                    : <><ArrowRight className="h-4 w-4" />Save &amp; Continue</>
                  }
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleSkipPhone}
                  disabled={phoneLoading}
                  className="w-full text-gray-400 hover:text-gray-600"
                >
                  Skip for now
                </Button>
              </div>
            </>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <>
              <p className="text-sm text-gray-500">
                Pick the currency BudgetBuddy will use to display all amounts. You can change this later in Settings.
              </p>

              <div className="space-y-2">
                <Label htmlFor="ob-currency">Currency</Label>
                <Select value={currency} onValueChange={setCurrency} disabled={currencyLoading}>
                  <SelectTrigger id="ob-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.symbol} — {c.name} ({c.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Preview pill */}
              <div className="rounded-lg bg-[#7C3AED]/5 border border-[#7C3AED]/20 px-4 py-3 text-sm">
                <span className="text-gray-500">All amounts will appear as </span>
                <span className="font-semibold text-[#7C3AED]">
                  {selectedCurrency.symbol}1,234.56
                </span>
              </div>

              <Button
                onClick={handleSaveCurrency}
                disabled={currencyLoading}
                className="w-full gap-2 mt-1"
                size="lg"
              >
                {currencyLoading
                  ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</>
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
