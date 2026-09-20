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
        insert into public.event_occurrence (event_id, primary_place_id, event_date, starts_at, ends_at)
          values (v_event, v_unvrs, '2026-07-15', '2026-07-15 23:30+02', '2026-07-16 06:00+02') returning occurrence_id into v_occ;
        select space_id into v_space from public.place_space where place_id = v_unvrs and is_primary and status = 'active';
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
        select space_id into v_space from public.place_space where place_id = v_fabric and is_primary and status = 'active';
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

-- Rooms on place_space (Phase 3b) ---------------------------------------------------
select test.run('rooms: seed created one primary room per venue', :operator_id,
  $q$ do $x$ begin
        if (select count(*) from public.place_space where is_primary and status = 'active') <> 3
           or (select count(*) from public.place_space where status = 'active') <> 8 then
          raise exception 'expected 8 active rooms with 3 primaries, saw % / %',
            (select count(*) from public.place_space where status = 'active'),
            (select count(*) from public.place_space where is_primary and status = 'active');
        end if;
      end $x$ $q$, true);

select test.run('rooms: second primary room in one place rejected', :operator_id,
  $q$ insert into public.place_space (place_id, name, is_primary)
      select place_id, 'Second Primary', true from public.place where name = 'UNVRS' $q$, false);

select test.run('rooms: a room referenced by a performance_set cannot be deactivated', :operator_id,
  $q$ update public.place_space set status = 'inactive'
      where is_primary and place_id = (select place_id from public.place where name = 'UNVRS') $q$, false);

select test.run('rooms: an unreferenced room can be deactivated', :operator_id,
  $q$ do $x$ declare v uuid; begin
        select s.space_id into v from public.place_space s join public.place p on p.place_id = s.place_id
         where p.name = 'UNVRS' and not s.is_primary and s.status = 'active';
        update public.place_space set status = 'inactive' where space_id = v;
        update public.place_space set status = 'active' where space_id = v;
      end $x$ $q$, true);

select test.run('rooms: anon cannot call save_place_with_spaces', null,
  $q$ select public.save_place_with_spaces('{"name":"Anon Venue"}'::jsonb, '[]'::jsonb) $q$, false);

select test.run('rooms: save_place_with_spaces creates place and rooms in one call', :operator_id,
  $q$ do $x$ declare v uuid; begin
        v := public.save_place_with_spaces(
          '{"name":"RPC Venue","city":"Berlin","country":"Germany","lifecycle_type":"permanent","status":"active","capacity":"1500"}'::jsonb,
          '[{"name":"Floor","is_primary":true,"capacity":"500","space_type":"main_room"},{"name":"Garden","space_type":"outdoor","notes":"summer only"}]'::jsonb);
        if (select count(*) from public.place_space where place_id = v and status = 'active') <> 2
           or (select name from public.place_space where place_id = v and is_primary) <> 'Floor'
           or (select display_order from public.place_space where place_id = v and name = 'Garden') <> 2
           or (select created_by_user_id from public.place where place_id = v) <> auth.uid() then
          raise exception 'rooms not saved as expected';
        end if;
      end $x$ $q$, true);

select test.run('rooms: save moves the primary flag and deactivates a room left out', :operator_id,
  $q$ do $x$ declare v uuid; v_garden uuid; begin
        select place_id into v from public.place where name = 'RPC Venue';
        select space_id into v_garden from public.place_space where place_id = v and name = 'Garden';
        perform public.save_place_with_spaces(
          jsonb_build_object('place_id', v, 'name', 'RPC Venue', 'city', 'Berlin', 'lifecycle_type', 'permanent', 'status', 'active'),
          jsonb_build_array(jsonb_build_object('space_id', v_garden, 'name', 'Garden', 'is_primary', true)));
        if (select status from public.place_space where place_id = v and name = 'Floor') <> 'inactive'
           or (select is_primary from public.place_space where space_id = v_garden) is not true
           or (select count(*) from public.place_space where place_id = v and is_primary and status = 'active') <> 1 then
          raise exception 'primary move or deactivation failed';
        end if;
      end $x$ $q$, true);

select test.run('rooms: two primary rooms in one call rejected', :operator_id,
  $q$ select public.save_place_with_spaces('{"name":"Two Primaries"}'::jsonb,
        '[{"name":"A","is_primary":true},{"name":"B","is_primary":true}]'::jsonb) $q$, false);

select test.run('rooms: duplicate room names in one call rejected', :operator_id,
  $q$ select public.save_place_with_spaces('{"name":"Atomic Venue"}'::jsonb,
        '[{"name":"Room A"},{"name":"room a"}]'::jsonb) $q$, false);

select test.run('rooms: the failed save left no place behind', :operator_id,
  $q$ do $x$ begin
        if exists (select 1 from public.place where name in ('Atomic Venue', 'Two Primaries')) then
          raise exception 'half-saved place exists';
        end if;
      end $x$ $q$, true);

select test.run('rooms: a room of another place cannot be passed as this place''s room', :operator_id,
  $q$ do $x$ declare v uuid; v_other uuid; begin
        select place_id into v from public.place where name = 'RPC Venue';
        select s.space_id into v_other from public.place_space s join public.place p on p.place_id = s.place_id
         where p.name = 'fabric' and s.is_primary;
        perform public.save_place_with_spaces(
          jsonb_build_object('place_id', v, 'name', 'RPC Venue'),
          jsonb_build_array(jsonb_build_object('space_id', v_other, 'name', 'Stolen')));
      end $x$ $q$, false);

select test.run('rooms: deactivated user cannot call save_place_with_spaces', :inactive_id,
  $q$ select public.save_place_with_spaces('{"name":"Sneaky RPC"}'::jsonb, '[]'::jsonb) $q$, false);

-- People, artists, events (Phases 4-5) ---------------------------------------------
select test.run('artists: anon cannot call save_artist_with_members', null,
  $q$ select public.save_artist_with_members('{"name":"Anon"}'::jsonb, '[]'::jsonb) $q$, false);

select test.run('artists: save creates artist, inline person and membership in one call', :operator_id,
  $q$ do $x$ declare v uuid; begin
        v := public.save_artist_with_members(
          '{"name":"Tale Of Us","artist_type":"duo","country":"IT"}'::jsonb,
          '[{"new_person":{"display_name":"Carmine Conte","country":"IT"},"membership_role":"dj","started_at":"2008-01-01"},
            {"new_person":{"display_name":"Matteo Milleri","country":"IT"},"membership_role":"dj"}]'::jsonb);
        if (select count(*) from public.artist_membership where artist_id = v and status = 'active') <> 2
           or (select count(*) from public.person where display_name in ('Carmine Conte','Matteo Milleri')) <> 2
           or exists (select 1 from public.review_task where entity_type = 'artist' and entity_id = v and status = 'active') then
          raise exception 'artist save not as expected';
        end if;
      end $x$ $q$, true);

select test.run('artists: type/member mismatch records a review_task and does not block', :operator_id,
  $q$ do $x$ declare v uuid; v_p uuid; begin
        select artist_id into v from public.artist where name = 'Tale Of Us';
        select person_id into v_p from public.person where display_name = 'Carmine Conte';
        perform public.save_artist_with_members(
          jsonb_build_object('artist_id', v, 'name', 'Tale Of Us', 'artist_type', 'solo'),
          jsonb_build_array(
            jsonb_build_object('person_id', v_p, 'membership_role', 'dj'),
            jsonb_build_object('person_id', (select person_id from public.person where display_name = 'Matteo Milleri'), 'membership_role', 'dj')));
        if (select count(*) from public.review_task where entity_type = 'artist' and entity_id = v
              and kind = 'artist_type_member_count' and status = 'active') <> 1 then
          raise exception 'review_task not recorded';
        end if;
      end $x$ $q$, true);

select test.run('artists: a consistent save closes the review_task and deactivates a member left out', :operator_id,
  $q$ do $x$ declare v uuid; v_p uuid; begin
        select artist_id into v from public.artist where name = 'Tale Of Us';
        select person_id into v_p from public.person where display_name = 'Carmine Conte';
        perform public.save_artist_with_members(
          jsonb_build_object('artist_id', v, 'name', 'Tale Of Us', 'artist_type', 'solo'),
          jsonb_build_array(jsonb_build_object('person_id', v_p, 'membership_role', 'dj')));
        if exists (select 1 from public.review_task where entity_type = 'artist' and entity_id = v and status = 'active')
           or (select count(*) from public.artist_membership where artist_id = v and status = 'active') <> 1
           or (select am.status from public.artist_membership am join public.person p on p.person_id = am.person_id
                where am.artist_id = v and p.display_name = 'Matteo Milleri') <> 'inactive' then
          raise exception 'review_task not closed or member not deactivated';
        end if;
      end $x$ $q$, true);

select test.run('artists: a membership of another artist cannot be passed as this artist''s', :operator_id,
  $q$ do $x$ declare v uuid; v_m uuid; begin
        v := public.save_artist_with_members('{"name":"Other Act","artist_type":"solo"}'::jsonb, '[]'::jsonb);
        select membership_id into v_m from public.artist_membership limit 1;
        perform public.save_artist_with_members(
          jsonb_build_object('artist_id', v, 'name', 'Other Act'),
          jsonb_build_array(jsonb_build_object('membership_id', v_m, 'person_id', (select person_id from public.artist_membership where membership_id = v_m))));
      end $x$ $q$, false);

select test.run('artists: member without person_id or new_person rejected', :operator_id,
  $q$ select public.save_artist_with_members('{"name":"Nobody"}'::jsonb, '[{"membership_role":"dj"}]'::jsonb) $q$, false);

select test.run('events: save creates event and two occurrences with business days', :operator_id,
  $q$ do $x$ declare v uuid; v_unvrs uuid; begin
        select place_id into v_unvrs from public.place where name = 'UNVRS';
        v := public.save_event_with_occurrences(
          '{"name":"Circoloco","event_type":"party","website_url":"https://circoloco.com"}'::jsonb,
          jsonb_build_array(
            jsonb_build_object('event_date', '2026-07-17', 'primary_place_id', v_unvrs, 'starts_at', '2026-07-17T23:30:00+02:00', 'ends_at', '2026-07-18T06:00:00+02:00', 'timezone', 'Europe/Madrid'),
            jsonb_build_object('event_date', '2026-07-24', 'primary_place_id', v_unvrs, 'starts_at', '2026-07-24T23:30:00+02:00', 'ends_at', '2026-07-25T06:00:00+02:00', 'timezone', 'Europe/Madrid')));
        if (select count(*) from public.event_occurrence where event_id = v and status = 'active') <> 2
           or (select min(event_date) from public.event_occurrence where event_id = v) <> '2026-07-17' then
          raise exception 'occurrences not saved';
        end if;
      end $x$ $q$, true);

select test.run('events: an occurrence left out becomes inactive, the other keeps its id', :operator_id,
  $q$ do $x$ declare v uuid; v_keep uuid; begin
        select event_id into v from public.event where name = 'Circoloco';
        select occurrence_id into v_keep from public.event_occurrence where event_id = v and event_date = '2026-07-17';
        perform public.save_event_with_occurrences(
          jsonb_build_object('event_id', v, 'name', 'Circoloco'),
          jsonb_build_array(jsonb_build_object('occurrence_id', v_keep, 'event_date', '2026-07-17', 'starts_at', '2026-07-17T23:30:00+02:00', 'ends_at', '2026-07-18T06:00:00+02:00')));
        if (select status from public.event_occurrence where event_id = v and event_date = '2026-07-24') <> 'inactive'
           or (select status from public.event_occurrence where occurrence_id = v_keep) <> 'active' then
          raise exception 'occurrence statuses wrong';
        end if;
      end $x$ $q$, true);

select test.run('events: an occurrence with a schedule cannot be removed from the list', :operator_id,
  $q$ do $x$ declare v uuid; begin
        select event_id into v from public.event where name = 'Fisher presents';
        perform public.save_event_with_occurrences(jsonb_build_object('event_id', v, 'name', 'Fisher presents'), '[]'::jsonb);
      end $x$ $q$, false);

select test.run('events: an occurrence with a schedule can still be cancelled', :operator_id,
  $q$ do $x$ declare v uuid; v_o uuid; begin
        select event_id into v from public.event where name = 'Fisher presents';
        select occurrence_id into v_o from public.event_occurrence where event_id = v;
        perform public.save_event_with_occurrences(
          jsonb_build_object('event_id', v, 'name', 'Fisher presents'),
          jsonb_build_array(jsonb_build_object('occurrence_id', v_o, 'event_date', '2026-07-15', 'starts_at', '2026-07-15T23:30:00+02:00', 'ends_at', '2026-07-16T06:00:00+02:00', 'status', 'cancelled')));
        if (select status from public.event_occurrence where occurrence_id = v_o) <> 'cancelled' then
          raise exception 'not cancelled';
        end if;
        update public.event_occurrence set status = 'active' where occurrence_id = v_o;
      end $x$ $q$, true);

select test.run('events: occurrence ending before it starts rejected', :operator_id,
  $q$ select public.save_event_with_occurrences('{"name":"Backwards"}'::jsonb,
        '[{"event_date":"2026-08-01","starts_at":"2026-08-02T06:00:00Z","ends_at":"2026-08-01T23:00:00Z"}]'::jsonb) $q$, false);

select test.run('events: deactivated user cannot call save_event_with_occurrences', :inactive_id,
  $q$ select public.save_event_with_occurrences('{"name":"Sneaky"}'::jsonb, '[]'::jsonb) $q$, false);

select test.run('review_task: nobody can hard-delete one', :admin_id,
  $q$ delete from public.review_task $q$, false);

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
