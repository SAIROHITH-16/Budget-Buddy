import { useState, useEffect, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { StatCard } from "@/components/StatCard";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryPieChart } from "@/components/charts/CategoryPieChart";
import { IncomeExpenseLineChart } from "@/components/charts/IncomeExpenseLineChart";
import { MonthlySpendingChart } from "@/components/charts/MonthlySpendingChart";
import { CurrencySetupDialog } from "@/components/CurrencySetupDialog";
import { useTransactions } from "@/hooks/useTransactions";
import {
  getCategoryDistribution,
  getDailyIncomeExpenseTrend,
  formatCurrency,
} from "@/utils/calculations";
import { TrendingUp, TrendingDown, Wallet, AlertTriangle, AlertCircle } from "lucide-react";
import api from "@/api";

// ---------------------------------------------------------------------------
// Budget state type
// ---------------------------------------------------------------------------
interface Budget {
  monthlyLimit: number;
  alertThreshold: number; // 1–100 percent
}

const Dashboard = () => {
  // Fetch ALL transactions on mount — needed so every income/expense is
  // included in the Money In / Money Out totals (not just the first 20).
  const { transactions, loading, error } = useTransactions({ initialLimit: 10_000 });

  const [budget, setBudget] = useState<Budget>({ monthlyLimit: 0, alertThreshold: 80 });
  const [, setCurrencyUpdate] = useState(0);

  // -------------------------------------------------------------------------
  // Fetch the user's budget settings on mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    api.get<Budget>("/budget")
      .then(({ data }) => { if (!cancelled) setBudget(data); })
      .catch(() => { /* silently ignore — no budget set yet */ });
    return () => { cancelled = true; };
  }, []);

  // -------------------------------------------------------------------------
  // Listen for currency changes to trigger re-render
  // -------------------------------------------------------------------------
  useEffect(() => {
    const handleCurrencyChange = () => setCurrencyUpdate(prev => prev + 1);
    window.addEventListener("currencyChange", handleCurrencyChange);
    return () => window.removeEventListener("currencyChange", handleCurrencyChange);
  }, []);

  // -------------------------------------------------------------------------
  // Listen for budget changes saved in the Settings page
  // -------------------------------------------------------------------------
  useEffect(() => {
    const handleBudgetChange = (e: Event) => {
      const detail = (e as CustomEvent<Budget>).detail;
      if (detail?.monthlyLimit !== undefined) {
        // Use the payload directly — no extra network round-trip needed
        setBudget(detail);
      } else {
        // Fallback: just re-fetch if the event carries no payload
        api.get<Budget>("/budget")
          .then(({ data }) => setBudget(data))
          .catch(() => {});
      }
    };
    window.addEventListener("budgetChange", handleBudgetChange);
    return () => window.removeEventListener("budgetChange", handleBudgetChange);
  }, []);

  // -------------------------------------------------------------------------
  // Transaction totals — sign-first accumulator.
  //
  // classify(tx) — priority order:
  //   1. Raw amount starts with "-"                     → "withdrawal"
  //   2. Raw amount starts with "+"                     → "deposit"
  //   3. tx.type is "expense" | "debit" | "dr"         → "withdrawal"
  //   4. tx.type is "income"  | "credit" | "cr"        → "deposit"
  //   5. tx.withdrawal column is a positive number      → "withdrawal"
  //   6. tx.deposit   column is a positive number       → "deposit"
  //   7. fallback                                       → "deposit"
  //
  // Dedup: keyed by tx.id so two legitimately identical transactions that have
  // distinct IDs are both counted; only true duplicate rows (same id) are skipped.
  // Zero-amount rows are always skipped.
  // -------------------------------------------------------------------------
  const { totalDeposits, totalWithdrawals, netFlow } = useMemo(() => {
    let deposits    = 0;
    let withdrawals = 0;
    const seen      = new Set<string>();

    transactions.forEach((tx) => {
      // Dedup by id — fall back to a content key only when id is absent
      const key = String(tx.id ?? `${tx.date}-${tx.description}-${tx.amount}`);
      if (seen.has(key)) return;
      seen.add(key);

      // Resolve the numeric amount from whichever column is populated
      const rawStr = String(tx.amount ?? "").trim();
      const cleaned = rawStr.replace(/,/g, "");
      const parsed  = parseFloat(cleaned);
      const amt     = isNaN(parsed) ? 0 : Math.abs(parsed);
      if (amt === 0) return;                           // skip zero-amount rows

      // ── classify ──────────────────────────────────────────────────────────
      const typeLower = (tx.type ?? "").toLowerCase().trim();

      // Rules 1 & 2 — explicit sign on raw string takes full priority
      if (cleaned.startsWith("-")) { withdrawals += amt; return; }
      if (cleaned.startsWith("+")) { deposits    += amt; return; }

      // Rules 3 & 4 — type field
      if (typeLower === "expense" || typeLower === "debit" || typeLower === "dr") {
        withdrawals += amt; return;
      }
      if (typeLower === "income" || typeLower === "credit" || typeLower === "cr") {
        deposits += amt; return;
      }

      // Rules 5 & 6 — dedicated withdrawal / deposit columns (bank CSV exports)
      const wCol = parseFloat(String((tx as unknown as Record<string, unknown>).withdrawal ?? "0").replace(/,/g, ""));
      const dCol = parseFloat(String((tx as unknown as Record<string, unknown>).deposit   ?? "0").replace(/,/g, ""));
      if (!isNaN(wCol) && wCol > 0) { withdrawals += Math.abs(wCol); return; }
      if (!isNaN(dCol) && dCol > 0) { deposits    += Math.abs(dCol); return; }

      // Rule 7 — safe fallback
      deposits += amt;
    });

    return {
      totalDeposits:    deposits,
      totalWithdrawals: withdrawals,
      netFlow:          deposits - withdrawals,
    };
  }, [transactions]);

  const categoryData       = useMemo(() => getCategoryDistribution(transactions),    [transactions]);
  const incomeExpenseTrend = useMemo(() => getDailyIncomeExpenseTrend(transactions), [transactions]);

  // -------------------------------------------------------------------------
  // Budget calculations
  //   spendPercent  → how full the progress bar should be (0–100, capped)
  //   spentRatio    → raw ratio for alert logic (can exceed 100)
  //   isOverLimit   → totalWithdrawals >= monthlyLimit (red)
  //   isOverAlert   → spend% >= alertThreshold but still under limit (yellow)
  // -------------------------------------------------------------------------
  const hasLimit      = budget.monthlyLimit > 0;
  const spentRatio    = hasLimit ? (totalWithdrawals / budget.monthlyLimit) * 100 : 0;
  const spendPercent  = Math.min(spentRatio, 100);
  const isOverLimit   = hasLimit && totalWithdrawals >= budget.monthlyLimit;
  const isOverAlert   = hasLimit && !isOverLimit && spentRatio >= budget.alertThreshold;

  // Formatted display strings — used in stat cards
  const fmtDeposits    = formatCurrency(totalDeposits);
  const fmtWithdrawals = formatCurrency(totalWithdrawals);
  const fmtNetFlow     = (netFlow >= 0 ? "+" : "") + formatCurrency(netFlow);

  // Progress bar indicator colour
  const progressColor = isOverLimit
    ? "bg-red-500"
    : isOverAlert
    ? "bg-yellow-400"
    : "bg-emerald-500";

  return (
    <Layout>
      <CurrencySetupDialog />
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-sm text-muted-foreground mt-1">Your financial overview at a glance</p>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Budget alert banners — shown only when a limit is configured        */}
        {/* ------------------------------------------------------------------ */}
        {isOverLimit && (
          <div className="flex items-start gap-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-400">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">Budget exceeded!</p>
              <p className="text-xs mt-0.5">
                You've spent {fmtWithdrawals} — {formatCurrency(totalWithdrawals - budget.monthlyLimit)} over
                your {formatCurrency(budget.monthlyLimit)} limit.
              </p>
            </div>
          </div>
        )}

        {isOverAlert && (
          <div className="flex items-start gap-3 rounded-lg border border-yellow-400/40 bg-yellow-400/10 px-4 py-3 text-yellow-400">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">Approaching your budget limit</p>
              <p className="text-xs mt-0.5">
                You've used {Math.round(spentRatio)}% ({fmtWithdrawals}) of your{" "}
                {formatCurrency(budget.monthlyLimit)} monthly limit.
              </p>
            </div>
          </div>
        )}

        {/* Backend unreachable — show a non-blocking amber notice */}
        {error && !loading && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-400/40 bg-amber-400/8 px-4 py-2.5 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <p className="text-xs">
              Could not load data: <span className="font-medium">{error}</span>
              {" — "}
              run <code className="font-mono">npm run dev</code> to start both servers, then refresh.
            </p>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Stat cards                                                          */}
        {/* ------------------------------------------------------------------ */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {loading ? (
            <>
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
            </>
          ) : (
            <>
              {/* Card 1: Money In (Total Deposits) */}
              <StatCard
                title="Money In"
                value={fmtDeposits}
                icon={<TrendingUp className="h-5 w-5 income-text" />}
                variant="income"
              />

              {/* Card 2: Money Out (Total Withdrawals) — embeds budget progress bar */}
              <StatCard
                title="Money Out"
                value={fmtWithdrawals}
                icon={<TrendingDown className="h-5 w-5 expense-text" />}
                variant="expense"
              >
                {hasLimit && (
                  <div className="space-y-1.5">
                    <Progress
                      value={spendPercent}
                      className="h-2"
                      indicatorClassName={progressColor}
                    />
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {fmtWithdrawals} / {formatCurrency(budget.monthlyLimit)}
                      {" "}({Math.round(spentRatio)}%)
                    </p>
                  </div>
                )}
              </StatCard>

              {/* Card 3: Net Cash Flow — green (+) when positive, red when negative */}
              <StatCard
                title="Net Cash Flow"
                value={fmtNetFlow}
                icon={<Wallet className={`h-5 w-5 ${netFlow >= 0 ? "income-text" : "expense-text"}`} />}
                valueClassName={netFlow >= 0 ? "income-text" : "expense-text"}
              />
            </>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {loading ? (
            <>
              <Skeleton className="h-64 rounded-xl" />
              <Skeleton className="h-64 rounded-xl" />
            </>
          ) : (
            <>
              <CategoryPieChart data={categoryData} />
              <IncomeExpenseLineChart data={incomeExpenseTrend} />
            </>
          )}
        </div>

        {loading ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : (
          <MonthlySpendingChart transactions={transactions} />
        )}
      </div>
    </Layout>
  );
};

export default Dashboard;
