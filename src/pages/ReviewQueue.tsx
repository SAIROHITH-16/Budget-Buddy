import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ClipboardCheck, CheckCircle2, Loader2, AlertCircle, CheckCheck,
} from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  usePendingTransactions,
  PENDING_QUERY_KEY,
  type PendingTransaction,
} from "@/hooks/usePendingTransactions";
import { formatCurrency } from "@/utils/calculations";
import api from "@/api";

// ---------------------------------------------------------------------------
// Category list — mirrors server/lib/categorize.js CATEGORIES
// ---------------------------------------------------------------------------
const CATEGORIES = [
  "Salary", "Freelance", "Rent", "Groceries", "Utilities",
  "Transport", "Entertainment", "Health", "Education", "Shopping",
  "Food", "Subscriptions", "Insurance", "Savings", "Investment",
  "Other", "Uncategorized",
] as const;

// ---------------------------------------------------------------------------
// Per-card local state
// ---------------------------------------------------------------------------
interface CardState {
  description: string;  // user's personal note — starts blank every time
  category:    string;  // AI-suggested value, correctable via dropdown
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
export default function ReviewQueue() {
  const queryClient = useQueryClient();
  const [, setCurrencyUpdate] = useState(0);

  // Listen for currency changes to trigger re-render
  useEffect(() => {
    const handleCurrencyChange = () => setCurrencyUpdate(prev => prev + 1);
    window.addEventListener("currencyChange", handleCurrencyChange);
    return () => window.removeEventListener("currencyChange", handleCurrencyChange);
  }, []);
  const { data: transactions = [], isLoading, isError } = usePendingTransactions();

  // Per-card editable state, keyed by transaction id
  const [cardState, setCardState] = useState<Record<string, CardState>>({});

  // Which card's Approve button is currently spinning
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // ── Per-card helpers ──────────────────────────────────────────────────────

  function getCardState(tx: PendingTransaction): CardState {
    return cardState[tx.id] ?? { description: "", category: tx.category };
  }

  function patchCard(id: string, patch: Partial<CardState>) {
    setCardState((prev) => ({
      ...prev,
      [id]: { ...({ description: "", category: "" } as CardState), ...prev[id], ...patch },
    }));
  }

  function removeFromCache(id: string) {
    queryClient.setQueryData<PendingTransaction[]>(
      PENDING_QUERY_KEY,
      (prev) => (prev ?? []).filter((t) => t.id !== id),
    );
  }

  // ── handleApprove ─────────────────────────────────────────────────────────
  // Sends PUT /api/transactions/:id with the user's confirmed description +
  // category, and needsReview: false — moves it out of the queue and onto
  // the main Transactions page / Dashboard.

  async function handleApprove(tx: PendingTransaction) {
    const state = getCardState(tx);
    
    // Optimistic UI: Remove from list immediately
    removeFromCache(tx.id);
    
    try {
      await api.put(`/transactions/${tx.id}`, {
        description: state.description.trim() || tx.description,  // raw bank text fallback
        category:    state.category || tx.category,
        needsReview: false,
      });
    } catch (err) {
      console.error("[ReviewQueue] handleApprove failed:", err);
      // Revert optimistic update on error
      queryClient.setQueryData<PendingTransaction[]>(
        PENDING_QUERY_KEY,
        (prev) => [tx, ...(prev ?? [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      );
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-8">

        {/* ── Page header ── */}
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">End-of-Day Review</h1>
            {!isLoading && transactions.length > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-orange-500/15 px-2.5 py-0.5 text-xs font-bold text-orange-600 ring-1 ring-orange-500/20">
                {transactions.length}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Your bank imported these transactions. Verify the AI's category guess and add a
            personal note so future-you knows exactly what each charge was for.
          </p>
        </div>

        {/* ── Error ── */}
        {isError && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Could not load pending transactions — make sure the server is running.
          </div>
        )}

        {/* ── Loading skeletons ── */}
        {isLoading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="overflow-hidden">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-6 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-56" />
                  <Skeleton className="h-9 w-full rounded-md" />
                  <div className="flex gap-3">
                    <Skeleton className="h-10 flex-1 rounded-md" />
                    <Skeleton className="h-10 w-28 rounded-md" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ── Empty state ── */}
        {!isLoading && !isError && transactions.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-5 py-28 text-muted-foreground">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10 ring-4 ring-emerald-500/10">
              <ClipboardCheck className="h-10 w-10 text-emerald-500" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-xl font-semibold text-foreground">All caught up for today!</p>
              <p className="text-sm">
                No imported transactions are waiting for your review.
                Come back after your next bank sync.
              </p>
            </div>
          </div>
        )}

        {/* ── Transaction cards ── */}
        {!isLoading && transactions.length > 0 && (
          <div className="space-y-4">
            {transactions.map((tx_raw: any) => {
              // Extract the ID gracefully in case React Query cache holds stale data forms
              const tx = { ...tx_raw, id: tx_raw.id || tx_raw._id } as PendingTransaction;
              const state       = getCardState(tx);
              const isApproving = approvingId === tx.id;

              return (
                <Card
                  key={tx.id}
                  className={`overflow-hidden transition-all duration-300 ${
                    isApproving ? "opacity-60 scale-[0.99]" : "hover:shadow-md"
                  }`}
                >
                  <CardContent className="p-5 space-y-5">

                    {/* ── Date · Amount · Type ── */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="text-sm text-muted-foreground">
                        {formatDate(tx.date)}
                      </span>
                      <span
                        className={`text-xl font-bold tabular-nums ${
                          tx.type === "income" ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {tx.type === "income" ? "+" : "−"}{formatCurrency(tx.amount)}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] uppercase tracking-wider ${
                          tx.type === "income"
                            ? "border-emerald-500/30 text-emerald-500"
                            : "border-rose-500/30 text-rose-500"
                        }`}
                      >
                        {tx.type}
                      </Badge>
                    </div>

                    {/* ── Raw bank text — subtle hint ── */}
                    <p
                      className="text-xs font-mono text-muted-foreground/50 truncate -mt-2"
                      title={tx.description}
                    >
                      <span className="not-italic font-sans text-muted-foreground/40 uppercase tracking-widest text-[10px] mr-2">
                        bank:
                      </span>
                      {tx.description}
                    </p>

                    {/* ── Category dropdown (AI-suggested, user-correctable) ── */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                        Category
                        <span className="text-[10px] text-primary/60 font-normal">
                          ✦ AI suggested — correct if needed
                        </span>
                      </Label>
                      <Select
                        value={state.category}
                        onValueChange={(val) => patchCard(tx.id, { category: val })}
                        disabled={isApproving}
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((cat) => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* ── Description input — the hero field ── */}
                    <div className="space-y-1.5">
                      <Label htmlFor={`desc-${tx.id}`} className="text-sm font-semibold">
                        What was this for?
                        <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                          (Add Description)
                        </span>
                      </Label>
                      <Input
                        id={`desc-${tx.id}`}
                        className="h-10 text-sm"
                        placeholder="e.g. Team lunch, Netflix monthly plan, Office supplies…"
                        value={state.description}
                        onChange={(e) => patchCard(tx.id, { description: e.target.value })}
                        disabled={isApproving}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !isApproving) handleApprove(tx);
                        }}
                        autoComplete="off"
                      />
                    </div>

                    {/* ── Approve button ── */}
                    <div className="flex justify-end pt-1">
                      <Button
                        className="gap-2 min-w-[110px]"
                        disabled={isApproving || approvingId !== null}
                        onClick={() => handleApprove(tx)}
                      >
                        {isApproving ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Approving…
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-4 w-4" />
                            Approve
                          </>
                        )}
                      </Button>
                    </div>

                  </CardContent>
                </Card>
              );
            })}

            {/* ── Approve-all shortcut ── */}
            {transactions.length > 2 && (
              <div className="flex justify-end pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={approvingId !== null}
                  onClick={() => {
                    for (const tx of [...transactions]) {
                      // Fire all approvals in parallel without awaiting
                      handleApprove(tx);
                    }
                  }}
                >
                  <CheckCheck className="h-4 w-4 mr-1.5" />
                  Approve all as-is
                </Button>
              </div>
            )}
          </div>
        )}

      </div>
    </Layout>
  );
}
