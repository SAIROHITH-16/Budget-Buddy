-- Allow 'WRITTEN_OFF' as a valid loan_status value.
-- Previously only PENDING / PARTIALLY_REPAID / FULLY_REPAID / OVERDUE existed.

-- Drop the existing check constraint on loan_status if one was added
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_loan_status_check;

-- Add the expanded constraint that includes WRITTEN_OFF
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_loan_status_check
  CHECK (
    loan_status IS NULL OR
    loan_status IN ('PENDING', 'PARTIALLY_REPAID', 'FULLY_REPAID', 'OVERDUE', 'WRITTEN_OFF')
  );
