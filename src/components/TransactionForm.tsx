import { useState, useEffect } from "react";
import { z } from "zod";
import { Sparkles, Loader2 } from "lucide-react";
import type { Transaction } from "@/utils/calculations";
import { getCurrencySymbol } from "@/utils/calculations";
import { supabase } from "@/integrations/supabase/client";
import api from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CATEGORIES = ["Uncategorized", "Salary", "Freelance", "Rent", "Groceries", "Utilities", "Transport", "Entertainment", "Health", "Other"];

const schema = z.object({
  type: z.enum(["income", "expense"]),
  amount: z.number().positive("Amount must be positive"),
  category: z.string().min(1, "Category is required"),
  description: z.string().trim().min(1, "Description is required").max(200),
  date: z.string().min(1, "Date is required"),
});

interface TransactionFormProps {
  onSubmit: (data: Omit<Transaction, "id">) => void;
}

export function TransactionForm({ onSubmit }: TransactionFormProps) {
  const [currencySymbol, setCurrencySymbol] = useState(getCurrencySymbol());
  const [form, setForm] = useState({
    type: "expense" as "income" | "expense",
    amount: "",
    category: "",
    description: "",
    date: new Date().toISOString().split("T")[0],
  });

  useEffect(() => {
    const handleCurrencyChange = () => setCurrencySymbol(getCurrencySymbol());
    window.addEventListener("currencyChange", handleCurrencyChange);
    return () => window.removeEventListener("currencyChange", handleCurrencyChange);
  }, []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [categorizing, setCategorizing] = useState(false);

  const autoCategorize = async () => {
    if (!form.description.trim()) return;
    setCategorizing(true);
    try {
      let category: string | undefined;

      // Primary: Supabase Edge Function
      const { data: edgeData, error: edgeError } = await supabase.functions.invoke<{ category: string }>(
        "categorize",
        { body: { description: form.description.trim() } }
      );

      if (edgeError || !edgeData?.category) {
        // Fallback: Express backend
        const { data } = await api.post<{ category: string }>("/insights/categorize", {
          description: form.description.trim(),
        });
        category = data?.category;
      } else {
        category = edgeData.category;
      }

      if (category) {
        setForm((f) => ({ ...f, category }));
        setErrors((e) => ({ ...e, category: "" }));
      }
    } catch {
      // silently fail — user can pick manually
    } finally {
      setCategorizing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ ...form, amount: Number(form.amount) });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }
    onSubmit(parsed.data as Omit<Transaction, "id">);
    setForm({ type: "expense", amount: "", category: "", description: "", date: new Date().toISOString().split("T")[0] });
    setErrors({});
  };

  return (
    <form onSubmit={handleSubmit} className="glass-card p-5 space-y-4">
      <h3 className="text-lg font-semibold">Add Transaction</h3>

      <div className="flex gap-2">
        {(["income", "expense"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setForm((f) => ({ ...f, type: t }))}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium capitalize transition-colors ${
              form.type === t
                ? t === "income"
                  ? "bg-income/20 income-text border border-income/30"
                  : "bg-expense/20 expense-text border border-expense/30"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="amount">Amount ({currencySymbol})</Label>
          <Input
            id="amount"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
          />
          {errors.amount && <p className="text-xs expense-text mt-1">{errors.amount}</p>}
        </div>
        <div>
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            type="date"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
          />
          {errors.date && <p className="text-xs expense-text mt-1">{errors.date}</p>}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <Label htmlFor="category">Category</Label>
          <button
            type="button"
            onClick={autoCategorize}
            disabled={!form.description.trim() || categorizing}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {categorizing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            Auto
          </button>
        </div>
        <select
          id="category"
          value={form.category}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Select category</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        {errors.category && <p className="text-xs expense-text mt-1">{errors.category}</p>}
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          placeholder="What was this for?"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          maxLength={200}
        />
        {errors.description && <p className="text-xs expense-text mt-1">{errors.description}</p>}
      </div>

      <Button type="submit" className="w-full">
        Add Transaction
      </Button>
    </form>
  );
}
