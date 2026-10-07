-- Security hardening from the October 2026 review.
--
-- 1. Cross-user references. The existing "own rows" policies only check the
--    row's own user_id, not the ids it points at. A user calling the API
--    directly could save a transaction against someone else's wallet_id (or
--    tag it with someone else's label, etc.) as long as they knew the uuid.
--    Nothing would be readable that way (the other user's rows stay hidden by
--    RLS), but it would let them confirm an id exists and, worse, block the
--    owner: wallets are ON DELETE RESTRICT, so the owner could no longer delete
--    that wallet, wipe their data or delete their account.
--    A RESTRICTIVE policy per table now requires every referenced id to belong
--    to the caller on insert and update. Restrictive policies are AND-ed with
--    the existing ones, so nothing gets looser, and reads are unaffected
--    (using (true)).
--
-- 2. report_bug() rate limit. Any signed-in user could call it in a loop and
--    flood the Discord channel (and get the webhook rate-limited or disabled).
--    It now allows 5 reports per user per hour. Only the send times are kept,
--    in bug_report_log, which has RLS on and no policies, so the API can't read
--    or change it; rows older than an hour are removed on the next call and all
--    of a user's rows go with their auth user.
--
-- To remove:
--   do $$ declare t text; begin
--     foreach t in array array['transactions','templates','recurring_payments','recurring_occurrences',
--       'categories','transaction_labels','template_labels','recurring_payment_labels'] loop
--       execute format('drop policy if exists own_references on public.%I', t);
--     end loop; end $$;
--   drop function public.is_my_category(uuid);
--   -- re-run 20261008000000_report_bug_discord.sql to restore report_bug()
--   drop table public.bug_report_log;

-- ─── 1. Referenced ids must belong to the caller ─────────────────────────────

drop policy if exists own_references on public.transactions;
create policy own_references on public.transactions
  as restrictive for all to authenticated
  using (true)
  with check (
    exists (select 1 from public.wallets w where w.id = transactions.wallet_id and w.user_id = (select auth.uid()))
    and (transactions.category_id is null or exists (
      select 1 from public.categories c where c.id = transactions.category_id and c.user_id = (select auth.uid())))
  );

drop policy if exists own_references on public.templates;
create policy own_references on public.templates
  as restrictive for all to authenticated
  using (true)
  with check (
    (templates.wallet_id is null or exists (
      select 1 from public.wallets w where w.id = templates.wallet_id and w.user_id = (select auth.uid())))
    and (templates.category_id is null or exists (
      select 1 from public.categories c where c.id = templates.category_id and c.user_id = (select auth.uid())))
  );

drop policy if exists own_references on public.recurring_payments;
create policy own_references on public.recurring_payments
  as restrictive for all to authenticated
  using (true)
  with check (
    (recurring_payments.wallet_id is null or exists (
      select 1 from public.wallets w where w.id = recurring_payments.wallet_id and w.user_id = (select auth.uid())))
    and (recurring_payments.category_id is null or exists (
      select 1 from public.categories c where c.id = recurring_payments.category_id and c.user_id = (select auth.uid())))
  );

drop policy if exists own_references on public.recurring_occurrences;
create policy own_references on public.recurring_occurrences
  as restrictive for all to authenticated
  using (true)
  with check (
    exists (
      select 1 from public.recurring_payments p
      where p.id = recurring_occurrences.recurring_payment_id and p.user_id = (select auth.uid()))
    and (recurring_occurrences.transaction_id is null or exists (
      select 1 from public.transactions t where t.id = recurring_occurrences.transaction_id and t.user_id = (select auth.uid())))
  );

-- A policy on categories can't query categories itself (infinite recursion),
-- so the parent check goes through this helper. security definer only to skip
-- that recursion; it only ever answers for the caller's own rows.
create or replace function public.is_my_category(category_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.categories c
    where c.id = category_id and c.user_id = auth.uid()
  );
$$;

revoke execute on function public.is_my_category(uuid) from public, anon;
grant execute on function public.is_my_category(uuid) to authenticated;

drop policy if exists own_references on public.categories;
create policy own_references on public.categories
  as restrictive for all to authenticated
  using (true)
  with check (categories.parent_id is null or public.is_my_category(categories.parent_id));

drop policy if exists own_references on public.transaction_labels;
create policy own_references on public.transaction_labels
  as restrictive for all to authenticated
  using (true)
  with check (
    exists (select 1 from public.labels l where l.id = transaction_labels.label_id and l.user_id = (select auth.uid()))
  );

drop policy if exists own_references on public.template_labels;
create policy own_references on public.template_labels
  as restrictive for all to authenticated
  using (true)
  with check (
    exists (select 1 from public.labels l where l.id = template_labels.label_id and l.user_id = (select auth.uid()))
  );

drop policy if exists own_references on public.recurring_payment_labels;
create policy own_references on public.recurring_payment_labels
  as restrictive for all to authenticated
  using (true)
  with check (
    exists (select 1 from public.labels l where l.id = recurring_payment_labels.label_id and l.user_id = (select auth.uid()))
  );

-- ─── 2. report_bug() rate limit ──────────────────────────────────────────────

create table if not exists public.bug_report_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  sent_at timestamptz not null default now()
);

create index if not exists bug_report_log_user_sent_idx
  on public.bug_report_log (user_id, sent_at);

alter table public.bug_report_log enable row level security;
revoke all on public.bug_report_log from anon, authenticated;

create or replace function public.report_bug(
  message text,
  page text default null,
  user_agent text default null,
  can_contact boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  msg text := btrim(message);
  webhook_url text;
  reporter text;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if not public.mfa_satisfied() then
    raise exception 'Two-factor authentication required';
  end if;
  if msg is null or msg = '' then
    raise exception 'Please describe what went wrong.';
  end if;
  -- Discord limit: embed description 4096 characters.
  if char_length(msg) > 4000 then
    raise exception 'The report is too long (max 4000 characters).';
  end if;

  -- At most 5 reports per user per hour. The lock serialises concurrent calls
  -- from the same user so they can't all slip under the limit at once.
  perform pg_advisory_xact_lock(hashtext('report_bug:' || uid::text));
  delete from public.bug_report_log
    where user_id = uid and sent_at < now() - interval '1 hour';
  if (select count(*) from public.bug_report_log where user_id = uid) >= 5 then
    raise exception 'You''ve sent a lot of reports recently. Please try again in an hour.';
  end if;

  select s.decrypted_secret into webhook_url
  from vault.decrypted_secrets s
  where s.name = 'discord_bug_report_webhook'
  limit 1;

  if webhook_url is null then
    raise exception 'Bug reporting is not set up yet.';
  end if;

  select u.email into reporter from auth.users u where u.id = uid;

  insert into public.bug_report_log (user_id) values (uid);

  perform net.http_post(
    url := webhook_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'username', 'Purrfolio',
      'allowed_mentions', jsonb_build_object('parse', '[]'::jsonb),
      'embeds', jsonb_build_array(jsonb_build_object(
        'title', '🐞 New bug report',
        'description', msg,
        'color', 7615462, -- #7433e6, the app's accent
        'timestamp', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        -- Discord limit: field value 1024 characters.
        'fields', jsonb_build_array(
          jsonb_build_object('name', 'From', 'value', coalesce(reporter, 'Unknown'), 'inline', true),
          jsonb_build_object('name', 'Contact', 'value',
            case when coalesce(can_contact, false) then '✅ OK to email' else '🚫 Don''t email' end, 'inline', true),
          jsonb_build_object('name', 'Page', 'value', left(coalesce(nullif(page, ''), '—'), 200), 'inline', true),
          jsonb_build_object('name', 'Browser', 'value', left(coalesce(nullif(user_agent, ''), '—'), 1000))
        )
      ))
    )
  );
end;
$$;

revoke execute on function public.report_bug(text, text, text, boolean) from public, anon;
grant execute on function public.report_bug(text, text, text, boolean) to authenticated;
