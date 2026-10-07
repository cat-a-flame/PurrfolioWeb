-- report_bug(): posts a bug report to the Discord webhook stored in Vault as
--   'discord_bug_report_webhook'. Nothing is stored in the database.
-- security definer to read the secret and the caller's email. Signed-in callers only, with the
--   2FA check. allowed_mentions is empty, so "@everyone" in a report can't ping the channel.
-- Remove: drop function public.report_bug(text, text, text, boolean);
--   delete from vault.secrets where name = 'discord_bug_report_webhook';

drop table if exists public.bug_reports;
drop function if exists public.notify_bug_report_discord();
-- Earlier signature without can_contact.
drop function if exists public.report_bug(text, text, text);

create extension if not exists pg_net;

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

  select s.decrypted_secret into webhook_url
  from vault.decrypted_secrets s
  where s.name = 'discord_bug_report_webhook'
  limit 1;

  if webhook_url is null then
    raise exception 'Bug reporting is not set up yet.';
  end if;

  select u.email into reporter from auth.users u where u.id = uid;

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

-- Store the webhook URL (run once, with your URL; never commit it):
--   select vault.create_secret('https://discord.com/api/webhooks/...', 'discord_bug_report_webhook');
-- To change it later:
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'discord_bug_report_webhook'),
--     'https://discord.com/api/webhooks/...'
--   );
