-- delete_my_data(): deletes all of the caller's rows, keeps the login.
-- delete_my_account(): same, then deletes the caller's auth user.
-- Both act only on auth.uid(). security definer to delete from auth.users; search_path is ''.
-- Remove: drop function public.delete_my_account(); drop function public.delete_my_data();

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
