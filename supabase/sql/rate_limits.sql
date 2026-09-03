-- =====================================================================
-- Fase A: Rate limiting via Postgres
-- Aplicar no banco EXTERNO (syyxnqzxqabeuqbuptkh) via SQL Editor.
-- =====================================================================

-- 1) Tabela leve para contar requisições por chave dentro de janelas
CREATE TABLE IF NOT EXISTS public.rate_limits (
  bucket       text        NOT NULL,                -- ex.: 'voice-expense', 'wa-webhook', 'login'
  key          text        NOT NULL,                -- ex.: user_id, phone, ip
  window_start timestamptz NOT NULL,                -- início da janela arredondado
  count        integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, key, window_start)
);

CREATE INDEX IF NOT EXISTS rate_limits_window_idx
  ON public.rate_limits (window_start);

GRANT SELECT, INSERT, UPDATE ON public.rate_limits TO service_role;

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- Sem policies: somente service_role acessa (edge functions).

-- 2) Função atômica de verificação + incremento
--    Retorna TRUE  -> permitido
--    Retorna FALSE -> bloqueado (estourou o limite)
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _bucket       text,
  _key          text,
  _max          integer,           -- número máximo de requisições
  _window_secs  integer            -- tamanho da janela em segundos
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _win  timestamptz;
  _cnt  integer;
BEGIN
  -- Arredonda o início da janela
  _win := to_timestamp(
    floor(extract(epoch FROM now()) / _window_secs) * _window_secs
  );

  INSERT INTO public.rate_limits AS r (bucket, key, window_start, count)
  VALUES (_bucket, _key, _win, 1)
  ON CONFLICT (bucket, key, window_start)
    DO UPDATE SET count = r.count + 1
  RETURNING count INTO _cnt;

  -- Limpa janelas antigas oportunisticamente (1% das chamadas)
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limits
     WHERE window_start < now() - interval '1 hour';
  END IF;

  RETURN _cnt <= _max;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer) TO service_role;
