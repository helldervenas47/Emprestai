alter table public.whatsapp_billing_queue
  add column if not exists billing_status text;
