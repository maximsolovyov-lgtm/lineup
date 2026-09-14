-- Part 6: row-level security and grants.
--
-- Roles (decisions 2026-09-14):
--   admin    — everything, including user management.
--   operator — select/insert/update on all business tables, including
--              deactivation (status change); no writes to app_user_profile.
--   anon     — nothing.
-- There is no hard delete for anyone; "deactivate" is a status change.
-- Deactivated users (status <> active) fail is_operator_or_admin() and lose
-- all business-data access, but can still read their own profile row so the
-- UI can tell them why.

-- Tighten Supabase's default grants. Supabase grants anon/authenticated ALL
-- on public tables by default privileges; we want an explicit allow-list.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

grant usage on schema public to authenticated;
grant execute on function
  public.current_app_role(),
  public.is_admin(),
  public.is_operator_or_admin(),
  public.normalize_name(text),
  public.is_valid_rooms_json(jsonb)
to authenticated;

-- app_user_profile ----------------------------------------------------------
alter table public.app_user_profile enable row level security;
grant select, insert, update on public.app_user_profile to authenticated;

create policy app_user_profile_select on public.app_user_profile
  for select to authenticated
  using (user_id = auth.uid() or public.is_operator_or_admin());

create policy app_user_profile_insert on public.app_user_profile
  for insert to authenticated
  with check (public.is_admin());

create policy app_user_profile_update on public.app_user_profile
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Business tables -----------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'place', 'event', 'event_occurrence', 'place_space', 'artist',
    'evidence_source', 'performance_set', 'performance_set_participant'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);

    execute format($p$
      create policy %I on public.%I
        for select to authenticated
        using (public.is_operator_or_admin())
    $p$, t || '_select', t);

    execute format($p$
      create policy %I on public.%I
        for insert to authenticated
        with check (public.is_operator_or_admin())
    $p$, t || '_insert', t);

    execute format($p$
      create policy %I on public.%I
        for update to authenticated
        using (public.is_operator_or_admin())
        with check (public.is_operator_or_admin())
    $p$, t || '_update', t);
  end loop;
end
$$;

-- Prevent future migrations from silently re-granting to anon.
alter default privileges in schema public revoke all on tables from anon;
