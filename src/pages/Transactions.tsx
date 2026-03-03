import { useState, useEffect, useCallback, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/Layout";
import { TransactionForm } from "@/components/TransactionForm";
import { TransactionEditModal } from "@/components/TransactionEditModal";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { CsvImporter } from "@/components/CsvImporter";
import { CurrencySetupDialog } from "@/components/CurrencySetupDialog";
import { useTransactions, type TransactionFilters } from "@/hooks/useTransactions";
import { formatCurrency, groupTransactionsByDate } from "@/utils/calculations";
import type { Transaction } from "@/utils/calculations";
import {
  Pencil, Trash2, ArrowUpRight, ArrowDownRight, Receipt,
  Search, ChevronLeft, ChevronRight, X, CalendarIcon, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const CATEGORIES = [
  "Uncategorized", "Salary", "Freelance", "Rent", "Groceries",
  "Utilities", "Transport", "Entertainment", "Health", "Other",
];

const PAGE_SIZE = 10;

const Transactions = () => {
  const {
    transactions, loading, error,
    totalRecords, totalPages, currentPage,
    addTransaction, updateTransaction, deleteTransaction, refetch,
  } = useTransactions();

  const { toast } = useToast();

  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [deleteTxId, setDeleteTxId] = useState<string | null>(null);
  const [showCsvImporter, setShowCsvImporter] = useState(false);
  const [, setCurrencyUpdate] = useState(0);

  // Date-picker popover open state
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen,   setEndOpen]   = useState(false);

  // Listen for currency changes to trigger re-render
  useEffect(() => {
    const handleCurrencyChange = () => setCurrencyUpdate(prev => prev + 1);
    window.addEventListener("currencyChange", handleCurrencyChange);
    return () => window.removeEventListener("currencyChange", handleCurrencyChange);
  }, []);

  // Helper: "Jan 1, 2026"
  const fmtDate = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  // Filter state
  const [search, setSearch]       = useState("");
  const [category, setCategory]   = useState("");
  const [type, setType]           = useState<"" | "income" | "expense">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate]     = useState("");
  const [page, setPage]           = useState(1);

  // Build and fire query whenever filters/page change (debounce search)
  const buildFilters = useCallback(
    (overrides?: Partial<TransactionFilters>): TransactionFilters => ({
      page, limit: PAGE_SIZE, search, category, type, startDate, endDate,
      ...overrides,
    }),
    [page, search, category, type, startDate, endDate]
  );

  // Debounce text search
  useEffect(() => {
    const id = setTimeout(() => {
      setPage(1);
      refetch(buildFilters({ page: 1, search }));
    }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Instant re-fetch for dropdown / date / page changes
  useEffect(() => {
    refetch(buildFilters({ page }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, type, startDate, endDate, page]);

  const clearFilters = () => {
    setSearch(""); setCategory(""); setType(""); setStartDate(""); setEndDate(""); setPage(1);
  };

  const hasActiveFilters = search || category || type || startDate || endDate;

  const grouped = useMemo(() => groupTransactionsByDate(transactions), [transactions]);

  // Pagination helpers
  const goTo = (p: number) => setPage(Math.max(1, Math.min(p, totalPages || 1)));

  return (
    <Layout>
      <CurrencySetupDialog />
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Transactions</h2>
            <p className="text-sm text-muted-foreground mt-1">Manage your income and expenses</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowCsvImporter(true)} className="shrink-0">
            <Upload className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
        </div>

        {/* CSV Importer Dialog */}
        <Dialog open={showCsvImporter} onOpenChange={setShowCsvImporter}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Import Transactions from CSV</DialogTitle>
              <DialogDescription>Upload a CSV file to bulk-import transactions into your account.</DialogDescription>
            </DialogHeader>
            <CsvImporter
              onComplete={() => {
                // Refresh the list after the importer posts to /transactions/import
                refetch(buildFilters({ page: 1 }));
                setPage(1);
              }}
              onClose={() => setShowCsvImporter(false)}
            />
          </DialogContent>
        </Dialog>

        {error && (
          <div className="glass-card p-4 border-destructive/30">
            <p className="text-sm expense-text">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Add transaction form */}
          <div className="lg:col-span-1">
            <TransactionForm onSubmit={async (data) => { await addTransaction(data); setPage(1); refetch(buildFilters({ page: 1 })); }} />
          </div>

          {/* Transaction list */}
          <div className="lg:col-span-2 space-y-4">
            {/* Filter bar */}
            <div className="glass-card p-4 space-y-3">
              {/* Row 1: search + type */}
              <div className="flex gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[160px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="tx-search"
                    name="tx-search"
                    placeholder="Search description…"
                    className="pl-8 h-9 text-sm"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                <Select
                  value={type || "_all"}
                  onValueChange={(v) => { setType(v === "_all" ? "" : v as "income" | "expense"); setPage(1); }}
                >
                  <SelectTrigger className="h-9 w-[130px] text-sm">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All types</SelectItem>
                    <SelectItem value="income">Income</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={category || "_all"}
                  onValueChange={(v) => { setCategory(v === "_all" ? "" : v); setPage(1); }}
                >
                  <SelectTrigger className="h-9 w-[160px] text-sm">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All categories</SelectItem>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Row 2: date range + clear */}
              <div className="flex gap-2 flex-wrap items-center">
                {/* Start date picker */}
                <Popover open={startOpen} onOpenChange={setStartOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={`h-9 w-[160px] justify-start gap-2 text-sm font-normal ${
                        !startDate && "text-muted-foreground"
                      }`}
                    >
                      <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
                      {startDate ? fmtDate(startDate) : "From date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate ? new Date(startDate + "T00:00:00") : undefined}
                      onSelect={(d) => {
                        setStartDate(d ? d.toISOString().split("T")[0] : "");
                        setPage(1);
                        setStartOpen(false);
                      }}
                      disabled={(d) => (endDate ? d > new Date(endDate + "T00:00:00") : false)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>

                {/* End date picker */}
                <Popover open={endOpen} onOpenChange={setEndOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={`h-9 w-[160px] justify-start gap-2 text-sm font-normal ${
                        !endDate && "text-muted-foreground"
                      }`}
                    >
                      <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
                      {endDate ? fmtDate(endDate) : "To date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate ? new Date(endDate + "T00:00:00") : undefined}
                      onSelect={(d) => {
                        setEndDate(d ? d.toISOString().split("T")[0] : "");
                        setPage(1);
                        setEndOpen(false);
                      }}
                      disabled={(d) => (startDate ? d < new Date(startDate + "T00:00:00") : false)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>

                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" className="h-9 gap-1 text-muted-foreground" onClick={clearFilters}>
                    <X className="h-3.5 w-3.5" />
                    Clear
                  </Button>
                )}

                {!loading && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {totalRecords} result{totalRecords !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>

            {/* List */}
            {loading && (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="glass-card p-4 h-16 animate-pulse bg-muted/30 rounded-lg" />
                ))}
              </div>
            )}

            {!loading && transactions.length === 0 && (
              <div className="glass-card p-12 flex flex-col items-center justify-center text-center">
                <Receipt className="h-12 w-12 text-muted-foreground/40 mb-4" />
                <p className="text-lg font-medium text-muted-foreground">
                  {hasActiveFilters ? "No matching transactions" : "No transactions yet"}
                </p>
                <p className="text-sm text-muted-foreground/60 mt-1">
                  {hasActiveFilters ? "Try adjusting your filters" : "Add your first transaction to get started"}
                </p>
              </div>
            )}

            {!loading && grouped.map((group) => (
              <div key={group.dateKey} className="space-y-2">
                {/* Date section header */}
                <div className="sticky top-0 z-10 -mx-1 px-1 py-1.5 bg-background/80 backdrop-blur-sm">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {group.label}
                    </span>
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground/60">
                      {group.transactions.length} transaction{group.transactions.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>

                {/* Transaction cards for this date */}
                {group.transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="glass-card p-4 flex items-center gap-4 hover:border-primary/20 transition-colors animate-fade-in"
                  >
                    <div className={`p-2 rounded-lg ${tx.type === "income" ? "income-bg" : "expense-bg"}`}>
                      {tx.type === "income"
                        ? <ArrowUpRight className="h-5 w-5 income-text" />
                        : <ArrowDownRight className="h-5 w-5 expense-text" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{tx.description}</p>
                      <p className="text-xs text-muted-foreground">{tx.category}</p>
                    </div>

                    <p className={`font-mono font-semibold text-sm ${tx.type === "income" ? "income-text" : "expense-text"}`}>
                      {tx.type === "income" ? "+" : "-"}{formatCurrency(tx.amount)}
                    </p>

                    <div className="flex gap-1">
                      <Button
                        variant="ghost" size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => setEditTx(tx)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTxId(tx.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {/* Pagination */}
            {!loading && totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <Button
                  variant="outline" size="icon" className="h-8 w-8"
                  disabled={currentPage <= 1}
                  onClick={() => goTo(currentPage - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                  .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("…");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((item, idx) =>
                    item === "…" ? (
                      <span key={`ellipsis-${idx}`} className="text-muted-foreground px-1 text-sm">…</span>
                    ) : (
                      <Button
                        key={item}
                        variant={item === currentPage ? "default" : "outline"}
                        size="icon" className="h-8 w-8 text-xs"
                        onClick={() => goTo(item as number)}
                      >
                        {item}
                      </Button>
                    )
                  )}

                <Button
                  variant="outline" size="icon" className="h-8 w-8"
                  disabled={currentPage >= (totalPages || 1)}
                  onClick={() => goTo(currentPage + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <TransactionEditModal
        transaction={editTx}
        open={!!editTx}
        onClose={() => setEditTx(null)}
        onSave={updateTransaction}
      />

      <DeleteConfirmDialog
        open={!!deleteTxId}
        onClose={() => setDeleteTxId(null)}
        onConfirm={async () => {
          const idToDelete = deleteTxId;
          setDeleteTxId(null); // close dialog immediately
          if (!idToDelete) return;
          try {
            await deleteTransaction(idToDelete);
            toast({ title: "Transaction deleted", description: "The transaction was removed successfully." });
          } catch {
            toast({
              title: "Delete failed",
              description: "Could not delete the transaction. Please try again.",
              variant: "destructive",
            });
          }
        }}
      />
    </Layout>
  );
};

export default Transactions;
