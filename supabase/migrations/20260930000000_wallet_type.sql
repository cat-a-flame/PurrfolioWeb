-- Adds wallets.type, default 'bank'. Allowed values match AccountType in lib/types.ts.
-- Remove: alter table public.wallets drop constraint wallets_type_check; alter table public.wallets drop column type;

alter table public.wallets
  add column if not exists type text not null default 'bank';

alter table public.wallets
  add constraint wallets_type_check
  check (type in ('bank', 'cash', 'savings', 'credit_card', 'investment', 'bond', 'crypto', 'other'));
