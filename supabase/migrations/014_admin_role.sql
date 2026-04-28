-- GAL-162: replace hardcoded admin email with role-based auth.
-- Adds is_admin to public.users. Promoting/demoting admins is a SQL update,
-- not a code deploy. Writes are blocked from regular clients (no RLS policy
-- for update/insert) — flip via service role / SQL editor only.

alter table public.users
  add column if not exists is_admin boolean not null default false;

-- Seed the current admin.
update public.users set is_admin = true where email = 'tim@muky-kids.com';

-- Existing users RLS already lets users read their own row. is_admin rides
-- on that policy, so no extra policy is needed for reads. Updates have no
-- policy → service role only.
