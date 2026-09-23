-- A line of a line-up is a SLOT, and a slot can hold several artists.
--
-- "Solomun b2b Dixon" is one announced slot with two acts, not two slots and
-- not one artist called "Solomun b2b Dixon". The format of that slot is its
-- kind — the same idea as performance_set.set_type one level up, and the same
-- rule as the CLAUDE.md invariant: b2b is a FORMAT, never an artist_type.
--
-- Three parts here:
--   1. placeholder artists — TBA, Surprise guest, Secret guest, Unknown are
--      artist records, so a placeholder can sit inside a multi-artist slot
--      ("Solomun b2b TBA") and be picked like any other act.
--   2. lineup_artist becomes the slot: it gains `kind` and loses artist_id;
--      its acts live in lineup_artist_participant, in billing order.
--   3. save_lineup() and find_lineups() speak slots.

-- 1. Placeholder artists -----------------------------------------------------------------
alter table public.artist
  add column is_placeholder   boolean not null default false,
  add column placeholder_type public.placeholder_type,
  add constraint ck_artist_placeholder check (
    (is_placeholder and placeholder_type is not null) or (not is_placeholder and placeholder_type is null));

comment on column public.artist.is_placeholder is
  'A stand-in act (TBA, Secret guest, Unknown), pickable in a slot like any artist. Never a real performer: it has no members, no country and no bookings.';
comment on column public.artist.placeholder_type is
  'What this placeholder artist stands for. Set only when is_placeholder.';

-- One row per placeholder, by name.
create unique index uq_artist_placeholder on public.artist (normalized_name) where is_placeholder;

insert into public.artist (name, artist_type, status, is_placeholder, placeholder_type)
select v.name, 'unknown', 'active', true, v.ph::public.placeholder_type
  from (values
    ('TBA',            'tbd'),
    ('Surprise guest', 'secret_guest'),
    ('Secret guest',   'secret_guest'),
    ('Unknown',        'unknown')
  ) as v(name, ph)
 where not exists (
   select 1 from public.artist a where a.is_placeholder and a.normalized_name = public.normalize_name(v.name));

-- 2. Slots -------------------------------------------------------------------------------
create type public.lineup_slot_kind as enum (
  'solo', 'b2b', 'b3b', 'b4b', 'collaboration', 'featuring', 'multiple_guests', 'label_only', 'unknown');

comment on type public.lineup_slot_kind is
  'The format of one announced line: solo = one act; b2b/b3b/b4b = 2/3/4 acts sharing one set; collaboration = a joint performance that is not a back-to-back; featuring = the first act is the main one, the rest join part of it; multiple_guests = a host act plus guests; label_only = a line naming no identifiable act; unknown = the wording allows more than one reading, review it.';

alter table public.lineup_artist
  add column kind public.lineup_slot_kind not null default 'solo';

create table public.lineup_artist_participant (
  lineup_artist_id  uuid not null references public.lineup_artist (lineup_artist_id) on delete cascade,
  artist_id         uuid not null references public.artist (artist_id),
  participant_order int  not null,
  primary key (lineup_artist_id, artist_id)
);
comment on table public.lineup_artist_participant is
  'The acts of one announced slot, in the order they are printed. One row = solo; two = b2b; "A feat. B" keeps A first. A placeholder artist here is a slot the source did not fill.';
create index idx_lineup_artist_participant_artist on public.lineup_artist_participant (artist_id);

-- Existing slots become one-participant slots; a placeholder slot gets its artist.
insert into public.lineup_artist_participant (lineup_artist_id, artist_id, participant_order)
select la.lineup_artist_id, la.artist_id, 1
  from public.lineup_artist la
 where la.artist_id is not null;

insert into public.lineup_artist_participant (lineup_artist_id, artist_id, participant_order)
select la.lineup_artist_id, ph.artist_id, 1
  from public.lineup_artist la
  join public.artist ph on ph.is_placeholder and ph.placeholder_type = la.placeholder_type
 where la.artist_id is null and la.placeholder_type is not null
   and ph.name = case la.placeholder_type when 'tbd' then 'TBA' when 'secret_guest' then 'Secret guest' else 'Unknown' end;

update public.lineup_artist set kind = 'label_only'
 where artist_id is null and placeholder_type is null and display_name_override is not null;

-- artist_id moves to the participant table; the identity rule moves to save_lineup().
drop index if exists public.uq_lineup_artist;
drop index if exists public.idx_lineup_artist_artist;
alter table public.lineup_artist
  drop constraint ck_lineup_artist_identity,
  drop column artist_id;

comment on table public.lineup_artist is
  'One announced line of a line-up version: its kind (solo, b2b, feat. …), its acts in lineup_artist_participant, and how it was printed. placeholder_type is never cleared on reveal — with a real act in the slot it means "was a secret guest".';

alter table public.lineup_artist_participant enable row level security;
revoke all on public.lineup_artist_participant from anon, authenticated;
grant select, insert, update, delete on public.lineup_artist_participant to authenticated;
create policy lineup_artist_participant_select on public.lineup_artist_participant for select to authenticated using (public.is_operator_or_admin());
create policy lineup_artist_participant_insert on public.lineup_artist_participant for insert to authenticated with check (public.is_operator_or_admin());
create policy lineup_artist_participant_update on public.lineup_artist_participant for update to authenticated using (public.is_operator_or_admin()) with check (public.is_operator_or_admin());
create policy lineup_artist_participant_delete on public.lineup_artist_participant for delete to authenticated using (public.is_operator_or_admin());

-- How a slot reads: the acts joined the way the kind joins them, else what was printed.
create or replace function public.lineup_slot_label(p_kind public.lineup_slot_kind, p_names text[], p_printed text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_names is null or cardinality(p_names) = 0 then nullif(btrim(coalesce(p_printed, '')), '')
    when cardinality(p_names) = 1 then p_names[1]
    when p_kind in ('b2b', 'b3b', 'b4b') then array_to_string(p_names, ' ' || p_kind::text || ' ')
    when p_kind = 'featuring' then p_names[1] || ' feat. ' || array_to_string(p_names[2:], ', ')
    when p_kind = 'multiple_guests' then p_names[1] || ' + ' || array_to_string(p_names[2:], ', ')
    else array_to_string(p_names, ' & ')
  end;
$$;
comment on function public.lineup_slot_label(public.lineup_slot_kind, text[], text) is
  'Display label of one slot: "Solomun b2b Dixon", "Jamie Jones feat. Seth Troxler", or the printed line when no act is named.';
revoke execute on function public.lineup_slot_label(public.lineup_slot_kind, text[], text) from public, anon;
grant  execute on function public.lineup_slot_label(public.lineup_slot_kind, text[], text) to authenticated;

-- 3. save_lineup -------------------------------------------------------------------------
-- p_lineup:  { lineup_id?, occurrence_id, place_id?, version?, published_at?, source_id?, notes?, status? }
-- p_artists: one object per SLOT, in billing order:
--   { lineup_artist_id?, kind?, placeholder_type?, display_name_override?, is_headliner?,
--     artists: [ { artist_id } | { new_artist: { name } } ] }
--   The old one-artist shape ({ artist_id } or { new_artist } on the slot itself) is still
--   accepted and becomes a one-participant slot.
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
    insert into public.lineup (occurrence_id, place_id, version, published_at, source_id, notes, status)
    values (r.occurrence_id, r.place_id, r.version, r.published_at, r.source_id, r.notes, coalesce(r.status, 'active'))
    returning lineup_id into v_id;
  else
    update public.lineup set
      occurrence_id = r.occurrence_id, place_id = r.place_id,
      version = coalesce(r.version, version), published_at = r.published_at,
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

    -- The acts of this slot: the new array shape, or the old single artist.
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
      -- new_artist: { name } — a name the publication prints that is not stored yet.
      -- A placeholder wins the name match: "TBA" is the placeholder artist, never a new act.
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

    -- A slot announced as a placeholder with no act picked gets the placeholder artist.
    if coalesce(array_length(v_pids, 1), 0) = 0 and v_ph is not null then
      select artist_id into v_artist from public.artist
       where is_placeholder and placeholder_type = v_ph
       order by case when placeholder_type = 'secret_guest' then (name <> 'Secret guest')::int else 0 end, created_at
       limit 1;
      if v_artist is not null then v_pids := array[v_artist]; end if;
    end if;

    -- ... and a placeholder act decides the slot's placeholder_type. Never cleared: a real
    -- act plus 'secret_guest' is a revealed guest, which is the whole point of the column.
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
      insert into public.lineup_artist (lineup_id, kind, placeholder_type, display_name_override, is_headliner, billing_order, status)
      values (v_id, v_kind, v_ph, nullif(a ->> 'display_name_override', ''),
              coalesce((a ->> 'is_headliner')::boolean, false), v_ord, 'active')
      returning lineup_artist_id into v_aid;
    else
      update public.lineup_artist set
        kind                  = v_kind,
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

    -- The kind and the number of acts must agree. Incomplete data does not block a save
    -- (CLAUDE.md): it opens a review task.
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
  'Saves a line-up version and its slots in one transaction. A slot is { kind, artists: [{artist_id}|{new_artist:{name}}], display_name_override?, is_headliner? }; an unstored name is reused or created (type unknown, review task), a placeholder name resolves to the placeholder artist. A kind that disagrees with the number of acts opens a review task, it does not block the save.';

-- find_lineups: the artists of a version are now slot labels ------------------------------
drop function public.find_lineups(uuid, date, uuid, uuid, uuid, int);

create function public.find_lineups(
  p_occurrence_id uuid default null,
  p_date          date default null,
  p_event_id      uuid default null,
  p_place_id      uuid default null,
  p_artist_id     uuid default null,
  p_days          int  default 0
)
returns table (
  occurrence_id         uuid,
  event_id              uuid,
  event_name            text,
  event_date            date,
  occurrence_name       text,
  occurrence_status     public.record_status,
  primary_place_id      uuid,
  primary_place_name    text,
  part_of_occurrence_id uuid,
  part_of_name          text,
  lineups               jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  with occ as (
    select o.*
      from public.event_occurrence o
     where o.status <> 'inactive'
       and (p_occurrence_id is null or o.occurrence_id = p_occurrence_id or o.part_of_occurrence_id = p_occurrence_id)
       and (p_date is null or o.event_date between p_date - coalesce(p_days, 0) and p_date + coalesce(p_days, 0))
       and (p_event_id is null or o.event_id = p_event_id
            or exists (select 1 from public.event_occurrence u where u.occurrence_id = o.part_of_occurrence_id and u.event_id = p_event_id))
       and (p_place_id is null
            or o.primary_place_id = p_place_id
            or exists (select 1 from public.lineup l where l.occurrence_id = o.occurrence_id and l.place_id = p_place_id and l.status = 'active')
            or exists (select 1 from public.performance_set s where s.occurrence_id = o.occurrence_id and s.place_id = p_place_id and s.status = 'active'))
       and (p_artist_id is null
            or exists (select 1 from public.lineup l
                        join public.lineup_artist la on la.lineup_id = l.lineup_id and la.status = 'active'
                        join public.lineup_artist_participant lp on lp.lineup_artist_id = la.lineup_artist_id
                       where l.occurrence_id = o.occurrence_id and l.status = 'active' and lp.artist_id = p_artist_id)
            or exists (select 1 from public.performance_set s join public.performance_set_participant pp on pp.performance_set_id = s.performance_set_id
                        where s.occurrence_id = o.occurrence_id and s.status = 'active' and pp.status = 'active' and pp.artist_id = p_artist_id))
       and (p_occurrence_id is not null or p_date is not null or p_event_id is not null or p_place_id is not null or p_artist_id is not null)
  ), slot as (
    select la.lineup_artist_id, la.lineup_id, la.billing_order, la.is_headliner,
           public.lineup_slot_label(la.kind, array_agg(ar.name order by lp.participant_order) filter (where ar.artist_id is not null), la.display_name_override) as label,
           count(ar.artist_id) as act_count,
           bool_or(lp.artist_id = p_artist_id) as has_artist
      from public.lineup_artist la
      left join public.lineup_artist_participant lp on lp.lineup_artist_id = la.lineup_artist_id
      left join public.artist ar on ar.artist_id = lp.artist_id
     where la.status = 'active'
     group by la.lineup_artist_id, la.lineup_id, la.billing_order, la.is_headliner, la.kind, la.display_name_override
  )
  select o.occurrence_id, o.event_id, e.name, o.event_date, o.occurrence_name, o.status,
         o.primary_place_id, pp.name,
         o.part_of_occurrence_id,
         case when u.occurrence_id is null then null
              else ue.name || coalesce(' · ' || u.occurrence_name, '') || ' ' || to_char(u.event_date, 'YYYY') end,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'lineup_id', l.lineup_id,
                    'version', l.version,
                    'place_id', l.place_id,
                    'place_name', lp2.name,
                    'published_at', l.published_at,
                    'status', l.status,
                    'artist_count', (select coalesce(sum(s.act_count), 0) from slot s where s.lineup_id = l.lineup_id),
                    'artists', (select coalesce(jsonb_agg(s.label order by s.billing_order) filter (where s.label is not null), '[]'::jsonb)
                                  from slot s where s.lineup_id = l.lineup_id),
                    'matches_artist', p_artist_id is not null and exists (
                        select 1 from slot s where s.lineup_id = l.lineup_id and s.has_artist),
                    'is_current', l.version = (select max(l2.version) from public.lineup l2
                                                where l2.occurrence_id = l.occurrence_id and l2.place_id is not distinct from l.place_id and l2.status = 'active'))
                  order by coalesce(l.place_id = p_place_id, false) desc, lp2.name nulls first, l.version desc)
             from public.lineup l left join public.place lp2 on lp2.place_id = l.place_id
            where l.occurrence_id = o.occurrence_id and l.status = 'active'), '[]'::jsonb)
    from occ o
    join public.event e on e.event_id = o.event_id
    left join public.place pp on pp.place_id = o.primary_place_id
    left join public.event_occurrence u on u.occurrence_id = o.part_of_occurrence_id
    left join public.event ue on ue.event_id = u.event_id
   order by o.event_date desc, e.name
   limit 50;
$$;

comment on function public.find_lineups(uuid, date, uuid, uuid, uuid, int) is
  'Occurrences matching a date and/or event, place, artist (or one occurrence — an umbrella lists its parts), each with its active line-ups: version, place, slot labels ("Solomun b2b Dixon") and act count. Runs under the caller''s RLS.';

revoke execute on function public.find_lineups(uuid, date, uuid, uuid, uuid, int) from public, anon;
grant  execute on function public.find_lineups(uuid, date, uuid, uuid, uuid, int) to authenticated;
