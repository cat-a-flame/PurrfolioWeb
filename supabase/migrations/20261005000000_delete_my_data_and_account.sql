-- Lets a signed-in user wipe their own data, or delete their account entirely.
--
--   * delete_my_data():    removes every row the caller owns (transactions,
--                          recurring payments, templates, accounts/wallets,
--                          categories, labels and their link tables) but keeps
--                          the login.
--   * delete_my_account(): does the same, then removes the caller's auth user.
--
-- Safety:
--   * Both only ever act on auth.uid(); they take no user id argument, so they
--     can't be pointed at anyone else's data.
--   * security definer is needed to delete from auth.users (and lets the wipe
--     run regardless of per-table delete policies); search_path is pinned to ''
--     and every name is schema-qualified.
--   * Each call runs in one transaction: if any step fails, nothing is deleted.
--   * Only the authenticated role may call them.
--
-- To remove:
--   drop function public.delete_my_account();
--   drop function public.delete_my_data();

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

  perform public.delete_my_data();
  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_my_data() from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_data() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
