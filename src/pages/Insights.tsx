import { useState, useEffect, useMemo, useRef } from "react";
import { Layout } from "@/components/Layout";
import { CurrencySetupDialog } from "@/components/CurrencySetupDialog";
import { useInsights } from "@/hooks/useInsights";
import { useTransactions } from "@/hooks/useTransactions";
import { formatCurrency } from "@/utils/calculations";
import {
  Brain, TrendingUp, TrendingDown, Minus, Lightbulb, BarChart3,
  Loader2, ChevronLeft, ChevronRight, CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** "YYYY-MM" ± delta months → "YYYY-MM" */
function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Inline Month/Year Picker Popover
// ---------------------------------------------------------------------------
interface MonthPickerProps {
  value: string;
  min: string;
  max: string;
  dataMonths: Set<string>;
  onChange: (ym: string) => void;
}

function MonthPicker({ value, min, max, dataMonths, onChange }: MonthPickerProps) {
  const [open, setOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => parseInt(value.slice(0, 4)));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setPickerYear(parseInt(value.slice(0, 4))); }, [value]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const minYear = parseInt(min.slice(0, 4));
  const maxYear = parseInt(max.slice(0, 4));
  const selectedY = parseInt(value.slice(0, 4));
  const selectedM = parseInt(value.slice(5, 7));

  const displayLabel = value
    ? new Date(value + "-02").toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 h-9 rounded-lg border border-input bg-background px-3 text-sm font-semibold hover:bg-muted transition-colors min-w-[180px] justify-between"
      >
        <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="flex-1 text-center">{displayLabel}</span>
        <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-64 rounded-xl border border-border bg-background shadow-xl p-3">
          {/* Year navigation */}
          <div className="flex items-center justify-between mb-3 px-1">
            <button
              onClick={() => setPickerYear((y) => Math.max(y - 1, minYear))}
              disabled={pickerYear <= minYear}
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-bold tabular-nums">{pickerYear}</span>
            <button
              onClick={() => setPickerYear((y) => Math.min(y + 1, maxYear))}
              disabled={pickerYear >= maxYear}
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Month grid */}
          <div className="grid grid-cols-3 gap-1">
            {MONTH_NAMES.map((name, idx) => {
              const monthNum = idx + 1;
              const ym = `${pickerYear}-${String(monthNum).padStart(2, "0")}`;
              const isSelected = pickerYear === selectedY && monthNum === selectedM;
              const isDisabled = ym < min || ym > max;
              const hasData = dataMonths.has(ym);

              return (
                <button
                  key={name}
                  disabled={isDisabled}
                  onClick={() => { onChange(ym); setOpen(false); }}
                  className={[
                    "relative flex flex-col items-center justify-center h-10 rounded-lg text-xs font-medium transition-colors",
                    isDisabled
                      ? "opacity-25 cursor-not-allowed"
                      : isSelected
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-foreground",
                  ].join(" ")}
                >
                  {name}
                  {hasData && !isSelected && (
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary/70" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const Insights = () => {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const { insights, loading, error, fetchInsights, clearInsights } = useInsights();
  const [, setCurrencyUpdate] = useState(0);

  // Fetch all transactions so the edge function can analyse any selected month.
  const { transactions, loading: txLoading } = useTransactions({ initialLimit: 10_000 });

  const earliestMonth = useMemo(() => {
    const months = transactions
      .map((t) => String(t.date).slice(0, 7))
      .filter((m) => /^\d{4}-\d{2}$/.test(m))
      .sort();
    return months[0] ?? currentMonth;
  }, [transactions, currentMonth]);

  // Set of all months that have data — powers the picker dots
  const dataMonths = useMemo(
    () => new Set(transactions.map((t) => String(t.date).slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m))),
    [transactions]
  );

  const hasDataForMonth = useMemo(
    () => transactions.some((t) => String(t.date).slice(0, 7) === month),
    [transactions, month]
  );

  // Only send current + previous month transactions to avoid huge payloads
  const relevantTxs = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const prevDate = new Date(y, m - 2, 1);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
    return transactions.filter((t) => {
      const txMonth = String(t.date).slice(0, 7);
      return txMonth === month || txMonth === prevMonth;
    });
  }, [month, transactions]);

  // Arrow navigation bounds
  const canGoPrev = month > earliestMonth;
  const canGoNext = month < currentMonth;

  const goPrev = () => setMonth(shiftMonth(month, -1));
  const goNext = () => setMonth(shiftMonth(month, +1));

  const displayMonth = month
    ? new Date(month + "-02").toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "";

  // Only call the AI when we know there's data for the selected month;
  // clear stale insights immediately when navigating to an empty month.
  useEffect(() => {
    if (txLoading) return;
    if (!hasDataForMonth) {
      clearInsights();
    } else {
      fetchInsights(month, relevantTxs);
    }
  }, [month, relevantTxs, txLoading, hasDataForMonth, fetchInsights, clearInsights]);

  // Listen for currency changes to trigger re-render
  useEffect(() => {
    const handleCurrencyChange = () => setCurrencyUpdate(prev => prev + 1);
    window.addEventListener("currencyChange", handleCurrencyChange);
    return () => window.removeEventListener("currencyChange", handleCurrencyChange);
  }, []);

  const directionIcon = insights?.month_comparison?.direction === "up"
    ? <TrendingUp className="h-5 w-5 expense-text" />
    : insights?.month_comparison?.direction === "down"
    ? <TrendingDown className="h-5 w-5 income-text" />
    : <Minus className="h-5 w-5 text-muted-foreground" />;

  return (
    <Layout>
      <CurrencySetupDialog />
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Brain className="h-6 w-6 text-primary" />
              AI Insights
            </h2>
            <p className="text-sm text-muted-foreground mt-1">AI-powered financial analysis</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Prev arrow */}
            <button
              onClick={goPrev}
              disabled={!canGoPrev || txLoading}
              className="h-9 w-9 flex items-center justify-center rounded-lg border border-input bg-background hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {/* Popover month/year picker */}
            <MonthPicker
              value={month}
              min={earliestMonth}
              max={currentMonth}
              dataMonths={dataMonths}
              onChange={setMonth}
            />

            {/* Next arrow */}
            <button
              onClick={goNext}
              disabled={!canGoNext || txLoading}
              className="h-9 w-9 flex items-center justify-center rounded-lg border border-input bg-background hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            <Button
              onClick={() => hasDataForMonth && fetchInsights(month, relevantTxs)}
              disabled={loading || txLoading || !hasDataForMonth}
              size="sm"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
            </Button>
          </div>
        </div>

        {/* No-data empty state — shown immediately from local data, no API round-trip */}
        {!txLoading && !hasDataForMonth && !loading && (
          <div className="glass-card p-12 flex flex-col items-center justify-center text-center gap-3">
            <Brain className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground font-medium">No transactions for {displayMonth}</p>
            <p className="text-sm text-muted-foreground/70">
              Months with data show a dot in the calendar picker.
            </p>
          </div>
        )}

        {/* Real API error (not a no-data situation) */}
        {error && !loading && hasDataForMonth && !error.toLowerCase().includes("no transactions") && (
          <div className="glass-card p-4 border-destructive/30">
            <p className="text-sm expense-text">{error}</p>
          </div>
        )}

        {loading && !insights && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Summary card — full width */}
            <div className="glass-card p-5 lg:col-span-2 space-y-3">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-[90%]" />
              <Skeleton className="h-3.5 w-[75%]" />
            </div>
            {/* Top categories card */}
            <div className="glass-card p-5 space-y-4">
              <Skeleton className="h-4 w-40" />
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-6 w-6 rounded-full" />
                    <Skeleton className="h-3.5 w-24" />
                  </div>
                  <Skeleton className="h-3.5 w-16" />
                </div>
              ))}
            </div>
            {/* Month comparison card */}
            <div className="glass-card p-5 space-y-4">
              <Skeleton className="h-4 w-36" />
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/50 space-y-1.5">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <div className="p-3 rounded-lg bg-muted/50 space-y-1.5">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
            </div>
            {/* Suggestions card — full width */}
            <div className="glass-card p-5 lg:col-span-2 space-y-3">
              <Skeleton className="h-4 w-44" />
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                  <Skeleton className="h-6 w-6 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-full" />
                    <Skeleton className="h-3.5 w-[80%]" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {insights && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Monthly Summary */}
            <div className="glass-card p-5 lg:col-span-2">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                <Brain className="h-4 w-4" />
                Monthly Summary
              </h3>
              <p className="text-foreground leading-relaxed">{insights.summary}</p>
            </div>

            {/* Top Categories */}
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-muted-foreground mb-4 flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Top Spending Categories
              </h3>
              <div className="space-y-3">
                {insights.top_categories.map((cat, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium">{cat.name}</span>
                    </div>
                    <span className="font-mono text-sm expense-text">{formatCurrency(cat.amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Month Comparison */}
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-muted-foreground mb-4">Month-to-Month</h3>
              {insights.month_comparison ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    {directionIcon}
                    <div>
                      <p className="text-sm font-medium">
                        {insights.month_comparison.direction === "up" ? "Spending increased" :
                         insights.month_comparison.direction === "down" ? "Spending decreased" : "No change"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {Math.abs(insights.month_comparison.change_percent)}% vs previous month
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">This month</p>
                      <p className="font-mono font-semibold text-sm">{formatCurrency(insights.month_comparison.current_expense)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">Last month</p>
                      <p className="font-mono font-semibold text-sm">{formatCurrency(insights.month_comparison.previous_expense)}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No comparison data available</p>
              )}
            </div>

            {/* Saving Suggestions */}
            <div className="glass-card p-5 lg:col-span-2">
              <h3 className="text-sm font-semibold text-muted-foreground mb-4 flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-yellow-400" />
                AI Saving Suggestions
              </h3>
              <div className="space-y-3">
                {insights.saving_suggestions.map((suggestion, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                    <span className="w-6 h-6 rounded-full bg-primary/10 flex-shrink-0 flex items-center justify-center text-xs font-bold text-primary mt-0.5">
                      {i + 1}
                    </span>
                    <p className="text-sm text-foreground">{suggestion}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Insights;
