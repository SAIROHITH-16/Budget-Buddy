-- Add uid column to transactions (for per-user scoping via Firebase Auth)
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS uid TEXT,
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bank_reference_id TEXT;

-- Create index for fast per-user queries
CREATE INDEX IF NOT EXISTS transactions_uid_idx ON public.transactions (uid);
CREATE INDEX IF NOT EXISTS transactions_uid_date_idx ON public.transactions (uid, date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS transactions_uid_bankref_idx
  ON public.transactions (uid, bank_reference_id)
  WHERE bank_reference_id IS NOT NULL;

-- Budgets table (one row per user)
CREATE TABLE IF NOT EXISTS public.budgets (
  id              UUID    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  uid             TEXT    NOT NULL UNIQUE,
  monthly_limit   NUMERIC NOT NULL DEFAULT 0,
  alert_threshold NUMERIC NOT NULL DEFAULT 80,
  updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS: open policies (auth enforced by Firebase on the Express server)
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to transactions" ON public.transactions;
CREATE POLICY "Allow all access to transactions" ON public.transactions FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Allow all access to budgets" ON public.budgets FOR ALL USING (true) WITH CHECK (true);
