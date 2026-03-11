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
  type Transaction,
} from "@/utils/calculations";
import { TrendingUp, TrendingDown, Wallet, AlertTriangle, AlertCircle, HandCoins, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/api";

// ---------------------------------------------------------------------------
// Budget state type
// ---------------------------------------------------------------------------
interface Budget {
  monthlyLimit: number;
  alertThreshold: number; // 1–100 percent
}

// Loan as returned by GET /api/loans/pending
interface PendingLoan {
  id: string;
  amount: number;
  borrowerName: string | null;
  dueDate: string | null;
  repaidAmount: number;
  remainingAmount: number;
  loanStatus: "PENDING" | "PARTIALLY_REPAID" | "OVERDUE" | "WRITTEN_OFF";
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
      .catch((error) => {
        console.error("[Dashboard] Budget fetch error:", error.response?.data || error.message);
      });
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
  // Transaction totals — strict type-based bucketing.
  //
  // Each transaction is bucketed into exactly one of the four known types.
  // LENT and REPAID are tracked separately so they never inflate the
  // standard Income / Expense figures shown on the stat cards.
  //
  //   walletBalance = (income + repaid) − (expense + lentOut)
  //   currentlyPending = lentOut − repaid  (net money still with friends)
  //
  // Dedup: keyed by tx.id so identical content with distinct IDs is kept;
  // only true duplicate rows (same id) are skipped.
  // Zero-amount rows are always skipped.
  // -------------------------------------------------------------------------
  const { totalIncome, totalExpense, totalLentOut, totalRepaid, walletBalance, currentlyPending } = useMemo(() => {
    let income  = 0;
    let expense = 0;
    let lentOut = 0;
    let repaid  = 0;
    const seen  = new Set<string>();

    transactions.forEach((tx) => {
      const key = String(tx.id ?? `${tx.date}-${tx.description}-${tx.amount}`);
      if (seen.has(key)) return;
      seen.add(key);

      const amt = Math.abs(parseFloat(String(tx.amount ?? "0").replace(/,/g, "")));
      if (!isFinite(amt) || amt === 0) return;

      const t = (tx.type ?? "").toLowerCase().trim();
      if      (t === "income")  income  += amt;
      else if (t === "expense") expense += amt;
      else if (t === "lent")    lentOut += amt;
      else if (t === "repaid")  repaid  += amt;
    });

    return {
      totalIncome:      income,
      totalExpense:     expense,
      totalLentOut:     lentOut,
      totalRepaid:      repaid,
      walletBalance:    (income + repaid) - (expense + lentOut),
      currentlyPending: lentOut - repaid,
    };
  }, [transactions]);

  // Exclude LENT/REPAID from chart data as well — charts only track income/expense
  const standardTx = useMemo(
    () => transactions.filter((tx) => tx.type === "income" || tx.type === "expense"),
    [transactions]
  );
  const categoryData       = useMemo(() => getCategoryDistribution(standardTx),    [standardTx]);
  const incomeExpenseTrend = useMemo(() => getDailyIncomeExpenseTrend(standardTx), [standardTx]);

  // -------------------------------------------------------------------------
  // Pending loans
  // -------------------------------------------------------------------------
  const [pendingLoans, setPendingLoans]         = useState<PendingLoan[]>([]);
  const [loansLoading, setLoansLoading]         = useState(true);
  const [repayTarget, setRepayTarget]           = useState<PendingLoan | null>(null);
  const [repayAmount, setRepayAmount]           = useState("");
  const [repaySubmitting, setRepaySubmitting]   = useState(false);
  const [repayError, setRepayError]             = useState("");

  // Write-off state
  const [writeOffTarget, setWriteOffTarget]     = useState<PendingLoan | null>(null);
  const [writeOffSubmitting, setWriteOffSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoansLoading(true);
    api.get<PendingLoan[]>("/loans/pending")
      .then(({ data }) => { if (!cancelled) setPendingLoans(data); })
      .catch((error) => {
        console.error("[Dashboard] Loans fetch error:", error.response?.data || error.message);
      })
      .finally(() => { if (!cancelled) setLoansLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleRepaySubmit = async () => {
    if (!repayTarget) return;
    const amt = Number(repayAmount);
    if (isNaN(amt) || amt <= 0) { setRepayError("Enter a valid positive amount."); return; }
    if (amt > repayTarget.remainingAmount) {
      setRepayError(`Amount cannot exceed the remaining balance (${formatCurrency(repayTarget.remainingAmount)}).`);
      return;
    }
    setRepaySubmitting(true);
    setRepayError("");
    try {
      await api.post("/loans/repayment", { loanId: repayTarget.id, amount: amt });
      // Refresh the loans list
      const { data } = await api.get<PendingLoan[]>("/loans/pending");
      setPendingLoans(data);
      setRepayTarget(null);
      setRepayAmount("");
    } catch {
      setRepayError("Failed to record repayment. Please try again.");
    } finally {
      setRepaySubmitting(false);
    }
  };

  const handleWriteOffConfirm = async () => {
    if (!writeOffTarget) return;
    setWriteOffSubmitting(true);
    try {
      await api.patch(`/loans/${writeOffTarget.id}/write-off`);
      // Remove from the visible list immediately
      setPendingLoans((prev) => prev.filter((l) => l.id !== writeOffTarget.id));
      setWriteOffTarget(null);
    } catch {
      // On error just close — user can retry
      setWriteOffTarget(null);
    } finally {
      setWriteOffSubmitting(false);
    }
  };

  // -------------------------------------------------------------------------
  // Budget calculations
  //   spendPercent  → how full the progress bar should be (0–100, capped)
  //   spentRatio    → raw ratio for alert logic (can exceed 100)
  //   isOverLimit   → totalExpense >= monthlyLimit (red)
  //   isOverAlert   → spend% >= alertThreshold but still under limit (yellow)
  // -------------------------------------------------------------------------
  // Budget progress is based on pure expenses only (LENT is not spending)
  const hasLimit      = budget.monthlyLimit > 0;
  const spentRatio    = hasLimit ? (totalExpense / budget.monthlyLimit) * 100 : 0;
  const spendPercent  = Math.min(spentRatio, 100);
  const isOverLimit   = hasLimit && totalExpense >= budget.monthlyLimit;
  const isOverAlert   = hasLimit && !isOverLimit && spentRatio >= budget.alertThreshold;

  // Formatted display strings — used in stat cards
  const fmtIncome          = formatCurrency(totalIncome);
  const fmtExpense         = formatCurrency(totalExpense);
  const fmtWalletBalance   = (walletBalance >= 0 ? "+" : "") + formatCurrency(walletBalance);
  const fmtPending         = formatCurrency(Math.max(currentlyPending, 0));

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
                You've spent {fmtExpense} — {formatCurrency(totalExpense - budget.monthlyLimit)} over
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
                You've used {Math.round(spentRatio)}% ({fmtExpense}) of your{" "}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? (
            <>
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
            </>
          ) : (
            <>
              {/* Card 1: Total Income — pure income transactions only */}
              <StatCard
                title="Total Income"
                value={fmtIncome}
                icon={<TrendingUp className="h-5 w-5 income-text" />}
                variant="income"
              />

              {/* Card 2: Total Expenses — pure expense transactions only, budget bar */}
              <StatCard
                title="Total Expenses"
                value={fmtExpense}
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
                      {fmtExpense} / {formatCurrency(budget.monthlyLimit)}
                      {" "}({Math.round(spentRatio)}%)
                    </p>
                  </div>
                )}
              </StatCard>

              {/* Card 3: Wallet Balance = (income + repaid) − (expense + lent) */}
              <StatCard
                title="Wallet Balance"
                value={fmtWalletBalance}
                icon={<Wallet className={`h-5 w-5 ${walletBalance >= 0 ? "income-text" : "expense-text"}`} />}
                valueClassName={walletBalance >= 0 ? "income-text" : "expense-text"}
              />

              {/* Card 4: Money Lending — net amount currently with friends */}
              <StatCard
                title="Money Lending"
                value={fmtPending}
                icon={<HandCoins className="h-5 w-5 text-amber-500" />}
                valueClassName="text-amber-500"
              >
                <p className="text-xs text-muted-foreground">
                  {currentlyPending > 0
                    ? `${fmtPending} out with friends`
                    : "All settled up"}
                </p>
              </StatCard>
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
          <MonthlySpendingChart transactions={standardTx} />
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Pending Receivables Card                                            */}
        {/* ------------------------------------------------------------------ */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
              <HandCoins className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold tracking-wide uppercase" style={{ fontSize: '0.7rem', letterSpacing: '0.08em' }}>Pending Receivables</h3>
              <p className="text-xs text-muted-foreground">Money you've lent out</p>
            </div>
          </div>

          {loansLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 rounded-lg" />
              <Skeleton className="h-10 rounded-lg" />
            </div>
          ) : pendingLoans.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No pending loans — you're all settled up!</p>
          ) : (
            <ul className="space-y-2">
              {pendingLoans.map((loan) => (
                <li
                  key={loan.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/30 px-4 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium truncate block">
                      {loan.borrowerName ?? "Friend"} owes {formatCurrency(loan.remainingAmount)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {loan.dueDate
                        ? `Due: ${new Date(loan.dueDate).toLocaleDateString()}`
                        : "No due date"}
                      {loan.loanStatus === "OVERDUE" && (
                        <span className="ml-2 text-red-400 font-medium">OVERDUE</span>
                      )}
                      {loan.loanStatus === "PARTIALLY_REPAID" && (
                        <span className="ml-2 text-amber-400 font-medium">
                          ({formatCurrency(loan.repaidAmount)} received)
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => {
                        setRepayTarget(loan);
                        setRepayAmount(String(loan.remainingAmount));
                        setRepayError("");
                      }}
                    >
                      Mark as Received
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      title="Write off as bad debt"
                      onClick={() => setWriteOffTarget(loan)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Recent Transactions                                                 */}
        {/* ------------------------------------------------------------------ */}
        <div className="glass-card p-5 space-y-3">
          <h3 className="text-sm font-semibold tracking-wide uppercase" style={{ fontSize: '0.7rem', letterSpacing: '0.08em' }}>Recent Transactions</h3>
          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
            </div>
          ) : transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No transactions yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {[...transactions].slice(0, 10).map((tx: Transaction) => {
                const isLent    = tx.type === "lent";
                const isRepaid  = tx.type === "repaid";
                const isExpense = tx.type === "expense";

                const label = isLent
                  ? `Lent to ${tx.borrowerName ?? "friend"}`
                  : isRepaid
                  ? `Repaid by ${tx.borrowerName ?? "friend"}`
                  : tx.description;

                const amountClass = isLent
                  ? "expense-text"
                  : isRepaid
                  ? "income-text"
                  : isExpense
                  ? "expense-text"
                  : "income-text";

                const sign = isExpense || isLent ? "-" : "+";

                return (
                  <li
                    key={tx.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:bg-muted/40 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{label}</p>
                      <p className="text-xs text-muted-foreground">
                        {tx.category} &middot; {new Date(tx.date).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`text-sm font-semibold font-mono tabular-nums shrink-0 ${amountClass}`}>
                      {sign}{formatCurrency(tx.amount)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* Write-Off Confirmation Dialog                                         */}
      {/* -------------------------------------------------------------------- */}
      <Dialog open={!!writeOffTarget} onOpenChange={(open) => { if (!open) setWriteOffTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Write Off Bad Debt?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to write off{" "}
              <span className="font-medium text-foreground">
                {formatCurrency(writeOffTarget?.remainingAmount ?? 0)}
              </span>{" "}
              owed by{" "}
              <span className="font-medium text-foreground">
                {writeOffTarget?.borrowerName ?? "friend"}
              </span>{" "}
              as a bad debt expense?
            </p>
            <p className="text-xs text-muted-foreground">
              This will record an expense of that amount and mark the loan as written off.
              It cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setWriteOffTarget(null)}
              disabled={writeOffSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleWriteOffConfirm}
              disabled={writeOffSubmitting}
            >
              {writeOffSubmitting ? "Writing off…" : "Yes, Write Off"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* -------------------------------------------------------------------- */}
      {/* Mark-as-Received Dialog                                               */}
      {/* -------------------------------------------------------------------- */}
      <Dialog open={!!repayTarget} onOpenChange={(open) => { if (!open) setRepayTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Repayment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Recording repayment from{" "}
              <span className="font-medium text-foreground">{repayTarget?.borrowerName ?? "friend"}</span>.
              Remaining: {formatCurrency(repayTarget?.remainingAmount ?? 0)}
            </p>
            <div>
              <Label htmlFor="repay-amount">Amount Received</Label>
              <Input
                id="repay-amount"
                type="number"
                step="0.01"
                min="0.01"
                max={repayTarget?.remainingAmount}
                placeholder="0.00"
                value={repayAmount}
                onChange={(e) => { setRepayAmount(e.target.value); setRepayError(""); }}
              />
              {repayError && <p className="text-xs expense-text mt-1">{repayError}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRepayTarget(null)} disabled={repaySubmitting}>
              Cancel
            </Button>
            <Button onClick={handleRepaySubmit} disabled={repaySubmitting}>
              {repaySubmitting ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default Dashboard;
