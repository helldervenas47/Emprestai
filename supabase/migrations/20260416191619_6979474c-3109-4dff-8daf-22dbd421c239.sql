ALTER TABLE public.expenses ADD COLUMN scope text NOT NULL DEFAULT 'business';
CREATE INDEX idx_expenses_scope ON public.expenses(scope);