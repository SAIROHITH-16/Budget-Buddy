import { useState, useEffect } from "react";
import { z } from "zod";
import type { Transaction } from "@/utils/calculations";
import { getCurrencySymbol } from "@/utils/calculations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const CATEGORIES = ["Salary", "Freelance", "Rent", "Groceries", "Utilities", "Transport", "Entertainment", "Health", "Other"];

const schema = z.object({
  type: z.enum(["income", "expense"]),
  amount: z.number().positive("Amount must be positive"),
  category: z.string().min(1, "Category is required"),
  description: z.string().trim().min(1, "Description is required").max(200),
  date: z.string().min(1, "Date is required"),
});

interface EditModalProps {
  transaction: Transaction | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, data: Omit<Transaction, "id">) => void;
}

export function TransactionEditModal({ transaction, open, onClose, onSave }: EditModalProps) {
  const [currencySymbol, setCurrencySymbol] = useState(getCurrencySymbol());
  const [form, setForm] = useState({
    type: "expense" as "income" | "expense",
    amount: "",
    category: "",
    description: "",
    date: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const handleCurrencyChange = () => setCurrencySymbol(getCurrencySymbol());
    window.addEventListener("currencyChange", handleCurrencyChange);
    return () => window.removeEventListener("currencyChange", handleCurrencyChange);
  }, []);

  useEffect(() => {
    if (transaction) {
      setForm({
        type: transaction.type,
        amount: String(transaction.amount),
        category: transaction.category,
        description: transaction.description,
        date: transaction.date,
      });
      setErrors({});
    }
  }, [transaction]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transaction) return;
    const parsed = schema.safeParse({ ...form, amount: Number(form.amount) });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }
    onSave(transaction.id, parsed.data as Omit<Transaction, "id">);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle>Edit Transaction</DialogTitle>
          <DialogDescription className="sr-only">Edit the details of this transaction.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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
              <Label htmlFor="edit-amount">Amount ({currencySymbol})</Label>
              <Input id="edit-amount" name="amount" type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
              {errors.amount && <p className="text-xs expense-text mt-1">{errors.amount}</p>}
            </div>
            <div>
              <Label htmlFor="edit-date">Date</Label>
              <Input id="edit-date" name="date" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
          </div>

          <div>
            <Label htmlFor="edit-category">Category</Label>
            <select
              id="edit-category"
              name="category"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Select category</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {errors.category && <p className="text-xs expense-text mt-1">{errors.category}</p>}
          </div>

          <div>
            <Label htmlFor="edit-description">Description</Label>
            <Input id="edit-description" name="description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} maxLength={200} />
            {errors.description && <p className="text-xs expense-text mt-1">{errors.description}</p>}
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1">Save Changes</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
