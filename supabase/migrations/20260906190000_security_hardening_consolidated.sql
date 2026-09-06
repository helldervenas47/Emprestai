-- Migration de Hardening de Segurança — Emprestaii
-- Data: 2026-09-06
-- P0: Eliminação de superfície de SQL arbitrário (exec_sql)
-- P2: RPC atômica para movimentação de estoque (prevenção de race condition)

-- 1) Revogar e remover public.exec_sql caso exista
DO $$
BEGIN
  -- Revoga permissões de qualquer usuário público / autenticado / anônimo
  IF EXISTS (
    SELECT 1 FROM pg_proc p 
    JOIN pg_namespace n ON p.pronamespace = n.oid 
    WHERE n.nspname = 'public' AND p.proname = 'exec_sql'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.exec_sql(text) FROM PUBLIC, anon, authenticated;';
    EXECUTE 'DROP FUNCTION IF EXISTS public.exec_sql(text);';
  END IF;
END $$;

-- 2) Criação da RPC atômica para ajuste de estoque com validação multi-tenant e lock de linha (P2)
CREATE OR REPLACE FUNCTION public.adjust_product_stock(
  _product_id UUID,
  _quantity_delta NUMERIC,
  _allow_negative BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner_id UUID;
  v_current_stock NUMERIC;
  v_new_stock NUMERIC;
  v_prod_name TEXT;
BEGIN
  -- Resolve o tenant proprietário dos dados a partir do usuário autenticado
  v_owner_id := public.get_data_owner_id(auth.uid());
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  -- Valida permissão de escrita
  IF NOT public.can_write_data(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso em modo somente leitura ou usuário bloqueado';
  END IF;

  -- Lock a nível de linha para evitar concorrência/race conditions
  SELECT stock, name INTO v_current_stock, v_prod_name
  FROM public.products
  WHERE id = _product_id AND user_id = v_owner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado ou não pertence a este usuário';
  END IF;

  v_new_stock := COALESCE(v_current_stock, 0) + _quantity_delta;

  IF NOT _allow_negative AND v_new_stock < 0 THEN
    RAISE EXCEPTION 'Estoque insuficiente (disponível: %, solicitado: %)', v_current_stock, ABS(_quantity_delta);
  END IF;

  UPDATE public.products
  SET stock = v_new_stock,
      updated_at = NOW()
  WHERE id = _product_id AND user_id = v_owner_id;

  RETURN jsonb_build_object(
    'success', true,
    'product_id', _product_id,
    'product_name', v_prod_name,
    'previous_stock', v_current_stock,
    'new_stock', v_new_stock
  );
END;
$$;

-- Permissões na RPC
REVOKE ALL ON FUNCTION public.adjust_product_stock(UUID, NUMERIC, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_product_stock(UUID, NUMERIC, BOOLEAN) TO authenticated, service_role;
