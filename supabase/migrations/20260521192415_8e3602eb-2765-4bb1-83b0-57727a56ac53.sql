
CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  user_id uuid NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('entrada_manual','compra','venda','ajuste')),
  quantity integer NOT NULL,
  unit_cost numeric(12,2),
  total_value numeric(12,2),
  expense_id uuid,
  sale_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_movements_owner_created ON public.stock_movements(owner_id, created_at DESC);
CREATE INDEX idx_stock_movements_product ON public.stock_movements(product_id);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stock movements visible to group"
ON public.stock_movements FOR SELECT
USING (owner_id = public.get_data_owner_id(auth.uid()));

CREATE POLICY "Stock movements insert"
ON public.stock_movements FOR INSERT
WITH CHECK (
  owner_id = public.get_data_owner_id(auth.uid())
  AND public.can_write_data(auth.uid())
);

CREATE POLICY "Stock movements update"
ON public.stock_movements FOR UPDATE
USING (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Stock movements delete"
ON public.stock_movements FOR DELETE
USING (owner_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_movements;
ALTER TABLE public.stock_movements REPLICA IDENTITY FULL;
