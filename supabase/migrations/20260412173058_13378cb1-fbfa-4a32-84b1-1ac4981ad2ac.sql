ALTER TABLE public.loans
ADD COLUMN late_interest_type text DEFAULT NULL,
ADD COLUMN late_interest_value numeric DEFAULT NULL,
ADD COLUMN penalty_value numeric DEFAULT NULL;