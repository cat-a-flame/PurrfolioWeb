-- User roles, for showing or hiding parts of the app per role.
--
--   * user_roles: one optional row per user. No row means the default role
--     'user', so new sign-ups need nothing. Roles are only ever granted from
--     the SQL editor (see the bottom of this file); there are no insert/update
--     policies, so nobody can promote themselves through the API.
--   * is_admin(): true when the caller has the 'admin' role. Use it in RLS
--     policies that admins should bypass.
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

-- Make yourself admin (replace the email, then run once):
--   insert into public.user_roles (user_id, role)
--   select id, 'admin' from auth.users where email = 'you@example.com'
--   on conflict (user_id) do update set role = excluded.role;
