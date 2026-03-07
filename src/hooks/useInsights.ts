import { useState, useCallback } from "react";
import api from "@/api";
import type { Transaction } from "@/utils/calculations";

export interface InsightsData {
  summary: string;
  top_categories: { name: string; amount: number }[];
  saving_suggestions: string[];
  month_comparison: {
    current_expense: number;
    previous_expense: number;
    change_percent: number;
    direction: "up" | "down" | "same";
  } | null;
}

export function useInsights() {
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInsights = useCallback(async (month: string, transactions: Transaction[]) => {
    setLoading(true);
    setError(null);
    setInsights(null);   // clear stale data immediately so previous month never bleeds through
    try {
      const response = await api.post<InsightsData & { noData?: boolean; message?: string; error?: string }>(
        "/insights/analyze",
        { month, transactions },
        { timeout: 100_000 }   // AI analysis can take up to ~60 s on cold Render instances
      );
      const data = response.data;

      // Server returns noData:true when the month has zero transactions
      if (data.noData) {
        setInsights(null);
        setError(data.message ?? "No transactions found for this month");
        return;
      }

      if (data.error) {
        setError(data.error);
        setInsights(null);
        return;
      }

      setInsights({
        summary: data.summary,
        top_categories: Array.isArray(data.top_categories) ? data.top_categories : [],
        saving_suggestions: Array.isArray(data.saving_suggestions) ? data.saving_suggestions : [],
        month_comparison: data.month_comparison ?? null,
      });
    } catch (e: any) {
      console.error("Insights error:", e);
      const msg: string =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
        "Failed to fetch insights";
      setError(msg);
      setInsights(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearInsights = useCallback(() => {
    setInsights(null);
    setError(null);
  }, []);

  return { insights, loading, error, fetchInsights, clearInsights };
}
