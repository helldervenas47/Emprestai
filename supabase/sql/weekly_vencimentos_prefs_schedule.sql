-- Rode no Supabase externo (syyxnqzxqabeuqbuptkh)
-- Adiciona dia da semana + horário customizáveis ao relatório
-- /vencimentos_semana.

alter table public.telegram_weekly_vencimentos_prefs
  add column if not exists weekday smallint not null default 1,   -- 0=Dom..6=Sáb
  add column if not exists send_time text not null default '08:00',
  add column if not exists last_sent_date date;
