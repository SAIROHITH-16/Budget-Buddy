
-- Transactions table
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  category TEXT NOT NULL DEFAULT 'Uncategorized',
  description TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  ai_categorized BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- AI Insights table (monthly summaries)
CREATE TABLE public.ai_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  month TEXT NOT NULL,
  summary TEXT NOT NULL,
  top_categories JSONB NOT NULL DEFAULT '[]',
  saving_suggestions JSONB NOT NULL DEFAULT '[]',
  month_comparison JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(month)
);

-- Disable RLS since no auth
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

-- Allow all access (no auth)
CREATE POLICY "Allow all access to transactions" ON public.transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to ai_insights" ON public.ai_insights FOR ALL USING (true) WITH CHECK (true);

-- Seed sample transactions
INSERT INTO public.transactions (type, amount, category, description, date) VALUES
  ('income', 5000, 'Salary', 'Monthly salary', '2025-02-01'),
  ('expense', 1200, 'Rent', 'Monthly rent', '2025-02-02'),
  ('expense', 85, 'Groceries', 'Weekly groceries', '2025-02-05'),
  ('expense', 45, 'Entertainment', 'Movie tickets', '2025-02-08'),
  ('income', 800, 'Freelance', 'Web design project', '2025-02-10'),
  ('expense', 120, 'Utilities', 'Electric bill', '2025-02-12'),
  ('expense', 60, 'Transport', 'Gas', '2025-01-15'),
  ('expense', 200, 'Groceries', 'Bulk shopping', '2025-01-20');
