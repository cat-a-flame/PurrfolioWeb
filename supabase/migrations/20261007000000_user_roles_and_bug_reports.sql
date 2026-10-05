-- User roles, plus a bug_reports table for the in-app "Report a bug" button.
--
--   * user_roles: one optional row per user. No row means the default role
--     'user', so new sign-ups need nothing. Roles are only ever granted from
--     the SQL editor (see the bottom of this file); there are no insert/update
--     policies, so nobody can promote themselves through the API.
--   * is_admin(): true when the caller has the 'admin' role. Use it in RLS
--     policies that admins should bypass.
--   * bug_reports: anyone signed in can file a report for themselves; only
--     admins can read them.
--
-- Roles describe who someone is (owner/admin vs regular user). Paid features
-- (tips now, maybe a subscription later) should get their own table rather
-- than new roles, so a user can be both e.g. an admin and a supporter.
--
-- Safety:
--   * is_admin() is security definer so it can be used inside policies on
--     user_roles itself without recursion; it takes no arguments and only
--     looks at the caller's own row.
--   * Rows are removed with the auth user (on delete cascade), so
--     delete_my_account() needs no change.
--
-- To remove:
--   drop table public.bug_reports;
--   drop function public.is_admin();
--   drop table public.user_roles;

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;

drop policy if exists "Users can read their own role" on public.user_roles;
create policy "Users can read their own role"
  on public.user_roles for select
  to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles r
    where r.user_id = auth.uid()
      and r.role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  message text not null check (char_length(message) between 1 and 5000),
  page text,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.bug_reports enable row level security;

drop policy if exists "Users can file their own bug reports" on public.bug_reports;
create policy "Users can file their own bug reports"
  on public.bug_reports for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Admins can read bug reports" on public.bug_reports;
create policy "Admins can read bug reports"
  on public.bug_reports for select
  to authenticated
  using ((select public.is_admin()));

-- Same 2FA rule as the other user tables (see 20261006000000_require_mfa.sql).
drop policy if exists require_mfa on public.bug_reports;
create policy require_mfa on public.bug_reports as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

-- Make yourself admin (replace the email, then run once):
--   insert into public.user_roles (user_id, role)
--   select id, 'admin' from auth.users where email = 'you@example.com'
--   on conflict (user_id) do update set role = excluded.role;
