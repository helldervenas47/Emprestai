
-- Add immutable original principal column to loans
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS original_amount numeric;

-- Backfill: original = current amount + sum of all amortization payments (installment_number = -3)
UPDATE public.loans l
SET original_amount = COALESCE(l.amount, 0) + COALESCE((
  SELECT SUM(p.amount)
  FROM public.payments p
  WHERE p.loan_id = l.id
    AND p.installment_number = -3
), 0)
WHERE l.original_amount IS NULL;

-- For any remaining nulls, fall back to current amount
UPDATE public.loans
SET original_amount = amount
WHERE original_amount IS NULL;

-- Make it required going forward and default to amount on insert via trigger
ALTER TABLE public.loans
  ALTER COLUMN original_amount SET NOT NULL;

-- Trigger: on INSERT, if original_amount not provided, default to amount.
-- on UPDATE, prevent changes to original_amount.
CREATE OR REPLACE FUNCTION public.preserve_loan_original_amount()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.original_amount IS NULL OR NEW.original_amount = 0 THEN
      NEW.original_amount := NEW.amount;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.original_amount IS DISTINCT FROM OLD.original_amount THEN
      NEW.original_amount := OLD.original_amount;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_preserve_loan_original_amount ON public.loans;
CREATE TRIGGER trg_preserve_loan_original_amount
BEFORE INSERT OR UPDATE ON public.loans
FOR EACH ROW EXECUTE FUNCTION public.preserve_loan_original_amount();
