alter table public.whatsapp_billing_queue
  add column if not exists loan_ids uuid[];

update public.whatsapp_billing_queue
set loan_ids = array[loan_id]
where loan_ids is null and loan_id is not null;
