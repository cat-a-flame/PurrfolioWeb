-- Enforces 2FA in the database, so a password-only (aal1) session can't read or write data through the API.
-- mfa_satisfied(): true at aal2, or when the user has no verified factor.
-- A restrictive require_mfa policy on each table below requires it.
-- delete_my_data()/delete_my_account() bypass RLS, so they check it themselves.
-- Remove: drop policy require_mfa on each table below, re-run 20261005000000_delete_my_data_and_account.sql,
--   then drop function public.mfa_satisfied();

create or replace function public.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    or not exists (
      select 1
      from auth.mfa_factors f
      where f.user_id = auth.uid()
        and f.status = 'verified'
    );
$$;

revoke execute on function public.mfa_satisfied() from public, anon;
grant execute on function public.mfa_satisfied() to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'transactions',
    'transaction_labels',
    'wallets',
    'categories',
    'labels',
    'recurring_payments',
    'recurring_payment_labels',
    'recurring_occurrences',
    'templates',
    'template_labels'
  ]
  loop
    -- Skip tables that don't exist in this project.
    if to_regclass(format('public.%I', t)) is null then
      continue;
    end if;
    execute format('drop policy if exists require_mfa on public.%I', t);
    execute format(
      'create policy require_mfa on public.%I as restrictive for all to authenticated '
      'using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()))',
      t
    );
  end loop;
end;
$$;

create or replace function public.delete_my_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if not public.mfa_satisfied() then
    raise exception 'Two-factor authentication required';
  end if;

  delete from public.recurring_occurrences where user_id = uid;
  delete from public.recurring_payment_labels
    where recurring_payment_id in (select id from public.recurring_payments where user_id = uid);
  delete from public.recurring_payments where user_id = uid;

  delete from public.template_labels
    where template_id in (select id from public.templates where user_id = uid);
  delete from public.templates where user_id = uid;

  delete from public.transaction_labels
    where transaction_id in (select id from public.transactions where user_id = uid);
  delete from public.transactions where user_id = uid;

  delete from public.labels where user_id = uid;
  -- Subcategories first, so the parent_id references don't block the delete.
  delete from public.categories where user_id = uid and parent_id is not null;
  delete from public.categories where user_id = uid;
  delete from public.wallets where user_id = uid;
end;
$$;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if not public.mfa_satisfied() then
    raise exception 'Two-factor authentication required';
  end if;

  perform public.delete_my_data();
  delete from auth.users where id = uid;
end;
$$;
