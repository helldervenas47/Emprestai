ALTER TABLE public.sales ADD COLUMN payment_mode text NOT NULL DEFAULT 'fixa';
ALTER TABLE public.sales ADD COLUMN installments integer NOT NULL DEFAULT 1;
ALTER TABLE public.sales ADD COLUMN paid_installments integer NOT NULL DEFAULT 0;