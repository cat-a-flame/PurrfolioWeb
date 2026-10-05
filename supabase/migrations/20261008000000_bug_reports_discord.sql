-- Posts every new bug report to a Discord channel.
--
--   * An after-insert trigger on bug_reports sends the report to a Discord
--     webhook with pg_net. The request is queued and sent in the background,
--     so the user's insert never waits on (or fails because of) Discord.
--   * The channel is a forum channel, so each report becomes its own post,
--     titled with the first line of the message (thread_name). If the webhook
--     is ever moved to a normal text channel, drop thread_name from the body.
--   * The webhook URL lives in Supabase Vault as 'discord_bug_report_webhook'
--     (see the bottom of this file), never in the repo. With no secret set,
--     reports are still saved and nothing is sent.
--
-- Safety:
--   * The function is security definer so it can read the secret and the
--     reporter's email; it only ever handles the row being inserted.
--   * allowed_mentions is empty, so text like "@everyone" in a report can't
--     ping the channel.
--   * Any error is turned into a warning, so a broken webhook never blocks
--     saving the report.
--
-- To remove:
--   drop trigger if exists notify_discord on public.bug_reports;
--   drop function public.notify_bug_report_discord();
--   delete from vault.secrets where name = 'discord_bug_report_webhook';

create extension if not exists pg_net;

create or replace function public.notify_bug_report_discord()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  webhook_url text;
  reporter text;
  first_line text;
begin
  select s.decrypted_secret into webhook_url
  from vault.decrypted_secrets s
  where s.name = 'discord_bug_report_webhook'
  limit 1;

  if webhook_url is null then
    return new;
  end if;

  select u.email into reporter from auth.users u where u.id = new.user_id;

  -- Forum post title: first line of the report, whitespace collapsed.
  first_line := btrim(regexp_replace(split_part(btrim(new.message), E'\n', 1), '\s+', ' ', 'g'));
  if first_line = '' then
    first_line := 'Bug report';
  elsif char_length(first_line) > 90 then
    first_line := left(first_line, 89) || '…';
  end if;

  perform net.http_post(
    url := webhook_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'username', 'Purrfolio',
      -- Discord limit: 100 characters.
      'thread_name', '🐞 ' || first_line,
      'allowed_mentions', jsonb_build_object('parse', '[]'::jsonb),
      'embeds', jsonb_build_array(jsonb_build_object(
        'title', '🐞 New bug report',
        -- Discord limits: description 4096, field value 1024 characters.
        'description', left(new.message, 4000),
        'color', 7615462, -- #7433e6, the app's accent
        'timestamp', to_char(new.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'fields', jsonb_build_array(
          jsonb_build_object('name', 'From', 'value', coalesce(reporter, 'Unknown'), 'inline', true),
          jsonb_build_object('name', 'Page', 'value', coalesce(nullif(new.page, ''), '—'), 'inline', true),
          jsonb_build_object('name', 'Browser', 'value', left(coalesce(nullif(new.user_agent, ''), '—'), 1000))
        )
      ))
    )
  );

  return new;
exception when others then
  raise warning 'Discord bug report notification failed: %', sqlerrm;
  return new;
end;
$$;

revoke execute on function public.notify_bug_report_discord() from public, anon, authenticated;

drop trigger if exists notify_discord on public.bug_reports;
create trigger notify_discord
  after insert on public.bug_reports
  for each row execute function public.notify_bug_report_discord();

-- Store the webhook URL (run once, with your URL; never commit it):
--   select vault.create_secret('https://discord.com/api/webhooks/...', 'discord_bug_report_webhook');
-- To change it later:
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'discord_bug_report_webhook'),
--     'https://discord.com/api/webhooks/...'
--   );
