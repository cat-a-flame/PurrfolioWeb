-- Per-wallet income/expense totals for the signed-in user, computed in the
-- database so the app doesn't have to download every transaction to add them up.
--
-- Safety:
--   * security invoker: runs with the caller's permissions, so the row-level
--     security policies on public.transactions still apply.
--   * Only ever reads the caller's own rows (auth.uid()); it takes no user id
--     argument, so it can't be asked for anyone else's totals.
--   * Read-only (stable, a single SELECT).
--
-- To remove: drop function public.wallet_balance_sums();

create or replace function public.wallet_balance_sums()
returns table (wallet_id text, income numeric, expense numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.wallet_id::text,
    coalesce(sum(t.amount) filter (where t.type = 'income'), 0)::numeric,
    coalesce(sum(t.amount) filter (where t.type = 'expense'), 0)::numeric
  from public.transactions t
  where t.user_id = auth.uid()
  group by t.wallet_id;
$$;

revoke execute on function public.wallet_balance_sums() from public, anon;
grant execute on function public.wallet_balance_sums() to authenticated;
