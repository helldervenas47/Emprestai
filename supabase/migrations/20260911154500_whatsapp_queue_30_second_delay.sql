-- Processa a fila continuamente e impede dois envios do mesmo proprietário
-- em um intervalo menor que 30 segundos, inclusive entre lotes diferentes.
create or replace function public.claim_whatsapp_billing_queue_item()
returns setof public.whatsapp_billing_queue
language plpgsql security definer set search_path = public as $$
begin
  -- Serializa a reserva para que chamadas simultâneas do cron não retirem
  -- dois itens do mesmo proprietário antes de o primeiro virar "processing".
  perform pg_advisory_xact_lock(hashtext('whatsapp_billing_queue_claim'));

  -- Recupera automaticamente um item abandonado por interrupção do worker.
  update public.whatsapp_billing_queue
  set status = 'pending', updated_at = now()
  where status = 'processing'
    and updated_at < now() - interval '2 minutes';

  return query
  update public.whatsapp_billing_queue q
  set status = 'processing', attempts = attempts + 1, updated_at = now()
  where q.id = (
    select candidate.id
    from public.whatsapp_billing_queue candidate
    where candidate.status = 'pending'
      and candidate.scheduled_at <= now()
      and not exists (
        select 1
        from public.whatsapp_billing_queue active
        where active.user_id = candidate.user_id
          and active.status = 'processing'
      )
      and not exists (
        select 1
        from public.whatsapp_billing_queue recently_sent
        where recently_sent.user_id = candidate.user_id
          and recently_sent.status = 'sent'
          and recently_sent.sent_at > now() - interval '30 seconds'
      )
    order by candidate.scheduled_at, candidate.created_at
    for update skip locked
    limit 1
  )
  returning q.*;
end;
$$;

revoke all on function public.claim_whatsapp_billing_queue_item() from public, anon, authenticated;
grant execute on function public.claim_whatsapp_billing_queue_item() to service_role;

create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$
begin
  begin
    perform cron.unschedule('process-whatsapp-billing-queue');
  exception when others then
    null;
  end;

  perform cron.schedule(
    'process-whatsapp-billing-queue',
    '10 seconds',
    $job$
    select net.http_post(
      url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/process-whatsapp-billing-queue',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select value from public.app_internal_config where key = 'cron_secret' limit 1)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 20000
    );
    $job$
  );
end $$;
