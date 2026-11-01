-- Adds 'stock' to the allowed wallets.type values (matches AccountType in lib/types.ts).
-- Revert: restore the previous constraint without 'stock' (after moving any stock wallets to another type).

alter table public.wallets
  drop constraint if exists wallets_type_check;

alter table public.wallets
  add constraint wallets_type_check
  check (type in ('bank', 'cash', 'savings', 'credit_card', 'investment', 'stock', 'bond', 'crypto', 'other'));
