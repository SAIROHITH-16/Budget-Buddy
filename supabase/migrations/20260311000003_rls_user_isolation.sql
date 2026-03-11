-- ============================================================
-- Migration: User isolation — lock down wildcard RLS policies
--
-- Context
-- -------
-- This app uses Firebase Auth for user authentication. Every HTTP
-- request to the Express backend is gated by the verifyToken
-- middleware which verifies the Firebase JWT and exposes the user's
-- Firebase UID as req.user.uid. All Supabase queries run under the
-- SERVICE_ROLE key, which bypasses Row-Level Security by design.
--
-- The wildcard "Allow all" policies created in earlier migrations left
-- the database readable/writable by ANYONE holding the public anon
-- key. These policies are removed below.
--
-- Outcome after this migration
-- ----------------------------
--   • anon key       → all table access DENIED (no matching policy)
--   • service_role   → full access (bypasses RLS, Express API only)
--   • Supabase Auth  → no policies → denied (app uses Firebase, not Supabase Auth)
--
-- Data isolation guarantee
-- ------------------------
-- Every Express route already filters rows by req.user.uid:
--   .eq("uid", req.user.uid)
-- Removing the open policies adds a second layer: even a leaked anon
-- key cannot read or mutate any row directly.
-- ============================================================

-- ── transactions ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all access to transactions" ON public.transactions;

-- ── budgets ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all access to budgets"      ON public.budgets;

-- ── ai_insights ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all access to ai_insights"  ON public.ai_insights;

-- ── users ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all access to users"        ON public.users;

-- ── loans ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all access to loans"        ON public.loans;

-- ── phone_otps ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all access to phone_otps"   ON public.phone_otps;

-- RLS is already ENABLED on all of the tables above (from earlier migrations).
-- With no passing policy, the anon/authenticated Supabase roles can no longer
-- read or write these tables directly. All access goes through the Express API.
