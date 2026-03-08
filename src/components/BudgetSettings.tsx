import { useState, useEffect } from "react";
import { Loader2, Save, Wallet } from "lucide-react";
import api from "@/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { getCurrencySymbol } from "@/utils/calculations";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Budget {
  monthlyLimit: number;
  alertThreshold: number; // 1–100 (percentage)
}

// ---------------------------------------------------------------------------
// BudgetSettings
// Fetch the user's budget on mount, let them edit limit + threshold, save.
// ---------------------------------------------------------------------------
export function BudgetSettings() {
  const [budget, setBudget] = useState<Budget>({ monthlyLimit: 0, alertThreshold: 80 });
  const [enabled, setEnabled]   = useState<boolean>(
    () => localStorage.getItem("budgetEnabled") !== "false"
  );
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [currencySymbol, setCurrencySymbol] = useState(getCurrencySymbol());

  // -------------------------------------------------------------------------
  // Fetch current budget on mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<Budget>("/budget");
        if (!cancelled) setBudget(data);
      } catch (e: any) {
        // 404 = route not yet deployed or no budget set — fall back to defaults silently
        const status = e?.response?.status;
        if (!cancelled && status !== 404) {
          setError("Failed to load budget settings. Please try refreshing.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // -------------------------------------------------------------------------
  // Listen for currency changes
  // -------------------------------------------------------------------------
  useEffect(() => {
    const handleCurrencyChange = () => {
      setCurrencySymbol(getCurrencySymbol());
    };
    window.addEventListener("currencyChange", handleCurrencyChange);
    return () => window.removeEventListener("currencyChange", handleCurrencyChange);
  }, []);

  // -------------------------------------------------------------------------
  // Toggle handler — persist preference and notify Dashboard
  // -------------------------------------------------------------------------
  const handleToggle = async (on: boolean) => {
    setEnabled(on);
    localStorage.setItem("budgetEnabled", String(on));
    if (!on) {
      // Save limit as 0 to disable budget tracking on the backend too
      try {
        const { data } = await api.post<Budget>("/budget", {
          monthlyLimit:   0,
          alertThreshold: budget.alertThreshold,
        });
        setBudget(data);
        window.dispatchEvent(new CustomEvent("budgetChange", { detail: data }));
      } catch { /* silently ignore */ }
    }
  };

  // -------------------------------------------------------------------------
  // Save handler — POST /api/budget (upsert on the backend)
  // -------------------------------------------------------------------------
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { data } = await api.post<Budget>("/budget", {
        monthlyLimit:   Number(budget.monthlyLimit),
        alertThreshold: budget.alertThreshold,
      });
      setBudget(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      // Notify any mounted Dashboard (or other listeners) that budget has changed
      window.dispatchEvent(new CustomEvent("budgetChange", { detail: data }));
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 404) {
        setError("Budget API not available yet — please ensure the server is running.");
      } else {
        setError(e.response?.data?.error ?? "Failed to save budget. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------------------------------------------------
  // Derived: exact dollar amount at the alert threshold
  // -------------------------------------------------------------------------
  const alertAmount = ((budget.alertThreshold / 100) * budget.monthlyLimit).toFixed(2);
  const hasLimit    = budget.monthlyLimit > 0;

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Budget Settings
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold ${
              enabled ? "text-emerald-600" : "text-muted-foreground"
            }`}>
              {enabled ? "ON" : "OFF"}
            </span>
            <Switch
              checked={enabled}
              onCheckedChange={handleToggle}
              aria-label="Enable budget tracking"
            />
          </div>
        </div>
        <CardDescription>
          {enabled
            ? "Set your monthly spending limit and choose when to be alerted."
            : "Budget tracking is disabled. Toggle on to set a spending limit."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {!enabled ? (
          <div className="flex flex-col items-center justify-center py-6 gap-2 text-muted-foreground">
            <Wallet className="h-10 w-10 opacity-25" />
            <p className="text-sm">Budget tracking is off.</p>
            <p className="text-xs">Toggle the switch above to enable it.</p>
          </div>
        ) : (
          <>
        {/* ------------------------------------------------------------------ */}
        {/* Monthly Limit                                                       */}
        {/* ------------------------------------------------------------------ */}
        <div className="space-y-2">
          <Label htmlFor="monthly-limit">Monthly Limit ({currencySymbol})</Label>
          <Input
            id="monthly-limit"
            type="number"
            min={0}
            step={10}
            placeholder="e.g. 1000"
            value={budget.monthlyLimit === 0 ? "" : budget.monthlyLimit}
            onChange={(e) =>
              setBudget((b) => ({
                ...b,
                monthlyLimit: e.target.value === "" ? 0 : Number(e.target.value),
              }))
            }
          />
          <p className="text-xs text-muted-foreground">
            Set to 0 to disable budget tracking.
          </p>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Alert Threshold slider                                              */}
        {/* ------------------------------------------------------------------ */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Alert Threshold</Label>
            <span className="text-sm font-semibold tabular-nums">
              {budget.alertThreshold}%
            </span>
          </div>

          <Slider
            min={1}
            max={100}
            step={1}
            value={[budget.alertThreshold]}
            onValueChange={([val]) =>
              setBudget((b) => ({ ...b, alertThreshold: val }))
            }
          />

          {/* Dynamic currency-amount label */}
          <p className="text-sm rounded-md bg-muted/50 px-3 py-2 text-muted-foreground">
            {hasLimit ? (
              <>
                Alert me when I spend{" "}
                <span className="font-semibold text-foreground">
                  {currencySymbol}{alertAmount}
                </span>{" "}
                of my{" "}
                <span className="font-semibold text-foreground">
                  {currencySymbol}{budget.monthlyLimit.toLocaleString()}
                </span>{" "}
                limit.
              </>
            ) : (
              "Set a monthly limit above to see the alert amount."
            )}
          </p>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Error / success feedback                                            */}
        {/* ------------------------------------------------------------------ */}
        {error && (
          <p className="text-sm expense-text">{error}</p>
        )}
        {saved && (
          <p className="text-sm income-text">Budget saved successfully.</p>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Save button                                                         */}
        {/* ------------------------------------------------------------------ */}
        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {saving ? "Saving…" : "Save Budget"}
        </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
