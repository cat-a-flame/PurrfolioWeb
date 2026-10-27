-- recurring_payments.auto_add: when true, the payment is recorded automatically on its due date.
-- Defaults to false, so existing payments keep asking for confirmation.
-- Remove: alter table public.recurring_payments drop column auto_add;

alter table public.recurring_payments
  add column if not exists auto_add boolean not null default false;
