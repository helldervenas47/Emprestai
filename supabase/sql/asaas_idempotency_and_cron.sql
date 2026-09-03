-- =========================================================================
-- Melhorias de robustez do ciclo SaaS (Asaas + Supabase)
-- Rodar no SQL Editor do projeto externo (syyxnqzxqabeuqbuptkh).
-- =========================================================================

-- 1) Coluna para idempotência do webhook do Asaas -------------------------
-- Guarda o último payment.id processado com sucesso. O webhook ignora
-- reenvios cujo id já esteja gravado no perfil (evita somar 30 dias 2x).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_payment_id text;

CREATE INDEX IF NOT EXISTS profiles_last_payment_id_idx
  ON public.profiles (last_payment_id);

-- 2) Cron diário de inadimplência (falha-segura p/ webhook perdido) -------
-- Requer as extensões pg_cron e (opcional) pg_net.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove versão anterior do job para permitir re-execução idempotente.
DO $$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'mark_past_due_daily';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

-- Roda diariamente às 03:15 UTC (00:15 BRT). Ajuste conforme necessário.
SELECT cron.schedule(
  'mark_past_due_daily',
  '15 3 * * *',
  $cron$
    UPDATE public.profiles
       SET financial_status = 'PAST_DUE',
           updated_at       = now()
     WHERE financial_status = 'ACTIVE'
       AND current_period_end IS NOT NULL
       AND current_period_end < now();
  $cron$
);

-- 3) Seed defensivo de plano padrão ---------------------------------------
-- Garante ao menos 1 plano ativo com trial_days > 0 (usado como fallback
-- por usePlanEntitlements quando o usuário não possui plano vinculado).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE active = true) THEN
    INSERT INTO public.plans (name, description, price, trial_days, active, sort_order, features)
    VALUES (
      'Trial',
      'Plano padrão de avaliação — criado automaticamente.',
      0,
      7,
      true,
      0,
      '[]'::jsonb
    );
  ELSE
    -- Se todos os planos ativos tiverem trial_days nulo/0, garante ao menos
    -- 7 dias no plano de menor sort_order para não travar novos cadastros.
    UPDATE public.plans
       SET trial_days = 7
     WHERE id = (
       SELECT id FROM public.plans
        WHERE active = true
        ORDER BY sort_order NULLS LAST, created_at ASC
        LIMIT 1
     )
       AND COALESCE(trial_days, 0) = 0;
  END IF;
END $$;
