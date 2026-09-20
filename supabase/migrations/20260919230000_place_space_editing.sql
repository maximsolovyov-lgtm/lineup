-- Phase 3b: rooms are edited inside the Place record, against place_space.
--
-- Two things the stage plan names as easy to get wrong, settled here in the
-- database rather than in the form:
--
--   1. The place and its rooms are saved in ONE transaction. supabase-js has
--      no client-side transactions, so the form calls save_place_with_spaces()
--      through RPC instead of chaining per-row requests.
--   2. A room a performance_set references cannot leave 'active'. The foreign
--      key already blocks a hard delete; a status change is how this
--      application deletes, so it needs its own guard.

-- Guard: deactivating a referenced room ------------------------------------------
-- SECURITY DEFINER so the check sees every performance_set row, whatever RLS
-- would show the caller.
create or replace function public.place_space_guard_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'active'
     and new.status <> 'active'
     and exists (select 1 from public.performance_set ps where ps.place_space_id = old.space_id) then
    raise exception 'Room "%" is referenced by a performance set and cannot be deactivated', old.name
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.place_space_guard_status() from public, anon, authenticated;

create trigger trg_place_space_guard_status
  before update of status on public.place_space
  for each row execute function public.place_space_guard_status();

-- Transactional save --------------------------------------------------------------
-- p_place:  the place columns, plus "place_id" when updating. Deprecated columns
--           (typical_rooms_json, typical_headliner_room_name, typical_room_count)
--           are ignored: the trigger derives nothing from them any more and the
--           form no longer sends them.
-- p_spaces: array of { space_id?, name, space_type?, capacity?, notes?, is_primary? }
--           in display order. A room with a space_id is updated; without one it
--           is inserted; an active room of this place that is not in the array
--           is set to 'inactive'.
--
-- SECURITY INVOKER on purpose: every statement runs under the caller's RLS, so
-- anything the interface forbids also fails when this is called directly.
create or replace function public.save_place_with_spaces(p_place jsonb, p_spaces jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_place_id uuid := nullif(p_place ->> 'place_id', '')::uuid;
  r          public.place;
  sp         jsonb;
  v_id       uuid;
  v_ids      uuid[] := '{}';
  v_ord      int := 0;
begin
  if jsonb_typeof(p_place) is distinct from 'object' then
    raise exception 'p_place must be a JSON object' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_typeof(p_spaces) is distinct from 'array' then
    raise exception 'p_spaces must be a JSON array' using errcode = 'invalid_parameter_value';
  end if;
  if (select count(*) from jsonb_array_elements(p_spaces) e
       where coalesce((e ->> 'is_primary')::boolean, false)) > 1 then
    raise exception 'Only one room can be the primary room' using errcode = 'check_violation';
  end if;

  r := jsonb_populate_record(null::public.place, p_place - 'place_id');

  if v_place_id is null then
    insert into public.place (
      name, parent_place_id, lifecycle_type, status,
      address, city, region, country, latitude, longitude, timezone, capacity,
      website_url, instagram_account, instagram_url, facebook_account, facebook_url,
      news_pattern, lineup_pattern,
      typical_party_start_time, typical_party_end_time,
      typical_party_start_day_offset, typical_party_end_day_offset,
      typical_headliner_start_time, typical_headliner_start_day_offset,
      typical_headliner_end_time, typical_headliner_end_day_offset,
      lineup_pattern_confidence_score, lineup_pattern_sample_size, lineup_pattern_notes)
    values (
      r.name, r.parent_place_id, coalesce(r.lifecycle_type, 'permanent'), coalesce(r.status, 'active'),
      r.address, r.city, r.region, r.country, r.latitude, r.longitude, r.timezone, r.capacity,
      r.website_url, r.instagram_account, r.instagram_url, r.facebook_account, r.facebook_url,
      r.news_pattern, r.lineup_pattern,
      r.typical_party_start_time, r.typical_party_end_time,
      coalesce(r.typical_party_start_day_offset, 0), r.typical_party_end_day_offset,
      r.typical_headliner_start_time, r.typical_headliner_start_day_offset,
      r.typical_headliner_end_time, r.typical_headliner_end_day_offset,
      r.lineup_pattern_confidence_score, r.lineup_pattern_sample_size, r.lineup_pattern_notes)
    returning place_id into v_place_id;
  else
    update public.place set
      name = r.name, parent_place_id = r.parent_place_id,
      lifecycle_type = coalesce(r.lifecycle_type, lifecycle_type), status = coalesce(r.status, status),
      address = r.address, city = r.city, region = r.region, country = r.country,
      latitude = r.latitude, longitude = r.longitude, timezone = r.timezone, capacity = r.capacity,
      website_url = r.website_url, instagram_account = r.instagram_account, instagram_url = r.instagram_url,
      facebook_account = r.facebook_account, facebook_url = r.facebook_url,
      news_pattern = r.news_pattern, lineup_pattern = r.lineup_pattern,
      typical_party_start_time = r.typical_party_start_time,
      typical_party_end_time = r.typical_party_end_time,
      typical_party_start_day_offset = coalesce(r.typical_party_start_day_offset, 0),
      typical_party_end_day_offset = r.typical_party_end_day_offset,
      typical_headliner_start_time = r.typical_headliner_start_time,
      typical_headliner_start_day_offset = r.typical_headliner_start_day_offset,
      typical_headliner_end_time = r.typical_headliner_end_time,
      typical_headliner_end_day_offset = r.typical_headliner_end_day_offset,
      lineup_pattern_confidence_score = r.lineup_pattern_confidence_score,
      lineup_pattern_sample_size = r.lineup_pattern_sample_size,
      lineup_pattern_notes = r.lineup_pattern_notes
    where place_id = v_place_id;
    if not found then
      raise exception 'Place % does not exist or is not editable', v_place_id using errcode = 'no_data_found';
    end if;
  end if;

  -- Clear every primary flag first: moving it from one room to another would
  -- otherwise trip uq_place_space_primary halfway through the loop.
  update public.place_space set is_primary = false
   where place_id = v_place_id and is_primary;

  for sp in select e from jsonb_array_elements(p_spaces) as e loop
    v_ord := v_ord + 1;
    v_id  := nullif(sp ->> 'space_id', '')::uuid;

    if v_id is null then
      insert into public.place_space (place_id, name, space_type, capacity, notes, is_primary, display_order, status)
      values (
        v_place_id,
        sp ->> 'name',
        nullif(sp ->> 'space_type', ''),
        nullif(sp ->> 'capacity', '')::int,
        nullif(sp ->> 'notes', ''),
        coalesce((sp ->> 'is_primary')::boolean, false),
        v_ord,
        'active')
      returning space_id into v_id;
    else
      update public.place_space set
        name          = sp ->> 'name',
        space_type    = nullif(sp ->> 'space_type', ''),
        capacity      = nullif(sp ->> 'capacity', '')::int,
        notes         = nullif(sp ->> 'notes', ''),
        is_primary    = coalesce((sp ->> 'is_primary')::boolean, false),
        display_order = v_ord,
        status        = 'active'
      where space_id = v_id and place_id = v_place_id;
      if not found then
        raise exception 'Room % does not belong to place %', v_id, v_place_id using errcode = 'check_violation';
      end if;
    end if;

    v_ids := v_ids || v_id;
  end loop;

  -- Rooms left out of the list are deactivated, never deleted. The guard
  -- trigger refuses if a performance_set still points at one, which fails the
  -- whole save — the operator keeps the room or the schedule, not half of each.
  update public.place_space set status = 'inactive'
   where place_id = v_place_id
     and status = 'active'
     and not (space_id = any (v_ids));

  return v_place_id;

exception
  when unique_violation then
    if sqlerrm like '%uq_place_space_name%' then
      raise exception 'Two rooms in this place have the same name' using errcode = 'unique_violation';
    end if;
    raise;
end;
$$;

comment on function public.save_place_with_spaces(jsonb, jsonb) is
  'Saves a place and its rooms in one transaction. Rooms missing from p_spaces are set to inactive. Runs under the caller''s RLS.';

revoke execute on function public.save_place_with_spaces(jsonb, jsonb) from public, anon;
grant  execute on function public.save_place_with_spaces(jsonb, jsonb) to authenticated;
