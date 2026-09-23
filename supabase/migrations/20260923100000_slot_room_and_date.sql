-- A line can say WHICH ROOM and WHICH DAY.
--
-- Hï prints its bill as "Theatre: … / Club Room: …" before any timetable
-- exists, and a festival's bill names the day an act plays. Both are facts of
-- the announcement, so they belong to the announced line:
--   * place_space_id — the room, which must belong to the line-up's place.
--   * slot_date — the day, only meaningful when the occurrence runs over more
--     than one day, and only when the publication says.
-- And one fact of the publication as a whole:
--   * lineup.split_by_day — whether this announcement assigns its lines to
--     days at all. A multi-day bill that names no days is not "missing data":
--     it is a bill for the whole run, and saying so is different from not
--     having got round to it.
--
-- The timetable one level down (performance_set) keeps its own room and
-- times; this is what the poster said.

alter table public.lineup
  add column split_by_day boolean not null default false;

comment on column public.lineup.split_by_day is
  'Only meaningful when the occurrence runs over more than one day: true = the publication assigns its lines to days (lineup_artist.slot_date), false = it announces the whole run without splitting it. Set automatically when any line carries a date.';

alter table public.lineup_artist
  add column place_space_id uuid references public.place_space (space_id),
  add column slot_date      date;

comment on column public.lineup_artist.place_space_id is
  'The room this line is announced for, when the bill is printed per room. Must belong to the line-up''s place. NULL = the announcement did not say (never a default to the main room).';
comment on column public.lineup_artist.slot_date is
  'The day this line plays, within the occurrence''s run. NULL on a one-night occurrence (the night is the occurrence''s own day) and on a bill that does not split by day.';

create index idx_lineup_artist_space on public.lineup_artist (place_space_id) where place_space_id is not null;
create index idx_lineup_artist_date on public.lineup_artist (slot_date) where slot_date is not null;

-- A room belongs to the venue the line-up is for. Same rule as performance_set,
-- one level up: without a place there is no room to speak of.
create or replace function public.lineup_artist_space_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_place       uuid;
  v_space_place uuid;
begin
  if new.place_space_id is null then
    return new;
  end if;

  select place_id into v_place from public.lineup where lineup_id = new.lineup_id;
  if v_place is null then
    raise exception 'A room was given but the line-up has no place: a room without a venue says nothing'
      using errcode = 'check_violation';
  end if;

  select place_id into v_space_place from public.place_space where space_id = new.place_space_id;
  if v_space_place is distinct from v_place then
    raise exception 'Room % does not belong to the place this line-up is for', new.place_space_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_lineup_artist_space_guard
  before insert or update of place_space_id, lineup_id on public.lineup_artist
  for each row execute function public.lineup_artist_space_guard();

-- save_lineup: a slot carries its room and its day ---------------------------------------
-- p_lineup adds:  { split_by_day? }
-- p_artists adds: { place_space_id?, slot_date? }
create or replace function public.save_lineup(p_lineup jsonb, p_artists jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id      uuid := nullif(p_lineup ->> 'lineup_id', '')::uuid;
  r         public.lineup;
  a         jsonb;
  pa        jsonb;
  v_parts   jsonb;
  v_aid     uuid;
  v_ids     uuid[] := '{}';
  v_ord     int := 0;
  v_pord    int;
  v_artist  uuid;
  v_name    text;
  v_kind    public.lineup_slot_kind;
  v_fmt     public.performance_format;
  v_tags    public.lineup_slot_tag[];
  v_ph      public.placeholder_type;
  v_space   uuid;
  v_date    date;
  v_split   boolean := coalesce((p_lineup ->> 'split_by_day')::boolean, false);
  v_from    date;
  v_to      date;
  v_pids    uuid[];
  v_n       int;
  v_expect  int;
  v_label   text;
begin
  if jsonb_typeof(p_lineup) is distinct from 'object' then
    raise exception 'p_lineup must be a JSON object' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_typeof(p_artists) is distinct from 'array' then
    raise exception 'p_artists must be a JSON array' using errcode = 'invalid_parameter_value';
  end if;

  r := jsonb_populate_record(null::public.lineup, p_lineup - 'lineup_id');
  if r.occurrence_id is null then
    raise exception 'occurrence_id is required' using errcode = 'invalid_parameter_value';
  end if;

  -- The run the days must fall in: the business day through the day it ends.
  select o.event_date, greatest(o.event_date, (o.ends_at at time zone coalesce(o.timezone, 'UTC'))::date)
    into v_from, v_to
    from public.event_occurrence o where o.occurrence_id = r.occurrence_id;

  -- A line that names a day makes this a bill split by day, whatever was sent.
  if exists (select 1 from jsonb_array_elements(p_artists) e where nullif(e ->> 'slot_date', '') is not null) then
    v_split := true;
  end if;

  if v_id is null then
    if r.version is null then
      select coalesce(max(version), 0) + 1 into r.version
        from public.lineup
       where occurrence_id = r.occurrence_id and place_id is not distinct from r.place_id;
    end if;
    insert into public.lineup (occurrence_id, place_id, version, published_at, source_id, notes, status, split_by_day)
    values (r.occurrence_id, r.place_id, r.version, coalesce(r.published_at, now()), r.source_id, r.notes, coalesce(r.status, 'active'), v_split)
    returning lineup_id into v_id;
  else
    update public.lineup set
      occurrence_id = r.occurrence_id, place_id = r.place_id,
      version = coalesce(r.version, version), published_at = coalesce(r.published_at, published_at),
      source_id = r.source_id, notes = r.notes, status = coalesce(r.status, status),
      split_by_day = v_split
    where lineup_id = v_id;
    if not found then
      raise exception 'Line-up % does not exist or is not editable', v_id using errcode = 'no_data_found';
    end if;
  end if;

  for a in select e from jsonb_array_elements(p_artists) as e loop
    v_ord := v_ord + 1;
    v_aid := nullif(a ->> 'lineup_artist_id', '')::uuid;
    v_kind := nullif(a ->> 'kind', '')::public.lineup_slot_kind;
    v_ph := nullif(a ->> 'placeholder_type', '')::public.placeholder_type;
    v_fmt := coalesce(nullif(a ->> 'performance_format', '')::public.performance_format, 'dj_set');
    v_space := nullif(a ->> 'place_space_id', '')::uuid;
    v_date := nullif(a ->> 'slot_date', '')::date;

    select coalesce(array_agg(distinct t::public.lineup_slot_tag), '{}')
      into v_tags
      from jsonb_array_elements_text(case when jsonb_typeof(a -> 'tags') = 'array' then a -> 'tags' else '[]'::jsonb end) as t
     where t <> '';
    if array_length(v_tags, 1) > 1 then
      v_tags := array_remove(v_tags, 'standard');
    end if;

    if jsonb_typeof(a -> 'artists') = 'array' then
      v_parts := a -> 'artists';
    elsif coalesce(a ->> 'artist_id', '') <> '' or jsonb_typeof(a -> 'new_artist') = 'object' then
      v_parts := jsonb_build_array(jsonb_build_object('artist_id', a -> 'artist_id', 'new_artist', a -> 'new_artist'));
    else
      v_parts := '[]'::jsonb;
    end if;

    v_pids := '{}';
    for pa in select e from jsonb_array_elements(v_parts) as e loop
      v_artist := nullif(pa ->> 'artist_id', '')::uuid;
      v_name := nullif(btrim(coalesce(pa -> 'new_artist' ->> 'name', '')), '');
      if v_artist is null and v_name is not null then
        select artist_id into v_artist from public.artist
         where status = 'active' and normalized_name = public.normalize_name(v_name)
         order by is_placeholder desc, created_at limit 1;
        if v_artist is null then
          insert into public.artist (name, artist_type, status) values (v_name, 'unknown', 'active')
          returning artist_id into v_artist;
          insert into public.review_task (entity_type, entity_id, kind, message)
          values ('artist', v_artist, 'artist_created_from_lineup',
                  format('"%s" was created from a line-up with no type, country or members. Run the artist agent or fill it in.', v_name))
          on conflict (entity_type, entity_id, kind) where status = 'active' do nothing;
        end if;
      end if;
      if v_artist is not null and not (v_artist = any (v_pids)) then
        v_pids := v_pids || v_artist;
      end if;
    end loop;

    if coalesce(array_length(v_pids, 1), 0) = 0 and v_ph is not null then
      select artist_id into v_artist from public.artist
       where is_placeholder and placeholder_type = v_ph
       order by case when placeholder_type = 'secret_guest' then (name <> 'Secret guest')::int else 0 end, created_at
       limit 1;
      if v_artist is not null then v_pids := array[v_artist]; end if;
    end if;

    if v_ph is null then
      select ar.placeholder_type into v_ph
        from unnest(v_pids) with ordinality u(artist_id, ord)
        join public.artist ar on ar.artist_id = u.artist_id
       where ar.is_placeholder
       order by u.ord limit 1;
    end if;

    v_n := coalesce(array_length(v_pids, 1), 0);
    if v_kind is null then
      v_kind := case v_n when 0 then 'label_only' when 1 then 'solo' when 2 then 'b2b' when 3 then 'b3b' when 4 then 'b4b' else 'multiple_guests' end;
    end if;
    if v_n = 0 and nullif(btrim(coalesce(a ->> 'display_name_override', '')), '') is null then
      raise exception 'Slot % names no act and has no printed label', v_ord using errcode = 'invalid_parameter_value';
    end if;

    if v_aid is null then
      insert into public.lineup_artist (lineup_id, kind, performance_format, tags, place_space_id, slot_date,
                                        placeholder_type, display_name_override, is_headliner, billing_order, status)
      values (v_id, v_kind, v_fmt, v_tags, v_space, v_date, v_ph, nullif(a ->> 'display_name_override', ''),
              coalesce((a ->> 'is_headliner')::boolean, false), v_ord, 'active')
      returning lineup_artist_id into v_aid;
    else
      update public.lineup_artist set
        kind                  = v_kind,
        performance_format    = v_fmt,
        tags                  = v_tags,
        place_space_id        = v_space,
        slot_date             = v_date,
        placeholder_type      = coalesce(v_ph, placeholder_type),
        display_name_override = nullif(a ->> 'display_name_override', ''),
        is_headliner          = coalesce((a ->> 'is_headliner')::boolean, false),
        billing_order         = v_ord,
        status                = 'active'
      where lineup_artist_id = v_aid and lineup_id = v_id;
      if not found then
        raise exception 'Line-up artist % does not belong to line-up %', v_aid, v_id using errcode = 'check_violation';
      end if;
    end if;
    v_ids := v_ids || v_aid;

    delete from public.lineup_artist_participant where lineup_artist_id = v_aid;
    v_pord := 0;
    foreach v_artist in array v_pids loop
      v_pord := v_pord + 1;
      insert into public.lineup_artist_participant (lineup_artist_id, artist_id, participant_order)
      values (v_aid, v_artist, v_pord);
    end loop;

    v_expect := case v_kind when 'solo' then 1 when 'b2b' then 2 when 'b3b' then 3 when 'b4b' then 4 when 'label_only' then 0 else null end;
    select public.lineup_slot_label(v_kind, array_agg(ar.name order by p.participant_order), nullif(a ->> 'display_name_override', ''))
      into v_label
      from public.lineup_artist_participant p join public.artist ar on ar.artist_id = p.artist_id
     where p.lineup_artist_id = v_aid;
    if (v_expect is not null and v_n <> v_expect)
       or (v_kind in ('collaboration', 'featuring', 'multiple_guests') and v_n < 2) then
      insert into public.review_task (entity_type, entity_id, kind, message)
      values ('lineup', v_id, 'lineup_slot_kind_mismatch',
              format('Slot %s ("%s") is %s but names %s act(s). Fix the kind or the acts.', v_ord, coalesce(v_label, '?'), v_kind, v_n))
      on conflict (entity_type, entity_id, kind) where status = 'active' do nothing;
    end if;
    if v_kind = 'unknown' then
      insert into public.review_task (entity_type, entity_id, kind, message)
      values ('lineup', v_id, 'lineup_slot_kind_unclear',
              format('Slot %s ("%s") was printed in a way that allows more than one reading (separate sets, b2b, or feat.). Decide the kind, and record what the wording means at this venue in the place''s line-up pattern.', v_ord, coalesce(v_label, '?')))
      on conflict (entity_type, entity_id, kind) where status = 'active' do nothing;
    end if;
    -- A day outside the run is kept, not dropped: the operator must see what the
    -- source said before deciding whether the date or the occurrence is wrong.
    if v_date is not null and (v_from is null or v_date < v_from or v_date > v_to) then
      insert into public.review_task (entity_type, entity_id, kind, message)
      values ('lineup', v_id, 'lineup_slot_date_outside_run',
              format('Slot %s ("%s") is dated %s, which is outside the occurrence''s run (%s to %s). Fix the date, or the occurrence.', v_ord, coalesce(v_label, '?'), v_date, v_from, v_to))
      on conflict (entity_type, entity_id, kind) where status = 'active' do nothing;
    end if;
  end loop;

  update public.lineup_artist set status = 'inactive'
   where lineup_id = v_id and status = 'active' and not (lineup_artist_id = any (v_ids));

  return v_id;

exception
  when unique_violation then
    if sqlerrm like '%uq_lineup_version%' then
      raise exception 'This occurrence and place already have a line-up with that version' using errcode = 'unique_violation';
    end if;
    raise;
end;
$$;

comment on function public.save_lineup(jsonb, jsonb) is
  'Saves a line-up version and its slots in one transaction. A slot is { kind, performance_format, tags[], place_space_id?, slot_date?, artists: [{artist_id}|{new_artist:{name}}], display_name_override?, is_headliner? }; a format left out is dj_set, a room must belong to the line-up''s place, and any dated line makes the version split_by_day. published_at defaults to the moment the version is saved. An unstored name is reused or created (type unknown, review task), a placeholder name resolves to the placeholder artist. A kind that disagrees with the number of acts, and a day outside the run, open review tasks; neither blocks the save.';
