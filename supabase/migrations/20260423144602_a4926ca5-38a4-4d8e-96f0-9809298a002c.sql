
-- 1. Tabela de formas de pagamento
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  icon TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view payment_methods" ON public.payment_methods
  FOR SELECT TO authenticated
  USING (user_id = public.get_data_owner_id(auth.uid()));

CREATE POLICY "Users can insert payment_methods" ON public.payment_methods
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Users can update payment_methods" ON public.payment_methods
  FOR UPDATE TO authenticated
  USING (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE POLICY "Users can delete payment_methods" ON public.payment_methods
  FOR DELETE TO authenticated
  USING (user_id = public.get_data_owner_id(auth.uid()) AND public.can_write_data(auth.uid()));

CREATE TRIGGER update_payment_methods_updated_at
  BEFORE UPDATE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id ON public.payment_methods(user_id);

-- 2. Adicionar coluna na tabela payments
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_method_id UUID REFERENCES public.payment_methods(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_payment_method_id ON public.payments(payment_method_id);

-- 3. Função para criar formas padrão para usuários novos (e existentes)
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
  INSERT INTO public.payment_methods (user_id, name, icon, sort_order) VALUES
    (_owner_id, 'Pix', 'Smartphone', 1),
    (_owner_id, 'Dinheiro', 'Banknote', 2),
    (_owner_id, 'Transferência', 'ArrowRightLeft', 3),
    (_owner_id, 'Cartão', 'CreditCard', 4),
    (_owner_id, 'Boleto', 'FileText', 5);
END;
$$;

-- 4. Backfill formas para owners existentes
DO $$
DECLARE
  _owner UUID;
BEGIN
  FOR _owner IN
    SELECT DISTINCT user_id FROM public.loans
    UNION
    SELECT DISTINCT id FROM auth.users
  LOOP
    PERFORM public.seed_default_payment_methods(_owner);
  END LOOP;
END $$;

-- 5. Atualizar handle_new_user para também semear formas
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));

  INSERT INTO public.subscriptions (user_id, paddle_subscription_id, paddle_customer_id, product_id, price_id, status, environment)
  VALUES
    (NEW.id, 'free_' || NEW.id::text || '_sandbox', 'free_customer_' || NEW.id::text, 'free_plan', 'free', 'active', 'sandbox'),
    (NEW.id, 'free_' || NEW.id::text || '_live', 'free_customer_' || NEW.id::text, 'free_plan', 'free', 'active', 'live');

  PERFORM public.seed_default_payment_methods(NEW.id);

  RETURN NEW;
END;
$function$;
