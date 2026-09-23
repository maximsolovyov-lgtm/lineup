-- What a slot IS and WHERE IN THE NIGHT it sits.
--
-- Two facts a publication states about a line that the kind does not carry:
--   * the format — a DJ set, a live show, a live PA, an A/V set. When the
--     announcement says nothing it is a DJ set: that is what a club bill
--     means by default, and 'unknown' is reserved for a source that leaves
--     the format genuinely open.
--   * the position in the night — "all night long", "opening", "closing",
--     "sunrise", "afterhours". Several can be true at once ("closing" and
--     "sunrise"), so they are tags, not one value.
--
-- Both live on lineup_artist, the announced line. The timetable one level
-- down (performance_set) keeps its own facts; this is what the poster says.

create type public.performance_format as enum (
  'dj_set', 'live', 'live_pa', 'hybrid', 'dj_live_pa', 'av', 'acoustic', 'other', 'unknown');

comment on type public.performance_format is
  'How the act performs: dj_set = an ordinary DJ set (the default when a bill says nothing); live = a live performance; live_pa = an electronic live PA; hybrid = DJ with live elements; dj_live_pa = announced as both a DJ set and a live PA; av = an audio-visual set; acoustic; other = classified but none of these; unknown = the format is not published.';

create type public.lineup_slot_tag as enum (
  'standard', 'all_night_long', 'open_to_close', 'opening', 'closing', 'sunrise', 'sunset', 'afterhours', 'peak_time');

comment on type public.lineup_slot_tag is
  'Where in the night the announcement puts the slot. standard = nothing special is claimed and excludes the rest; the others combine (a closing set can also be a sunrise set).';

alter table public.lineup_artist
  add column performance_format public.performance_format not null default 'dj_set',
  add column tags public.lineup_slot_tag[] not null default '{}';

comment on column public.lineup_artist.performance_format is
  'The announced format of this line. Defaults to dj_set: a club bill that says nothing means a DJ set. unknown only when the source leaves it open.';
comment on column public.lineup_artist.tags is
  'What the announcement says about the slot''s place in the night, deduplicated. standard is dropped when any other tag is present.';

create index idx_lineup_artist_tags on public.lineup_artist using gin (tags);

-- save_lineup: a slot carries its format and its tags ------------------------------------
-- p_artists element:
--   { lineup_artist_id?, kind?, performance_format?, tags?: [..], placeholder_type?,
--     display_name_override?, is_headliner?, artists: [ { artist_id } | { new_artist: { name } } ] }
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

  if v_id is null then
    if r.version is null then
      select coalesce(max(version), 0) + 1 into r.version
        from public.lineup
       where occurrence_id = r.occurrence_id and place_id is not distinct from r.place_id;
    end if;
    -- A version is published when it is saved; the caller may state an earlier
    -- date when the announcement itself is dated.
    insert into public.lineup (occurrence_id, place_id, version, published_at, source_id, notes, status)
    values (r.occurrence_id, r.place_id, r.version, coalesce(r.published_at, now()), r.source_id, r.notes, coalesce(r.status, 'active'))
    returning lineup_id into v_id;
  else
    update public.lineup set
      occurrence_id = r.occurrence_id, place_id = r.place_id,
      version = coalesce(r.version, version), published_at = coalesce(r.published_at, published_at),
      source_id = r.source_id, notes = r.notes, status = coalesce(r.status, status)
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
    -- Nothing said about the format means a DJ set, not "unknown".
    v_fmt := coalesce(nullif(a ->> 'performance_format', '')::public.performance_format, 'dj_set');

    select coalesce(array_agg(distinct t::public.lineup_slot_tag), '{}')
      into v_tags
      from jsonb_array_elements_text(case when jsonb_typeof(a -> 'tags') = 'array' then a -> 'tags' else '[]'::jsonb end) as t
     where t <> '';
    -- "standard" claims nothing special; it cannot stand next to a claim.
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
      insert into public.lineup_artist (lineup_id, kind, performance_format, tags, placeholder_type, display_name_override, is_headliner, billing_order, status)
      values (v_id, v_kind, v_fmt, v_tags, v_ph, nullif(a ->> 'display_name_override', ''),
              coalesce((a ->> 'is_headliner')::boolean, false), v_ord, 'active')
      returning lineup_artist_id into v_aid;
    else
      update public.lineup_artist set
        kind                  = v_kind,
        performance_format    = v_fmt,
        tags                  = v_tags,
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
  'Saves a line-up version and its slots in one transaction. A slot is { kind, performance_format, tags[], artists: [{artist_id}|{new_artist:{name}}], display_name_override?, is_headliner? }; a format left out is dj_set. published_at defaults to the moment the version is saved. An unstored name is reused or created (type unknown, review task), a placeholder name resolves to the placeholder artist. A kind that disagrees with the number of acts opens a review task, it does not block the save.';
