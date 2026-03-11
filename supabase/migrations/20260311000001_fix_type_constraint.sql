-- Fix: expand the type check constraint to include 'lent' and 'repaid'
-- The original schema only allowed ('income', 'expense') which blocks loans.

-- 1. Drop the old check constraint on type
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_type_check;

-- 2. Add new constraint that includes all four valid types
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_type_check
  CHECK (type IN ('income', 'expense', 'lent', 'repaid'));

-- 3. Make loan_status nullable so income/expense rows don't carry a misleading default
ALTER TABLE public.transactions
  ALTER COLUMN loan_status DROP NOT NULL,
  ALTER COLUMN loan_status SET DEFAULT NULL;

-- Reset the PENDING default that was applied to all existing rows by the previous migration
UPDATE public.transactions
  SET loan_status = NULL
  WHERE type IN ('income', 'expense');
