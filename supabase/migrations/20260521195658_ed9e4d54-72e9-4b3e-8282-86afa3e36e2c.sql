ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS last_purchase_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suggested_stock integer NOT NULL DEFAULT 0;