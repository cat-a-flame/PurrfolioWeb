-- report_bug(): sends a bug report straight to a Discord channel. Nothing is
-- stored in the database.
--
--   * The app calls it with the message, the current page and the browser's
--     user agent; the function adds the reporter's email and posts it to a
--     Discord webhook with pg_net (queued and sent in the background).
--   * The webhook URL lives in Supabase Vault as 'discord_bug_report_webhook'
--     (see the bottom of this file), never in the repo.
--   * Earlier versions of this branch saved reports in a bug_reports table and
--     posted them from a trigger; that table and trigger are dropped here.
--
-- Safety:
--   * security definer so it can read the secret and the caller's email; it
--     only ever uses auth.uid(), never a user id passed in.
--   * Only signed-in users may call it, with the same 2FA rule as the data
--     tables (mfa_satisfied()).
--   * allowed_mentions is empty, so text like "@everyone" in a report can't
--     ping the channel.
--   * pg_net keeps Discord's responses for a few hours (net._http_response);
--     Discord's reply to a webhook is empty, so the report text isn't kept.
--
-- To remove:
--   drop function public.report_bug(text, text, text);
--   delete from vault.secrets where name = 'discord_bug_report_webhook';

drop table if exists public.bug_reports;
drop function if exists public.notify_bug_report_discord();

create extension if not exists pg_net;

create or replace function public.report_bug(message text, page text default null, user_agent text default null)
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
          jsonb_build_object('name', 'Page', 'value', left(coalesce(nullif(page, ''), '—'), 200), 'inline', true),
          jsonb_build_object('name', 'Browser', 'value', left(coalesce(nullif(user_agent, ''), '—'), 1000))
        )
      ))
    )
  );
end;
$$;

revoke execute on function public.report_bug(text, text, text) from public, anon;
grant execute on function public.report_bug(text, text, text) to authenticated;

-- Store the webhook URL (run once, with your URL; never commit it):
--   select vault.create_secret('https://discord.com/api/webhooks/...', 'discord_bug_report_webhook');
-- To change it later:
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'discord_bug_report_webhook'),
--     'https://discord.com/api/webhooks/...'
--   );
