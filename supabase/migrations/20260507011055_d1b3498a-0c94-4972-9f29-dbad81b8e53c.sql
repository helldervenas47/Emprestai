
-- 1) payment_methods.kind
ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'account';
ALTER TABLE public.payment_methods
  DROP CONSTRAINT IF EXISTS payment_methods_kind_check;
ALTER TABLE public.payment_methods
  ADD CONSTRAINT payment_methods_kind_check CHECK (kind IN ('account','cash'));

UPDATE public.payment_methods SET kind = 'cash' WHERE lower(name) = 'dinheiro';

-- 2) balance: account_amount + cash_amount
ALTER TABLE public.balance
  ADD COLUMN IF NOT EXISTS account_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_amount numeric NOT NULL DEFAULT 0;

-- 3) account_ledger: wallet, payment_method_id, transfer_group_id
ALTER TABLE public.account_ledger
  ADD COLUMN IF NOT EXISTS wallet text NOT NULL DEFAULT 'account',
  ADD COLUMN IF NOT EXISTS payment_method_id uuid,
  ADD COLUMN IF NOT EXISTS transfer_group_id uuid;

ALTER TABLE public.account_ledger
  DROP CONSTRAINT IF EXISTS account_ledger_wallet_check;
ALTER TABLE public.account_ledger
  ADD CONSTRAINT account_ledger_wallet_check CHECK (wallet IN ('account','cash'));

-- atualizar check de category para aceitar transfer
ALTER TABLE public.account_ledger
  DROP CONSTRAINT IF EXISTS account_ledger_category_check;
ALTER TABLE public.account_ledger
  ADD CONSTRAINT account_ledger_category_check
  CHECK (category = ANY (ARRAY['loan','payment','expense','adjustment','aporte','sale','initial','other','transfer']));

-- FK opcional para payment_methods
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'account_ledger_payment_method_id_fkey'
  ) THEN
    ALTER TABLE public.account_ledger
      ADD CONSTRAINT account_ledger_payment_method_id_fkey
      FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_account_ledger_wallet ON public.account_ledger(user_id, wallet);
CREATE INDEX IF NOT EXISTS idx_account_ledger_transfer_group ON public.account_ledger(transfer_group_id) WHERE transfer_group_id IS NOT NULL;

-- 4) Backfill: lançamentos vinculados a pagamento com forma "cash" → wallet=cash
UPDATE public.account_ledger al
SET wallet = 'cash', payment_method_id = p.payment_method_id
FROM public.payments p
JOIN public.payment_methods pm ON pm.id = p.payment_method_id
WHERE al.payment_id = p.id
  AND pm.kind = 'cash'
  AND al.wallet = 'account';

-- copia payment_method_id também para entradas de payment não-cash
UPDATE public.account_ledger al
SET payment_method_id = p.payment_method_id
FROM public.payments p
WHERE al.payment_id = p.id
  AND al.payment_method_id IS NULL
  AND p.payment_method_id IS NOT NULL;

-- 5) Backfill saldo: tudo vai pra conta se as colunas novas estiverem zeradas
UPDATE public.balance
SET account_amount = amount,
    cash_amount = 0
WHERE account_amount = 0 AND cash_amount = 0 AND amount <> 0;

-- recalcula amount = account + cash quando os campos novos forem definidos depois
