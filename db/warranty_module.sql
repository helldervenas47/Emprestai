-- =============================================================
-- Warranty (Garantia) module for sales contracts
-- Apply this SQL in YOUR Supabase project (CloneSupa / SQL Editor / psql)
-- The file is intentionally outside supabase/migrations so the agent
-- does not try to manage it automaticamente via migrações.
-- =============================================================

-- ---------- warranty_cases ----------
CREATE TABLE IF NOT EXISTS public.warranty_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  opened_by uuid,
  status text NOT NULL DEFAULT 'aberta',
  reason text,
  notes text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_warranty_cases_sale ON public.warranty_cases(sale_id);
CREATE INDEX IF NOT EXISTS idx_warranty_cases_user ON public.warranty_cases(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.warranty_cases TO authenticated;
GRANT ALL ON public.warranty_cases TO service_role;
ALTER TABLE public.warranty_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "warranty_cases_owner_all" ON public.warranty_cases;
CREATE POLICY "warranty_cases_owner_all" ON public.warranty_cases
  FOR ALL TO authenticated
  USING (user_id = public.get_data_owner_id(auth.uid()))
  WITH CHECK (user_id = public.get_data_owner_id(auth.uid()));

DROP TRIGGER IF EXISTS trg_warranty_cases_updated_at ON public.warranty_cases;
CREATE TRIGGER trg_warranty_cases_updated_at
  BEFORE UPDATE ON public.warranty_cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- warranty_items ----------
CREATE TABLE IF NOT EXISTS public.warranty_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warranty_case_id uuid NOT NULL REFERENCES public.warranty_cases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_warranty_items_case ON public.warranty_items(warranty_case_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warranty_items TO authenticated;
GRANT ALL ON public.warranty_items TO service_role;
ALTER TABLE public.warranty_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "warranty_items_owner_all" ON public.warranty_items;
CREATE POLICY "warranty_items_owner_all" ON public.warranty_items
  FOR ALL TO authenticated
  USING (user_id = public.get_data_owner_id(auth.uid()))
  WITH CHECK (user_id = public.get_data_owner_id(auth.uid()));

-- ---------- warranty_movements ----------
CREATE TABLE IF NOT EXISTS public.warranty_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warranty_case_id uuid NOT NULL REFERENCES public.warranty_cases(id) ON DELETE CASCADE,
  warranty_item_id uuid REFERENCES public.warranty_items(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  performed_by uuid,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_warranty_movements_case ON public.warranty_movements(warranty_case_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warranty_movements TO authenticated;
GRANT ALL ON public.warranty_movements TO service_role;
ALTER TABLE public.warranty_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "warranty_movements_owner_all" ON public.warranty_movements;
CREATE POLICY "warranty_movements_owner_all" ON public.warranty_movements
  FOR ALL TO authenticated
  USING (user_id = public.get_data_owner_id(auth.uid()))
  WITH CHECK (user_id = public.get_data_owner_id(auth.uid()));

-- ---------- warranty_attachments ----------
CREATE TABLE IF NOT EXISTS public.warranty_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warranty_case_id uuid NOT NULL REFERENCES public.warranty_cases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  uploaded_by uuid,
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_warranty_attachments_case ON public.warranty_attachments(warranty_case_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warranty_attachments TO authenticated;
GRANT ALL ON public.warranty_attachments TO service_role;
ALTER TABLE public.warranty_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "warranty_attachments_owner_all" ON public.warranty_attachments;
CREATE POLICY "warranty_attachments_owner_all" ON public.warranty_attachments
  FOR ALL TO authenticated
  USING (user_id = public.get_data_owner_id(auth.uid()))
  WITH CHECK (user_id = public.get_data_owner_id(auth.uid()));

-- ---------- warranty_history ----------
CREATE TABLE IF NOT EXISTS public.warranty_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warranty_case_id uuid NOT NULL REFERENCES public.warranty_cases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  actor_id uuid,
  event text NOT NULL,
  from_value text,
  to_value text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_warranty_history_case ON public.warranty_history(warranty_case_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warranty_history TO authenticated;
GRANT ALL ON public.warranty_history TO service_role;
ALTER TABLE public.warranty_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "warranty_history_owner_all" ON public.warranty_history;
CREATE POLICY "warranty_history_owner_all" ON public.warranty_history
  FOR ALL TO authenticated
  USING (user_id = public.get_data_owner_id(auth.uid()))
  WITH CHECK (user_id = public.get_data_owner_id(auth.uid()));

-- =============================================================
-- Storage bucket (private). Create it on the dashboard or via:
-- =============================================================
-- INSERT INTO storage.buckets (id, name, public)
--   VALUES ('warranty-attachments','warranty-attachments', false)
--   ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'warranty-attachments') THEN
    DROP POLICY IF EXISTS "warranty_obj_read" ON storage.objects;
    CREATE POLICY "warranty_obj_read" ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'warranty-attachments'
        AND (storage.foldername(name))[1] = public.get_data_owner_id(auth.uid())::text);
    DROP POLICY IF EXISTS "warranty_obj_write" ON storage.objects;
    CREATE POLICY "warranty_obj_write" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'warranty-attachments'
        AND (storage.foldername(name))[1] = public.get_data_owner_id(auth.uid())::text);
    DROP POLICY IF EXISTS "warranty_obj_update" ON storage.objects;
    CREATE POLICY "warranty_obj_update" ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'warranty-attachments'
        AND (storage.foldername(name))[1] = public.get_data_owner_id(auth.uid())::text);
    DROP POLICY IF EXISTS "warranty_obj_delete" ON storage.objects;
    CREATE POLICY "warranty_obj_delete" ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'warranty-attachments'
        AND (storage.foldername(name))[1] = public.get_data_owner_id(auth.uid())::text);
  END IF;
END $$;
