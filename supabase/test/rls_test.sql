-- RLS and constraint tests. Run against a database that has auth_stub.sql,
-- the migrations and seed.sql applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/test/rls_test.sql
-- Exits non-zero if any test fails.

create schema if not exists test;
drop table if exists test.results;
create table test.results (n serial, name text, passed boolean, detail text);

-- Runs p_sql as the given auth user (anon when null) and records whether the
-- outcome matched p_expect_ok. Uses the same request.jwt.claims mechanism
-- PostgREST uses, so auth.uid() inside policies resolves to p_user.
create or replace function test.run(p_name text, p_user uuid, p_sql text, p_expect_ok boolean)
returns void
language plpgsql
as $$
declare
  v_ok     boolean := true;
  v_detail text    := 'ok';
begin
  if p_user is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('role', 'anon', true);
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
  end if;

  begin
    execute p_sql;
  exception when others then
    v_ok := false;
    v_detail := sqlstate || ': ' || sqlerrm;
  end;

  perform set_config('role', 'none', true);

  insert into test.results (name, passed, detail)
  values (p_name, v_ok = p_expect_ok,
          format('expected %s, got %s (%s)',
                 case when p_expect_ok then 'ok' else 'error' end,
                 case when v_ok then 'ok' else 'error' end,
                 v_detail));
end;
$$;

-- Fixtures ------------------------------------------------------------------
\set admin_id    '''00000000-0000-4000-8000-000000000001'''
\set operator_id '''00000000-0000-4000-8000-000000000002'''
\set inactive_id '''00000000-0000-4000-8000-000000000003'''

insert into auth.users (id, email, raw_app_meta_data)
values (:inactive_id, 'inactive@lineapp.local', '{"app_role":"operator"}')
on conflict (id) do nothing;
update public.app_user_profile set status = 'inactive' where user_id = :inactive_id;

-- Access control --------------------------------------------------------------
select test.run('anon cannot read place', null,
  $q$ select count(*) from public.place $q$, false);

select test.run('operator reads all seeded places', :operator_id,
  $q$ do $x$ begin
        if (select count(*) from public.place) <> 3 then
          raise exception 'expected 3 places, saw %', (select count(*) from public.place);
        end if;
      end $x$ $q$, true);

select test.run('operator can insert a place', :operator_id,
  $q$ insert into public.place (name, city, country) values ('Test Venue', 'Ibiza', 'Spain') $q$, true);

select test.run('operator can deactivate a place', :operator_id,
  $q$ do $x$ begin
        update public.place set status = 'inactive' where name = 'Test Venue';
        if (select status from public.place where name = 'Test Venue') <> 'inactive' then
          raise exception 'status did not change';
        end if;
      end $x$ $q$, true);

select test.run('operator cannot insert a user profile', :operator_id,
  $q$ insert into public.app_user_profile (user_id, email) values (gen_random_uuid(), 'x@y.z') $q$, false);

select test.run('operator cannot escalate own role (update is a no-op)', :operator_id,
  $q$ do $x$ begin
        update public.app_user_profile set role = 'admin' where user_id = auth.uid();
        if (select role from public.app_user_profile where user_id = auth.uid()) = 'admin' then
          raise exception 'ESCALATED';
        end if;
      end $x$ $q$, true);

select test.run('operator can read colleague profiles (for created-by display)', :operator_id,
  $q$ do $x$ begin
        if (select count(*) from public.app_user_profile) < 2 then
          raise exception 'expected to see other profiles';
        end if;
      end $x$ $q$, true);

select test.run('admin can change an operator role', :admin_id,
  $q$ do $x$ begin
        update public.app_user_profile set role = 'admin' where user_id = '00000000-0000-4000-8000-000000000002';
        if (select role from public.app_user_profile where user_id = '00000000-0000-4000-8000-000000000002') <> 'admin' then
          raise exception 'role did not change';
        end if;
        update public.app_user_profile set role = 'operator' where user_id = '00000000-0000-4000-8000-000000000002';
      end $x$ $q$, true);

select test.run('admin cannot demote self', :admin_id,
  $q$ update public.app_user_profile set role = 'operator' where user_id = auth.uid() $q$, false);

select test.run('admin cannot deactivate self', :admin_id,
  $q$ update public.app_user_profile set status = 'inactive' where user_id = auth.uid() $q$, false);

select test.run('deactivated user sees no places', :inactive_id,
  $q$ do $x$ begin
        if (select count(*) from public.place) <> 0 then
          raise exception 'inactive user can see places';
        end if;
      end $x$ $q$, true);

select test.run('deactivated user can still read own profile', :inactive_id,
  $q$ do $x$ begin
        if (select count(*) from public.app_user_profile where user_id = auth.uid()) <> 1 then
          raise exception 'cannot read own profile';
        end if;
      end $x$ $q$, true);

select test.run('deactivated user cannot insert a place', :inactive_id,
  $q$ insert into public.place (name) values ('Sneaky') $q$, false);

select test.run('nobody can hard-delete a place (admin)', :admin_id,
  $q$ delete from public.place where name = 'Test Venue' $q$, false);

select test.run('nobody can hard-delete a place (operator)', :operator_id,
  $q$ delete from public.place where name = 'Test Venue' $q$, false);

-- Place constraints and derived columns ------------------------------------------
select test.run('rooms json: missing is_headliner_room rejected', :operator_id,
  $q$ insert into public.place (name, typical_rooms_json)
      values ('Bad Rooms 1', '[{"name":"Room A"}]') $q$, false);

select test.run('rooms json: unknown key rejected', :operator_id,
  $q$ insert into public.place (name, typical_rooms_json)
      values ('Bad Rooms 2', '[{"name":"Room A","is_headliner_room":true,"colour":"red"}]') $q$, false);

select test.run('rooms json: negative capacity rejected', :operator_id,
  $q$ insert into public.place (name, typical_rooms_json)
      values ('Bad Rooms 3', '[{"name":"Room A","is_headliner_room":true,"capacity":-5}]') $q$, false);

select test.run('rooms json: object instead of array rejected', :operator_id,
  $q$ insert into public.place (name, typical_rooms_json)
      values ('Bad Rooms 4', '{"name":"Room A","is_headliner_room":true}') $q$, false);

select test.run('rooms json: valid shape sets typical_room_count', :operator_id,
  $q$ do $x$ begin
        insert into public.place (name, typical_rooms_json, typical_room_count)
        values ('Good Rooms', '[{"name":"A","is_headliner_room":true,"capacity":500},{"name":"B","is_headliner_room":false,"notes":"outdoor"}]', 99);
        if (select typical_room_count from public.place where name = 'Good Rooms') <> 2 then
          raise exception 'typical_room_count not derived';
        end if;
      end $x$ $q$, true);

select test.run('normalized_name strips accents and punctuation', :operator_id,
  $q$ do $x$ begin
        insert into public.place (name) values ('Hï Ibiza – Club!');
        if (select normalized_name from public.place where name = 'Hï Ibiza – Club!') <> 'hi ibiza club' then
          raise exception 'got %', (select normalized_name from public.place where name = 'Hï Ibiza – Club!');
        end if;
      end $x$ $q$, true);

select test.run('client cannot forge created_by_user_id', :operator_id,
  $q$ do $x$ begin
        insert into public.place (name, created_by_user_id) values ('Forged', '00000000-0000-4000-8000-000000000001');
        if (select created_by_user_id from public.place where name = 'Forged') <> auth.uid() then
          raise exception 'created_by was not overwritten';
        end if;
      end $x$ $q$, true);

select test.run('update stamps updated_by and preserves created_by', :admin_id,
  $q$ do $x$ begin
        update public.place set city = 'Somewhere' where name = 'Forged';
        if (select updated_by_user_id from public.place where name = 'Forged') <> auth.uid()
           or (select created_by_user_id from public.place where name = 'Forged') <> '00000000-0000-4000-8000-000000000002' then
          raise exception 'audit columns wrong';
        end if;
      end $x$ $q$, true);

select test.run('invalid instagram handle rejected', :operator_id,
  $q$ insert into public.place (name, instagram_account) values ('Bad IG', 'has spaces!') $q$, false);

select test.run('place cannot be its own parent', :operator_id,
  $q$ do $x$ declare v uuid; begin
        select place_id into v from public.place where name = 'Forged';
        update public.place set parent_place_id = v where place_id = v;
      end $x$ $q$, false);

-- Roadmap tables: constraints only (no UI in MVP v1) ------------------------------
select test.run('roadmap: event/occurrence/space/set with matching place_space', :operator_id,
  $q$ do $x$
      declare v_event uuid; v_occ uuid; v_unvrs uuid; v_space uuid;
      begin
        select place_id into v_unvrs from public.place where name = 'UNVRS';
        insert into public.event (name, event_type) values ('Fisher presents', 'party') returning event_id into v_event;
        insert into public.event_occurrence (event_id, primary_place_id, starts_at, ends_at)
          values (v_event, v_unvrs, '2026-07-15 23:30+02', '2026-07-16 06:00+02') returning occurrence_id into v_occ;
        insert into public.place_space (place_id, name) values (v_unvrs, 'Main Room') returning space_id into v_space;
        insert into public.performance_set
          (occurrence_id, place_space_id, scenario_type, scenario_version, set_type, scheduled_start_at, scheduled_end_at)
          values (v_occ, v_space, 'official', 1, 'group', '2026-07-15 23:30+02', '2026-07-16 06:00+02');
      end $x$ $q$, true);

select test.run('roadmap: place_space from another place rejected', :operator_id,
  $q$ do $x$
      declare v_occ uuid; v_fabric uuid; v_space uuid;
      begin
        select occurrence_id into v_occ from public.event_occurrence limit 1;
        select place_id into v_fabric from public.place where name = 'fabric';
        insert into public.place_space (place_id, name) values (v_fabric, 'Room 1') returning space_id into v_space;
        insert into public.performance_set
          (occurrence_id, place_space_id, scenario_type, scenario_version, set_type, scheduled_start_at, scheduled_end_at)
          values (v_occ, v_space, 'official', 1, 'group', '2026-07-15 23:30+02', '2026-07-16 06:00+02');
      end $x$ $q$, false);

select test.run('roadmap: set ending before it starts rejected', :operator_id,
  $q$ do $x$ declare v_occ uuid; begin
        select occurrence_id into v_occ from public.event_occurrence limit 1;
        insert into public.performance_set
          (occurrence_id, scenario_type, scenario_version, set_type, scheduled_start_at, scheduled_end_at)
          values (v_occ, 'predicted', 1, 'single_artist_set', '2026-07-16 06:00+02', '2026-07-16 03:00+02');
      end $x$ $q$, false);

select test.run('roadmap: participant with neither artist nor label rejected', :operator_id,
  $q$ do $x$ declare v_set uuid; begin
        select performance_set_id into v_set from public.performance_set limit 1;
        insert into public.performance_set_participant (performance_set_id) values (v_set);
      end $x$ $q$, false);

select test.run('roadmap: TBD placeholder participant accepted', :operator_id,
  $q$ do $x$ declare v_set uuid; begin
        select performance_set_id into v_set from public.performance_set limit 1;
        insert into public.performance_set_participant (performance_set_id, participant_role, display_name_override)
          values (v_set, 'placeholder', 'TBD');
      end $x$ $q$, true);

select test.run('roadmap: invalid artist_type rejected', :operator_id,
  $q$ insert into public.artist (name, artist_type) values ('X', 'orchestra') $q$, false);

-- Report -------------------------------------------------------------------------
\echo
\echo '=== RLS / constraint test results ==='
select case when passed then 'PASS' else 'FAIL' end as result, name,
       case when passed then '' else detail end as detail
  from test.results order by n;

select format('%s passed, %s failed', count(*) filter (where passed), count(*) filter (where not passed))
  from test.results;

do $$
begin
  if exists (select 1 from test.results where not passed) then
    raise exception 'RLS tests failed';
  end if;
end
$$;
