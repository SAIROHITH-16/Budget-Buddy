// src/hooks/useTransactions.ts
// Full manual implementation of the transactions data hook.
// No Supabase. No template. Uses Axios (api.ts) against the Express backend.
//
// The Axios instance in api.ts automatically attaches the Firebase ID token
// as `Authorization: Bearer <token>` on every request — no manual token
// handling needed here.
//
// Provides:
//   transactions      – array of Transaction objects for the current user
//   loading           – true while any async operation is in flight
//   error             – string message if the last operation failed, else null
//   addTransaction    – POST a new transaction
//   updateTransaction – PUT an existing transaction by id
//   deleteTransaction – DELETE a transaction by id

import { useState, useCallback, useEffect } from "react";
import api from "@/api";
import type { Transaction } from "@/utils/calculations";

// ---------------------------------------------------------------------------
// Shape of what the Express API returns for a single transaction
// ---------------------------------------------------------------------------
interface RawTransaction {
  _id: string;         // MongoDB ObjectId string
  type: "income" | "expense";
  amount: number;
  category: string;
  description: string;
  date: string;        // ISO date string from MongoDB
}

// ---------------------------------------------------------------------------
// Map a raw API response object to the app's internal Transaction type
// ---------------------------------------------------------------------------
function mapRawToTransaction(raw: RawTransaction): Transaction {
  return {
    id: raw._id,
    type: raw.type,
    amount: Number(raw.amount),
    category: raw.category,
    description: raw.description,
    date: raw.date,
  };
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Paginated response envelope from GET /api/transactions
// ---------------------------------------------------------------------------
interface TransactionsPage {
  data:         RawTransaction[];
  totalRecords: number;
  totalPages:   number;
  currentPage:  number;
}

// ---------------------------------------------------------------------------
// Filter / pagination params accepted by the hook
// ---------------------------------------------------------------------------
export interface TransactionFilters {
  page?:      number;
  limit?:     number;
  search?:    string;
  category?:  string;
  type?:      "income" | "expense" | "";
  startDate?: string;
  endDate?:   string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export interface UseTransactionsOptions {
  /** Override the page-size used for the initial auto-fetch on mount.
   *  Pass a high number (e.g. 10_000) to load all records at once for
   *  total / summary calculations (e.g. the Dashboard). */
  initialLimit?: number;
}

export function useTransactions(options: UseTransactionsOptions = {}) {
  const { initialLimit } = options;
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalRecords, setTotalRecords] = useState<number>(0);
  const [totalPages,   setTotalPages]   = useState<number>(1);
  const [currentPage,  setCurrentPage]  = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [error,   setError]   = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // FETCH transactions — supports pagination, search, and filters
  // GET /api/transactions?page=1&limit=20&search=...&category=...&type=...&startDate=...&endDate=...
  // -------------------------------------------------------------------------
  const fetchTransactions = useCallback(async (filters: TransactionFilters = {}): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      // Build query string from provided filters (omit empty values)
      const params = new URLSearchParams();
      if (filters.page)      params.set("page",      String(filters.page));
      if (filters.limit)     params.set("limit",     String(filters.limit));
      if (filters.search)    params.set("search",    filters.search);
      if (filters.category)  params.set("category",  filters.category);
      if (filters.type)      params.set("type",      filters.type);
      if (filters.startDate) params.set("startDate", filters.startDate);
      if (filters.endDate)   params.set("endDate",   filters.endDate);

      const qs = params.toString();
      const response = await api.get<TransactionsPage>(`/transactions${qs ? `?${qs}` : ""}`);

      const mapped = response.data.data.map(mapRawToTransaction);
      setTransactions(mapped);
      setTotalRecords(response.data.totalRecords);
      setTotalPages(response.data.totalPages);
      setCurrentPage(response.data.currentPage);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } }; message?: string })
          ?.response?.data?.message ??
        (e as { message?: string })?.message ??
        "Failed to fetch transactions.";
      console.error(
        "[useTransactions] fetch failed:",
        (e as { response?: { data?: unknown } })?.response?.data ?? (e as Error)?.message ?? e
      );
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount — use initialLimit when provided so callers that need
  // full-dataset totals (e.g. Dashboard) can request all records at once.
  useEffect(() => {
    fetchTransactions(initialLimit ? { limit: initialLimit } : {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchTransactions]);

  // -------------------------------------------------------------------------
  // ADD a new transaction
  // POST /api/transactions
  // Body: { type, amount, category, description, date }
  // The server attaches the user's uid automatically from the verified JWT.
  // -------------------------------------------------------------------------
  const addTransaction = useCallback(
    async (data: Omit<Transaction, "id">): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.post<RawTransaction>("/transactions", {
          type: data.type,
          amount: data.amount,
          category: data.category || "Uncategorized",
          description: data.description,
          date: data.date,
        });
        const newTx = mapRawToTransaction(response.data);
        // Prepend to list so the newest transaction appears at the top
        setTransactions((prev) => [newTx, ...prev]);
      } catch (e: unknown) {
        const msg =
          (e as { response?: { data?: { message?: string } }; message?: string })
            ?.response?.data?.message ??
          (e as { message?: string })?.message ??
          "Failed to add transaction.";
        setError(msg);
        // The save may have succeeded on the server even if the client timed out.
        // Refetch so the transaction appears in the list if it was persisted.
        fetchTransactions().catch(() => {/* ignore secondary fetch error */});
        throw e; // re-throw so the form can show feedback
      } finally {
        setLoading(false);
      }
    },
    [fetchTransactions]
  );

  // -------------------------------------------------------------------------
  // UPDATE an existing transaction — optimistic update
  // Applies the change to the UI immediately; reverts if the server rejects it.
  // PUT /api/transactions/:id
  // -------------------------------------------------------------------------
  const updateTransaction = useCallback(
    async (id: string, data: Omit<Transaction, "id">): Promise<void> => {
      setError(null);
      // Snapshot current list for rollback
      let previous: Transaction[] = [];
      // Apply optimistically
      setTransactions((prev) => {
        previous = prev;
        return prev.map((t) =>
          t.id === id ? { ...t, ...data } : t
        );
      });
      try {
        const response = await api.put<RawTransaction>(`/transactions/${id}`, {
          type: data.type,
          amount: data.amount,
          category: data.category,
          description: data.description,
          date: data.date,
        });
        // Reconcile with server's canonical response
        const updated = mapRawToTransaction(response.data);
        setTransactions((prev) =>
          prev.map((t) => (t.id === id ? updated : t))
        );
      } catch (e: unknown) {
        // Revert on failure
        setTransactions(previous);
        const msg =
          (e as { response?: { data?: { message?: string } }; message?: string })
            ?.response?.data?.message ??
          (e as { message?: string })?.message ??
          "Failed to update transaction.";
        setError(msg);
        throw e;
      }
    },
    []
  );

  // -------------------------------------------------------------------------
  // DELETE a transaction — optimistic delete
  // Removes the item from the UI immediately; restores it if the server fails.
  // DELETE /api/transactions/:id
  // -------------------------------------------------------------------------
  const deleteTransaction = useCallback(async (id: string): Promise<void> => {
    setError(null);
    // Snapshot for rollback
    let previous: Transaction[] = [];
    // Remove optimistically — instant UI update, no spinner
    setTransactions((prev) => {
      previous = prev;
      return prev.filter((t) => t.id !== id);
    });
    try {
      await api.delete(`/transactions/${id}`);
    } catch (e: unknown) {
      // Restore the deleted item on failure
      setTransactions(previous);
      const msg =
        (e as { response?: { data?: { message?: string } }; message?: string })
          ?.response?.data?.message ??
        (e as { message?: string })?.message ??
        "Failed to delete transaction.";
      setError(msg);
      throw e;
    }
  }, []);

  return {
    transactions,
    totalRecords,
    totalPages,
    currentPage,
    loading,
    error,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    refetch: fetchTransactions,
  };
}
