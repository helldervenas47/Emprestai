-- Migration: Definir apenas Pix e Dinheiro como ativos por padrão em payment_methods

-- 1. Atualizar função de seed para novos usuários
CREATE OR REPLACE FUNCTION public.seed_default_payment_methods(_owner_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.payment_methods WHERE user_id = _owner_id) THEN
    RETURN;
  END IF;

  INSERT INTO public.payment_methods (user_id, name, icon, sort_order, active, kind) VALUES
    (_owner_id, 'Pix', 'Smartphone', 1, true, 'account'),
    (_owner_id, 'Dinheiro', 'Banknote', 2, true, 'cash'),
    (_owner_id, 'Transferência', 'ArrowRightLeft', 3, false, 'account'),
    (_owner_id, 'Cartão', 'CreditCard', 4, false, 'account'),
    (_owner_id, 'Boleto', 'FileText', 5, false, 'account');
END;
$$;

-- 2. Atualizar formas padrões existentes
UPDATE public.payment_methods
SET active = false
WHERE lower(trim(name)) IN ('transferência', 'transferencia', 'cartão', 'cartao', 'boleto');

UPDATE public.payment_methods
SET active = true
WHERE lower(trim(name)) IN ('pix', 'dinheiro');
