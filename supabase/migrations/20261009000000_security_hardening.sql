-- 1. own_references: restrictive policies requiring every referenced id (wallet, category, label,
--    parent category, recurring payment, transaction) to belong to the caller on insert/update.
--    Without them, a user could attach rows to another user's wallet (ON DELETE RESTRICT), so the
--    owner couldn't delete that wallet, wipe their data or delete their account.
-- 2. report_bug(): max 5 reports per user per hour, tracked in bug_report_log (no API access).
-- Remove: drop policy own_references on each table below; drop function public.is_my_category(uuid);
--   drop table public.bug_report_log; re-run 20261008000000_report_bug_discord.sql.

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

-- A policy on categories can't query categories (infinite recursion), so the parent check uses this.
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

  -- Per-user lock, so parallel calls can't all pass the 5-per-hour check.
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
