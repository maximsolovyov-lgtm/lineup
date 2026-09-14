-- Creates (or repairs) the application profile for an existing Auth user and
-- makes them an admin.
--
-- Needed when a user was invited BEFORE the migrations were applied: the
-- trigger that creates app_user_profile rows on auth.users insert did not
-- exist yet, so that user signs in successfully but has no profile.
--
-- Run in the Supabase SQL Editor. Replace the email on the last line.

insert into public.app_user_profile (user_id, email, full_name, role, status)
select id,
       email,
       coalesce(raw_app_meta_data ->> 'full_name', raw_user_meta_data ->> 'full_name'),
       'admin',
       'active'
  from auth.users
 where email = 'REPLACE_WITH_YOUR_EMAIL'
on conflict (user_id) do update
   set role   = 'admin',
       status = 'active';

-- Verify: expect one row, role = admin, status = active.
select p.email, p.role, p.status, p.created_at
  from public.app_user_profile p
 where p.email = 'REPLACE_WITH_YOUR_EMAIL';
