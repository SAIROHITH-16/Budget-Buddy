-- Migration: add users table, phone_otps table, and loan columns to transactions
-- Run this in Supabase dashboard → SQL Editor

-- 1. Add loan columns to existing transactions table
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS borrower_name    TEXT,
  ADD COLUMN IF NOT EXISTS due_date         TEXT,
  ADD COLUMN IF NOT EXISTS repaid_amount    NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS loan_status      TEXT NOT NULL DEFAULT 'PENDING';

-- 2. Users table (one row per Firebase user)
CREATE TABLE IF NOT EXISTS public.users (
  id                UUID    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  firebase_uid      TEXT    NOT NULL UNIQUE,
  name              TEXT    NOT NULL DEFAULT 'User',
  email             TEXT,
  phone             TEXT,
  is_verified       BOOLEAN NOT NULL DEFAULT false,
  verify_otp        TEXT,
  otp_expires       TIMESTAMP WITH TIME ZONE,
  is_phone_verified BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_firebase_uid_idx ON public.users (firebase_uid);
CREATE INDEX IF NOT EXISTS users_email_idx        ON public.users (email);
CREATE INDEX IF NOT EXISTS users_phone_idx        ON public.users (phone);

-- 3. Phone OTPs table (keyed by E.164 phone number)
CREATE TABLE IF NOT EXISTS public.phone_otps (
  phone      TEXT PRIMARY KEY,
  otp        TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. RLS: open policies so Express (using service-role key) can do everything
--    Auth is enforced at the Express layer by Firebase verifyToken middleware.
ALTER TABLE public.users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_otps  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service-role full access to users"      ON public.users;
DROP POLICY IF EXISTS "service-role full access to phone_otps" ON public.phone_otps;

CREATE POLICY "service-role full access to users"
  ON public.users FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service-role full access to phone_otps"
  ON public.phone_otps FOR ALL USING (true) WITH CHECK (true);
