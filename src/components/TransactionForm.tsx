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
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel,
  SelectSeparator, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const CATEGORIES = ["Uncategorized", "Salary", "Freelance", "Rent", "Groceries", "Utilities", "Transport", "Entertainment", "Health", "Other"];

// Base schema for income / expense
const baseSchema = z.object({
  type:        z.enum(["income", "expense", "lent", "repaid"]),
  amount:      z.number().positive("Amount must be positive"),
  category:    z.string().min(1, "Category is required"),
  description: z.string().trim().min(1, "Description is required").max(200),
  date:        z.string().min(1, "Date is required"),
});

// Extended schema for loan transactions — category is auto-set, description optional
const loanSchema = z.object({
  type:         z.enum(["income", "expense", "lent", "repaid"]),
  amount:       z.number().positive("Amount must be positive"),
  category:     z.string().optional().default("Loan"),
  description:  z.string().trim().max(200).optional().default(""),
  date:         z.string().min(1, "Date is required"),
  borrowerName: z.string().trim().min(1, "Friend's name is required"),
  dueDate:      z.string().min(1, "Expected return date is required"),
});

interface TransactionFormProps {
  onSubmit: (data: Omit<Transaction, "id">) => void;
}

export function TransactionForm({ onSubmit }: TransactionFormProps) {
  const [currencySymbol, setCurrencySymbol] = useState(getCurrencySymbol());
  const [form, setForm] = useState({
    type: "expense" as "income" | "expense" | "lent" | "repaid",
    amount: "",
    category: "",
    description: "",
    date: new Date().toISOString().split("T")[0],
    borrowerName: "",
    dueDate: "",
  });

  useEffect(() => {
    const handleCurrencyChange = () => setCurrencySymbol(getCurrencySymbol());
    window.addEventListener("currencyChange", handleCurrencyChange);
    return () => window.removeEventListener("currencyChange", handleCurrencyChange);
  }, []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [categorizing, setCategorizing] = useState(false);

  // Derived — no separate state needed
  const isLoan = form.type === "lent" || form.type === "repaid";

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

    // Pick the right schema based on whether this is a loan
    const schema = isLoan ? loanSchema : baseSchema;

    const parsed = schema.safeParse({ ...form, amount: Number(form.amount) });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }
    // For loans: inject the auto-set category before passing upstream
    const payload = isLoan
      ? { ...parsed.data, category: "Loan", description: parsed.data.description || "Loan" }
      : parsed.data;
    onSubmit(payload as Omit<Transaction, "id">);
    setForm({
      type: "expense",
      amount: "",
      category: "",
      description: "",
      date: new Date().toISOString().split("T")[0],
      borrowerName: "",
      dueDate: "",
    });
    setErrors({});
  };

  return (
    <form onSubmit={handleSubmit} className="glass-card p-5 space-y-4">
      <h3 className="text-lg font-semibold">Add Transaction</h3>

      {/* ---- Transaction type selector ---- */}
      <div>
        <Label htmlFor="tx-type">Type</Label>
        <Select
          value={form.type}
          onValueChange={(v) => {
            const t = v as typeof form.type;
            setForm((f) => ({
              ...f,
              type: t,
              ...(t === "lent" || t === "repaid"
                ? { category: "Loan", borrowerName: "", dueDate: "" }
                : { borrowerName: "", dueDate: "" }
              ),
            }));
            setErrors({});
          }}
        >
          <SelectTrigger id="tx-type" className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Standard</SelectLabel>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Lending</SelectLabel>
              <SelectItem value="lent">Money Lent</SelectItem>
              <SelectItem value="repaid">Repayment Received</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
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

      {/* ---- Category (hidden for loans — auto-set to "Loan") ---- */}
      {!isLoan && (
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
      )}

      <div>
        <Label htmlFor="description">
          {isLoan ? "Reason for loan" : "Description"}
          {isLoan && <span className="ml-1 text-xs text-muted-foreground font-normal">(optional)</span>}
        </Label>
        <Input
          id="description"
          placeholder={isLoan ? "e.g., Reason for loan (optional)" : "What was this for?"}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          maxLength={200}
        />
        {errors.description && <p className="text-xs expense-text mt-1">{errors.description}</p>}
      </div>

      <Button type="submit" className="w-full">
        {isLoan ? "Record Loan" : "Add Transaction"}
      </Button>

      {/* ---- Loan-specific fields ---- */}
      {isLoan && (
        <div className="space-y-3 pt-1 border-t border-border/50">
          <div>
            <Label htmlFor="borrowerName">Friend's Name <span className="text-red-400">*</span></Label>
            <Input
              id="borrowerName"
              placeholder="e.g. Rahul"
              value={form.borrowerName}
              onChange={(e) => setForm((f) => ({ ...f, borrowerName: e.target.value }))}
            />
            {errors.borrowerName && <p className="text-xs expense-text mt-1">{errors.borrowerName}</p>}
          </div>
          <div>
            <Label htmlFor="dueDate">Expected Return Date <span className="text-red-400">*</span></Label>
            <Input
              id="dueDate"
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
            />
            {errors.dueDate && <p className="text-xs expense-text mt-1">{errors.dueDate}</p>}
          </div>
        </div>
      )}
    </form>
  );
}
