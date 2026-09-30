-- Adds an account type (bank, cash, savings, ...) to wallets.
--
-- Existing wallets default to 'bank'; the check constraint keeps values in
-- sync with the AccountType union in lib/types.ts.
--
-- To remove:
--   alter table public.wallets drop constraint wallets_type_check;
--   alter table public.wallets drop column type;

alter table public.wallets
  add column if not exists type text not null default 'bank';

alter table public.wallets
  add constraint wallets_type_check
  check (type in ('bank', 'cash', 'savings', 'credit_card', 'investment', 'bond', 'crypto', 'other'));
