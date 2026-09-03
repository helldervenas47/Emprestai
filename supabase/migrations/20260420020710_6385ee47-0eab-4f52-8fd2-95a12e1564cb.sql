-- Set REPLICA IDENTITY FULL para garantir payloads completos em UPDATE/DELETE
ALTER TABLE public.loans REPLICA IDENTITY FULL;
ALTER TABLE public.payments REPLICA IDENTITY FULL;
ALTER TABLE public.expenses REPLICA IDENTITY FULL;
ALTER TABLE public.clients REPLICA IDENTITY FULL;
ALTER TABLE public.sales REPLICA IDENTITY FULL;
ALTER TABLE public.personal_expense_categories REPLICA IDENTITY FULL;

-- Adiciona as tabelas à publicação realtime (idempotente)
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.loans; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.payments; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.clients; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.sales; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.personal_expense_categories; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;