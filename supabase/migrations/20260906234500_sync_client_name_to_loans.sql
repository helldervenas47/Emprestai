-- Sincronização automática do nome do cliente nos empréstimos
-- Garante que qualquer alteração de nome na tabela `clients` reflita automaticamente em `loans.borrower_name`.

CREATE OR REPLACE FUNCTION public.sync_client_name_to_loans()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Atualiza empréstimos explicitamente vinculados pelo ID do cliente
  UPDATE public.loans
  SET borrower_name = NEW.name
  WHERE (borrower_id::text = NEW.id::text)
    AND borrower_name IS DISTINCT FROM NEW.name;

  -- 2. Se o borrower_id for nulo mas o nome antigo coincidia exatamente (mesmo user_id), vincula e atualiza
  IF OLD.name IS NOT NULL AND trim(OLD.name) <> '' THEN
    UPDATE public.loans
    SET borrower_name = NEW.name,
        borrower_id = NEW.id::text
    WHERE user_id = NEW.user_id
      AND (borrower_id IS NULL OR borrower_id::text = '')
      AND lower(trim(borrower_name)) = lower(trim(OLD.name));
  END IF;

  RETURN NEW;
END;
$$;

-- Remove o trigger se já existir para recriação limpa
DROP TRIGGER IF EXISTS trigger_sync_client_name_to_loans ON public.clients;

-- Dispara após atualização do campo 'name' na tabela clients
CREATE TRIGGER trigger_sync_client_name_to_loans
AFTER UPDATE OF name ON public.clients
FOR EACH ROW
WHEN (OLD.name IS DISTINCT FROM NEW.name)
EXECUTE FUNCTION public.sync_client_name_to_loans();

-- Reconciliação imediata: corrige todos os registros históricos já existentes no banco
UPDATE public.loans l
SET borrower_name = c.name
FROM public.clients c
WHERE (l.borrower_id::text = c.id::text)
  AND l.borrower_name IS DISTINCT FROM c.name;
