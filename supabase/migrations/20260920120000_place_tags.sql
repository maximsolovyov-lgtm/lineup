-- Tags on place: an operator vocabulary, several per venue.
--   IBIZA         — where it is, when city/region are not enough
--   BIG5          — the five biggest clubs on the island
--   Tomorrowland  — a temporary site that exists for one festival
-- A text[] rather than a tag table: the vocabulary is small, made up by the
-- operators as they go, and only ever filtered on. The list of existing
-- tags (for autocomplete) is derived, not maintained.

alter table public.place
  add column tags text[] not null default '{}';

comment on column public.place.tags is
  'Operator vocabulary, several per venue: IBIZA, BIG5, Tomorrowland… Stored as typed; compared case-insensitively by the form.';

-- Each tag: trimmed, 1–64 characters, no duplicates, at most 32 per place.
create or replace function public.is_valid_tags(t text[])
returns boolean
language sql
immutable
as $$
  select t is not null
     and cardinality(t) <= 32
     and cardinality(t) = cardinality(array(select distinct lower(x) from unnest(t) as x))
     and not exists (
       select 1 from unnest(t) as x
        where x is null or x <> btrim(x) or length(x) < 1 or length(x) > 64
     );
$$;
revoke execute on function public.is_valid_tags(text[]) from public, anon;
grant  execute on function public.is_valid_tags(text[]) to authenticated;

alter table public.place
  add constraint ck_place_tags check (public.is_valid_tags(tags));

-- Filtering "all BIG5 venues" is an array containment query; GIN serves it.
create index idx_place_tags on public.place using gin (tags);

-- Existing tags with their counts, for the autocomplete and the list filter.
-- SECURITY INVOKER: an operator only sees tags of places they may read.
create or replace function public.place_tag_counts()
returns table (tag text, place_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select x as tag, count(*) as place_count
    from public.place p, unnest(p.tags) as x
   where p.status = 'active'
   group by x
   order by count(*) desc, x;
$$;
revoke execute on function public.place_tag_counts() from public, anon;
grant  execute on function public.place_tag_counts() to authenticated;

-- save_place_with_spaces() learns the column. Same body as 20260919230000
-- with tags added to the insert and the update; nothing else changes.
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
      name, parent_place_id, lifecycle_type, status, tags,
      address, city, region, country, latitude, longitude, timezone, capacity,
      website_url, instagram_account, instagram_url, facebook_account, facebook_url,
      news_pattern, lineup_pattern,
      typical_party_start_time, typical_party_end_time,
      typical_party_start_day_offset, typical_party_end_day_offset,
      typical_headliner_start_time, typical_headliner_start_day_offset,
      typical_headliner_end_time, typical_headliner_end_day_offset,
      lineup_pattern_confidence_score, lineup_pattern_sample_size, lineup_pattern_notes)
    values (
      r.name, r.parent_place_id, coalesce(r.lifecycle_type, 'permanent'), coalesce(r.status, 'active'), coalesce(r.tags, '{}'),
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
      tags = coalesce(r.tags, tags),
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
