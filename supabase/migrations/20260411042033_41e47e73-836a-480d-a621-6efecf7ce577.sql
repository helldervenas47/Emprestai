
ALTER TABLE public.sales ADD COLUMN business_type text NOT NULL DEFAULT 'venda';
ALTER TABLE public.sales ADD COLUMN description text NOT NULL DEFAULT '';
ALTER TABLE public.sales ALTER COLUMN product_id DROP NOT NULL;
