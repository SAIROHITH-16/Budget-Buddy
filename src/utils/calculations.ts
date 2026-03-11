export interface Transaction {
  id: string;
  type: "income" | "expense" | "lent" | "repaid";
  amount: number;
  category: string;
  description: string;
  date: string;
  // Loan-specific fields (only present when type === "lent" or "repaid")
  borrowerName?: string;
  dueDate?: string;
  repaidAmount?: number;
  remainingAmount?: number;
  loanStatus?: "PENDING" | "PARTIALLY_REPAID" | "FULLY_REPAID" | "OVERDUE" | "WRITTEN_OFF";
}

/**
 * Safely coerces a transaction amount to a finite, non-negative float.
 * Strips commas and currency symbols that an AI parser may have left behind.
 * Returns 0 for anything that cannot be parsed (NaN, Infinity, negative).
 */
function safeAmount(t: Transaction): number {
  const n = parseFloat(String(t.amount).replace(/,/g, "").replace(/[^0-9.]/g, ""));
  return isFinite(n) && n > 0 ? n : 0;
}

export function calculateTotalIncome(transactions: Transaction[]): number {
  return transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + safeAmount(t), 0);
}

export function calculateTotalExpense(transactions: Transaction[]): number {
  return transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + safeAmount(t), 0);
}

export function calculateBalance(transactions: Transaction[]): number {
  return calculateTotalIncome(transactions) - calculateTotalExpense(transactions);
}

/** Sum of all LENT transactions (money given out to friends). */
export function calculateTotalLent(transactions: Transaction[]): number {
  return transactions
    .filter((t) => t.type === "lent")
    .reduce((sum, t) => sum + safeAmount(t), 0);
}

/** Sum of all REPAID transactions (money returned by friends). */
export function calculateTotalRepaid(transactions: Transaction[]): number {
  return transactions
    .filter((t) => t.type === "repaid")
    .reduce((sum, t) => sum + safeAmount(t), 0);
}

/**
 * True wallet balance including lending activity:
 *   (income + repaid) − (expense + lent)
 */
export function calculateWalletBalance(transactions: Transaction[]): number {
  const income  = calculateTotalIncome(transactions);
  const expense = calculateTotalExpense(transactions);
  const lent    = calculateTotalLent(transactions);
  const repaid  = calculateTotalRepaid(transactions);
  return (income + repaid) - (expense + lent);
}

export function getCategoryDistribution(transactions: Transaction[]) {
  const map: Record<string, number> = {};
  transactions.forEach((t) => {
    map[t.category] = (map[t.category] || 0) + safeAmount(t);
  });
  return Object.entries(map).map(([name, value]) => ({ name, value }));
}

export function getIncomeVsExpense(transactions: Transaction[]) {
  return [
    { name: "Income", value: calculateTotalIncome(transactions) },
    { name: "Expense", value: calculateTotalExpense(transactions) },
  ];
}

export function getIncomeExpenseTrend(transactions: Transaction[]) {
  const map: Record<string, { Income: number; Expense: number }> = {};
  
  transactions.forEach((t) => {
    const month = new Date(t.date).toLocaleString("default", {
      month: "short",
      year: "2-digit",
    });
    
    if (!map[month]) {
      map[month] = { Income: 0, Expense: 0 };
    }
    
    if (t.type === "income") {
      map[month].Income += safeAmount(t);
    } else {
      map[month].Expense += safeAmount(t);
    }
  });
  
  return Object.entries(map)
    .map(([name, values]) => ({ name, ...values }))
    .sort((a, b) => {
      const parseDate = (s: string) => new Date(`01 ${s}`);
      return parseDate(a.name).getTime() - parseDate(b.name).getTime();
    });
}

export function getDailyIncomeExpenseTrend(transactions: Transaction[]) {
  const map: Record<string, { Income: number; Expense: number }> = {};
  
  transactions.forEach((t) => {
    const date = new Date(t.date);
    const key = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    
    if (!map[key]) {
      map[key] = { Income: 0, Expense: 0 };
    }
    
    if (t.type === "income") {
      map[key].Income += safeAmount(t);
    } else {
      map[key].Expense += safeAmount(t);
    }
  });
  
  return Object.entries(map)
    .map(([name, values]) => ({ name, ...values }))
    .sort((a, b) => {
      // Parse dates like "Jan 15", "Feb 3" for sorting
      const parseDate = (s: string) => {
        const [month, day] = s.split(" ");
        const currentYear = new Date().getFullYear();
        return new Date(`${month} ${day}, ${currentYear}`).getTime();
      };
      return parseDate(a.name) - parseDate(b.name);
    });
}

export function getMonthlySpending(transactions: Transaction[]) {
  const map: Record<string, number> = {};
  transactions
    .filter((t) => t.type === "expense")
    .forEach((t) => {
      const month = new Date(t.date).toLocaleString("default", {
        month: "short",
        year: "2-digit",
      });
      map[month] = (map[month] || 0) + safeAmount(t);
    });
  return Object.entries(map)
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => {
      // Sort chronologically
      const parseDate = (s: string) => new Date(`01 ${s}`);
      return parseDate(a.month).getTime() - parseDate(b.month).getTime();
    });
}

export function formatCurrency(amount: number): string {
  const currency = localStorage.getItem("preferredCurrency") || "USD";
  const locale   = currency === "INR" ? "en-IN" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency,
  }).format(amount);
}

export function getCurrencySymbol(): string {
  const CURRENCY_SYMBOLS: Record<string, string> = {
    USD: "$", EUR: "€", GBP: "£", JPY: "¥", CNY: "¥", INR: "₹",
    AUD: "A$", CAD: "C$", CHF: "CHF", SEK: "kr", NZD: "NZ$", KRW: "₩",
    SGD: "S$", HKD: "HK$", MXN: "Mex$", BRL: "R$", ZAR: "R", RUB: "₽",
    TRY: "₺", AED: "د.إ"
  };
  const currency = localStorage.getItem("preferredCurrency") || "USD";
  return CURRENCY_SYMBOLS[currency] || "$";
}

// ---------------------------------------------------------------------------
// Date grouping utilities
// ---------------------------------------------------------------------------

export interface TransactionGroup {
  dateKey:      string;        // YYYY-MM-DD — canonical sort key
  label:        string;        // "Today" | "Yesterday" | "February 23, 2026"
  transactions: Transaction[];
}

/** Returns the current local date as YYYY-MM-DD (no timezone shift). */
function localTodayKey(): string {
  const n = new Date();
  return [
    n.getFullYear(),
    String(n.getMonth() + 1).padStart(2, "0"),
    String(n.getDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * Formats a YYYY-MM-DD key as a human-readable header label.
 * Returns "Today", "Yesterday", or a long-form date like "February 23, 2026".
 * Uses native Intl.DateTimeFormat — no external library needed.
 */
export function formatDateHeader(dateKey: string): string {
  const today = localTodayKey();
  if (dateKey === today) return "Today";

  const [ty, tm, td] = today.split("-").map(Number);
  const yest = new Date(ty, tm - 1, td - 1);
  const yesterdayKey = [
    yest.getFullYear(),
    String(yest.getMonth() + 1).padStart(2, "0"),
    String(yest.getDate()).padStart(2, "0"),
  ].join("-");
  if (dateKey === yesterdayKey) return "Yesterday";

  // Parse as local date (avoid UTC-midnight timezone shift)
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day:   "numeric",
    year:  "numeric",
  }).format(new Date(y, m - 1, d));
}

/**
 * Groups a flat Transaction[] by date, sorted ascending so the oldest date
 * appears first and "Today" (the most recent) appears last — matching a
 * chronological feed where you scroll down to reach the present.
 *
 * YYYY-MM-DD strings sort lexicographically = chronologically, so no Date
 * parsing is needed for the sort step.
 */
export function groupTransactionsByDate(transactions: Transaction[]): TransactionGroup[] {
  const map = new Map<string, Transaction[]>();

  for (const tx of transactions) {
    const key = tx.date.slice(0, 10);   // handles both "YYYY-MM-DD" and ISO strings
    const bucket = map.get(key);
    if (bucket) bucket.push(tx);
    else map.set(key, [tx]);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))   // ascending: older → newer
    .map(([dateKey, txns]) => ({
      dateKey,
      label:        formatDateHeader(dateKey),
      transactions: txns,
    }));
}
