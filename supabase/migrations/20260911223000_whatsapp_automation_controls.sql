alter table public.whatsapp_billing_schedule
  add column if not exists allowed_start_time text not null default '08:00',
  add column if not exists allowed_end_time text not null default '18:00',
  add column if not exists allowed_weekdays smallint[] not null default array[1,2,3,4,5,6],
  add column if not exists alert_on_failure boolean not null default true;

alter table public.clients
  add column if not exists auto_billing_send_time text,
  add column if not exists auto_billing_repeat_days integer,
  add column if not exists auto_billing_weekdays smallint[];

alter table public.whatsapp_billing_schedule
  drop constraint if exists whatsapp_billing_schedule_allowed_times_check;
alter table public.whatsapp_billing_schedule
  add constraint whatsapp_billing_schedule_allowed_times_check
  check (allowed_start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and allowed_end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

alter table public.clients
  drop constraint if exists clients_auto_billing_repeat_days_check;
alter table public.clients
  add constraint clients_auto_billing_repeat_days_check
  check (auto_billing_repeat_days is null or auto_billing_repeat_days between 1 and 30);
