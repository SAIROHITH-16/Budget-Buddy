import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PendingTransaction {
  id:               string;
  type:             "income" | "expense";
  amount:           number;
  category:         string;
  description:      string;
  date:             string;   // YYYY-MM-DD
  bankReferenceId?: string;
  needsReview:      boolean;
}

// ---------------------------------------------------------------------------
// Shared query key — used by both the ReviewQueue page and the Sidebar badge
// so React Query deduplicates the network request automatically.
// ---------------------------------------------------------------------------
export const PENDING_QUERY_KEY = ["transactions", "pending"] as const;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function usePendingTransactions() {
  return useQuery({
    queryKey: PENDING_QUERY_KEY,
    queryFn: async () => {
      const { data } = await api.get<any[]>("/transactions/pending");
      return data.map((t) => ({ ...t, id: t._id || t.id })) as PendingTransaction[];
    },
    // Treat the list as fresh for 60 s — prevents the Sidebar from refetching
    // on every page navigation while still picking up newly imported batches.
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// Convenience: invalidate the pending query from anywhere
// ---------------------------------------------------------------------------
export function useInvalidatePending() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: PENDING_QUERY_KEY });
}
