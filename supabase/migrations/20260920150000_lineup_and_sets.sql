-- Stage 2 opens: line-ups and performance sets get their screens.
-- Decision 2026-09-20 (owner): the stage boundary in CLAUDE.md is lifted —
-- the master data it waited for exists. Two objects, kept apart on purpose:
--
--   lineup            WHO is announced for an occurrence (and a place).
--                     Official only, versioned: every publication is a new
--                     version; the artists of a version are lineup_artist rows.
--                     Takes over the role of program_release ("the publication
--                     that advances the version"), which is dropped.
--   performance_set   WHEN and WHERE each set plays: the timeline. Official
--                     (linked to the lineup it comes from) or predicted;
--                     full (a slot per set) or partial (set_type = group, e.g.
--                     a split by day only); versioned; per room (place_space).
--                     Never updated with new information: a correction is a
--                     new row pointing at the old one through supersedes.

-- program_release → lineup ---------------------------------------------------------
drop index if exists public.idx_performance_set_release;
alter table public.performance_set drop column if exists release_id;
drop table if exists public.program_release;

create type public.set_completeness as enum ('full', 'partial');

-- lineup -------------------------------------------------------------------------------
create table public.lineup (
  lineup_id     uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.event_occurrence (occurrence_id),
  place_id      uuid references public.place (place_id),
  version       int not null default 1,
  published_at  timestamptz,
  source_id     uuid references public.evidence_source (source_id),
  notes         text,
  status        public.record_status not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  constraint ck_lineup_version check (version >= 1)
);
comment on table public.lineup is
  'An official announcement of who plays at an occurrence. place_id NULL means the place was not announced: a multi-venue line-up published without attribution is ONE row with null, never one copy per venue. Every publication is a new version.';
comment on column public.lineup.version is
  'Advanced by a publication. Current official state resolves per (occurrence, place): max(version) among active rows.';

-- One row per publication; nulls not distinct so two unattributed line-ups
-- of the same occurrence cannot both claim version 1.
create unique index uq_lineup_version
  on public.lineup (occurrence_id, place_id, version) nulls not distinct;
create index idx_lineup_occurrence on public.lineup (occurrence_id, place_id, version desc) where status = 'active';

create trigger trg_lineup_updated_at before update on public.lineup
  for each row execute function public.set_updated_at();

create table public.lineup_artist (
  lineup_artist_id      uuid primary key default gen_random_uuid(),
  lineup_id             uuid not null references public.lineup (lineup_id) on delete cascade,
  artist_id             uuid references public.artist (artist_id),
  placeholder_type      public.placeholder_type,
  display_name_override varchar(512),
  is_headliner          boolean not null default false,
  billing_order         int,
  status                public.record_status not null default 'active',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz,
  -- A placeholder (TBD, Secret Guest) has no artist; anything else must name one.
  constraint ck_lineup_artist_identity check (
    artist_id is not null or placeholder_type is not null or display_name_override is not null)
);
comment on table public.lineup_artist is
  'The artists of one lineup version, in billing order. placeholder_type is never cleared on reveal: null+tbd = TBA, null+secret_guest = Secret Guest, set+null = ordinary, set+secret_guest = revealed guest.';

create unique index uq_lineup_artist
  on public.lineup_artist (lineup_id, artist_id) where artist_id is not null and status = 'active';
create index idx_lineup_artist_lineup on public.lineup_artist (lineup_id, billing_order);
create index idx_lineup_artist_artist on public.lineup_artist (artist_id) where artist_id is not null;

create trigger trg_lineup_artist_updated_at before update on public.lineup_artist
  for each row execute function public.set_updated_at();

-- performance_set learns its lineup and its completeness --------------------------------
alter table public.performance_set
  add column lineup_id    uuid references public.lineup (lineup_id),
  add column completeness public.set_completeness not null default 'partial';

comment on column public.performance_set.lineup_id is
  'The official line-up this set belongs to. Required for scenario_type = official; a prediction may point at the line-up it was derived from.';
comment on column public.performance_set.completeness is
  'full = a slot per set with times; partial = only a coarser split is known (a set_type = group block per day or room).';

alter table public.performance_set add constraint ck_performance_set_official_has_lineup check (
  scenario_type <> 'official' or lineup_id is not null
);
create index idx_performance_set_lineup on public.performance_set (lineup_id) where lineup_id is not null;

-- Place/space integrity, restated: the set's place is place_id, or else the
-- LINE-UP's place. Never the occurrence's primary place — null means "not
-- announced" and there is no default (CLAUDE.md).
create or replace function public.performance_set_check_place_space()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective_place uuid;
  v_space_place     uuid;
  v_lineup_occ      uuid;
begin
  if new.lineup_id is not null then
    select occurrence_id into v_lineup_occ from public.lineup where lineup_id = new.lineup_id;
    if v_lineup_occ is distinct from new.occurrence_id then
      raise exception 'lineup % belongs to another occurrence', new.lineup_id using errcode = 'check_violation';
    end if;
  end if;

  if new.place_space_id is null then
    return new;
  end if;

  v_effective_place := new.place_id;
  if v_effective_place is null and new.lineup_id is not null then
    select place_id into v_effective_place from public.lineup where lineup_id = new.lineup_id;
  end if;
  if v_effective_place is null then
    raise exception 'place_space_id set but no place is announced for this set (place_id and the line-up place are both null)'
      using errcode = 'check_violation';
  end if;

  select place_id into v_space_place from public.place_space where space_id = new.place_space_id;
  if v_space_place is distinct from v_effective_place then
    raise exception 'place_space % does not belong to place %', new.place_space_id, v_effective_place
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function public.performance_set_check_place_space() from public, anon, authenticated;

drop trigger if exists trg_performance_set_place_space on public.performance_set;
create trigger trg_performance_set_place_space
  before insert or update of place_id, place_space_id, occurrence_id, lineup_id on public.performance_set
  for each row execute function public.performance_set_check_place_space();

-- The invariant, enforced: a performance_set row never changes except its
-- status (superseded, cancelled, inactive) — new information is a new row.
create or replace function public.performance_set_immutable()
returns trigger
language plpgsql
as $$
begin
  if row(new.occurrence_id, new.place_id, new.place_space_id, new.lineup_id, new.scenario_type, new.scenario_version,
         new.completeness, new.set_type, new.display_name, new.scheduled_start_at, new.scheduled_end_at,
         new.sequence_number, new.artist_list_json, new.artist_count, new.information_origin, new.confirmation_status,
         new.confidence_score, new.source_performance_set_id, new.supersedes_performance_set_id, new.source_id,
         new.notes, new.place_role, new.event_day, new.lineup_complete, new.created_at)
     is distinct from
     row(old.occurrence_id, old.place_id, old.place_space_id, old.lineup_id, old.scenario_type, old.scenario_version,
         old.completeness, old.set_type, old.display_name, old.scheduled_start_at, old.scheduled_end_at,
         old.sequence_number, old.artist_list_json, old.artist_count, old.information_origin, old.confirmation_status,
         old.confidence_score, old.source_performance_set_id, old.supersedes_performance_set_id, old.source_id,
         old.notes, old.place_role, old.event_day, old.lineup_complete, old.created_at) then
    raise exception 'A performance_set is never updated with new information: insert a new row and point supersedes_performance_set_id at this one'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function public.performance_set_immutable() from public, anon, authenticated;

create trigger trg_performance_set_immutable
  before update on public.performance_set
  for each row execute function public.performance_set_immutable();

-- The occurrence guard no longer knows program_release; a line-up counts too.
create or replace function public.event_occurrence_guard_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'active'
     and new.status not in ('active', 'cancelled')
     and (exists (select 1 from public.performance_set ps where ps.occurrence_id = old.occurrence_id)
          or exists (select 1 from public.lineup l where l.occurrence_id = old.occurrence_id)) then
    raise exception 'Occurrence on % has a line-up or a schedule and cannot be removed; cancel it instead', old.event_date
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

-- RLS: same model as every business table ------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['lineup', 'lineup_artist'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format($p$ create policy %I on public.%I for select to authenticated using (public.is_operator_or_admin()) $p$, t || '_select', t);
    execute format($p$ create policy %I on public.%I for insert to authenticated with check (public.is_operator_or_admin()) $p$, t || '_insert', t);
    execute format($p$ create policy %I on public.%I for update to authenticated using (public.is_operator_or_admin()) with check (public.is_operator_or_admin()) $p$, t || '_update', t);
  end loop;
end $$;

-- save_lineup ------------------------------------------------------------------------------
-- p_lineup:  { lineup_id?, occurrence_id, place_id?, version?, published_at?, source_id?, notes?, status? }
-- p_artists: array in billing order of
--            { lineup_artist_id?, artist_id? | placeholder_type? | display_name_override?, is_headliner? }
-- Without lineup_id and without version, the version is max(version)+1 for
-- (occurrence, place) — a new publication. With lineup_id the version is
-- corrected in place (a typo fix, not new information). Artists left out
-- become inactive.
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
  v_aid     uuid;
  v_ids     uuid[] := '{}';
  v_ord     int := 0;
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
    if v_aid is null then
      insert into public.lineup_artist (lineup_id, artist_id, placeholder_type, display_name_override, is_headliner, billing_order, status)
      values (v_id,
              nullif(a ->> 'artist_id', '')::uuid,
              nullif(a ->> 'placeholder_type', '')::public.placeholder_type,
              nullif(a ->> 'display_name_override', ''),
              coalesce((a ->> 'is_headliner')::boolean, false),
              v_ord, 'active')
      returning lineup_artist_id into v_aid;
    else
      update public.lineup_artist set
        artist_id             = nullif(a ->> 'artist_id', '')::uuid,
        placeholder_type      = nullif(a ->> 'placeholder_type', '')::public.placeholder_type,
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
  end loop;

  update public.lineup_artist set status = 'inactive'
   where lineup_id = v_id and status = 'active' and not (lineup_artist_id = any (v_ids));

  return v_id;

exception
  when unique_violation then
    if sqlerrm like '%uq_lineup_version%' then
      raise exception 'This occurrence and place already have a line-up with that version' using errcode = 'unique_violation';
    end if;
    if sqlerrm like '%uq_lineup_artist%' then
      raise exception 'The same artist is listed twice' using errcode = 'unique_violation';
    end if;
    raise;
end;
$$;
comment on function public.save_lineup(jsonb, jsonb) is
  'Saves a line-up version and its artists in one transaction. New line-up without version = next version for (occurrence, place).';
revoke execute on function public.save_lineup(jsonb, jsonb) from public, anon;
grant  execute on function public.save_lineup(jsonb, jsonb) to authenticated;

-- save_performance_set ----------------------------------------------------------------------
-- p_set: { performance_set_id?, occurrence_id, lineup_id?, place_id?, place_space_id?, scenario_type,
--          scenario_version?, completeness?, set_type, display_name?, scheduled_start_at?, scheduled_end_at?,
--          event_day?, place_role?, confidence_score?, information_origin?, confirmation_status?,
--          lineup_complete?, source_id?, notes?, status? }
-- p_participants: array of { artist_id? | placeholder_type? | display_name_override?, participant_role?,
--                            is_headliner?, is_primary? }
-- With performance_set_id the row is NOT updated: a new row is inserted with
-- the given values, the old row becomes superseded and the new one points at
-- it. artist_list_json and artist_count are rebuilt from the participants.
create or replace function public.save_performance_set(p_set jsonb, p_participants jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old   uuid := nullif(p_set ->> 'performance_set_id', '')::uuid;
  v_new   uuid;
  r       public.performance_set;
  o       public.performance_set;
  pp      jsonb;
  v_ord   int := 0;
  v_names jsonb := '[]'::jsonb;
  v_count int := 0;
begin
  if jsonb_typeof(p_set) is distinct from 'object' then
    raise exception 'p_set must be a JSON object' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_typeof(p_participants) is distinct from 'array' then
    raise exception 'p_participants must be a JSON array' using errcode = 'invalid_parameter_value';
  end if;

  r := jsonb_populate_record(null::public.performance_set, p_set - 'performance_set_id');

  if v_old is not null then
    select * into o from public.performance_set where performance_set_id = v_old;
    if not found then
      raise exception 'Performance set % does not exist or is not editable', v_old using errcode = 'no_data_found';
    end if;
    if o.status = 'superseded' then
      raise exception 'This set was already superseded; edit the current row' using errcode = 'check_violation';
    end if;
    -- Values not sent keep the old row's; version defaults to the old version
    -- (a correction), the caller raises it explicitly for a new publication.
    r.occurrence_id       := coalesce(r.occurrence_id, o.occurrence_id);
    r.scenario_type       := coalesce(r.scenario_type, o.scenario_type);
    r.scenario_version    := coalesce(r.scenario_version, o.scenario_version);
    r.set_type            := coalesce(r.set_type, o.set_type);
    r.completeness        := coalesce(r.completeness, o.completeness);
    r.source_performance_set_id := coalesce(r.source_performance_set_id, o.source_performance_set_id);
  end if;

  if r.occurrence_id is null then
    raise exception 'occurrence_id is required' using errcode = 'invalid_parameter_value';
  end if;
  if r.lineup_id is null and r.scenario_type = 'official' then
    raise exception 'An official set must belong to a line-up' using errcode = 'check_violation';
  end if;
  if r.scenario_version is null and r.lineup_id is not null then
    select version into r.scenario_version from public.lineup where lineup_id = r.lineup_id;
  end if;

  -- Participants first into the cache columns, then the row, then the rows.
  for pp in select e from jsonb_array_elements(p_participants) as e loop
    v_count := v_count + 1;
    v_names := v_names || jsonb_build_object(
      'artist_id', nullif(pp ->> 'artist_id', ''),
      'name', coalesce(nullif(pp ->> 'display_name_override', ''),
                       (select name from public.artist where artist_id = nullif(pp ->> 'artist_id', '')::uuid),
                       case pp ->> 'placeholder_type' when 'tbd' then 'TBA' when 'secret_guest' then 'Secret Guest' end),
      'placeholder_type', nullif(pp ->> 'placeholder_type', ''),
      'role', coalesce(nullif(pp ->> 'participant_role', ''), 'unknown'));
  end loop;

  -- The old row leaves 'active' first: the partial unique indexes only see
  -- active rows, so the replacement can take the same place, room and start.
  if v_old is not null then
    update public.performance_set set status = 'superseded' where performance_set_id = v_old;
  end if;

  insert into public.performance_set (
    occurrence_id, place_id, place_space_id, lineup_id, scenario_type, scenario_version, completeness,
    set_type, display_name, scheduled_start_at, scheduled_end_at, sequence_number, event_day, place_role,
    artist_list_json, artist_count, information_origin, confirmation_status, confidence_score,
    source_performance_set_id, supersedes_performance_set_id, source_id, lineup_complete, notes, status)
  values (
    r.occurrence_id, r.place_id, r.place_space_id, r.lineup_id, r.scenario_type,
    coalesce(r.scenario_version, 1), coalesce(r.completeness, 'partial'),
    coalesce(r.set_type, 'unknown'), r.display_name, r.scheduled_start_at, r.scheduled_end_at, r.sequence_number,
    coalesce(r.event_day, (select event_date from public.event_occurrence where occurrence_id = r.occurrence_id)),
    r.place_role,
    v_names, v_count, r.information_origin, coalesce(r.confirmation_status, 'unconfirmed'), r.confidence_score,
    r.source_performance_set_id, v_old, r.source_id, coalesce(r.lineup_complete, false), r.notes,
    coalesce(r.status, 'active'))
  returning performance_set_id into v_new;

  for pp in select e from jsonb_array_elements(p_participants) as e loop
    v_ord := v_ord + 1;
    insert into public.performance_set_participant
      (performance_set_id, artist_id, placeholder_type, display_name_override, participant_role,
       billing_order, display_order, is_headliner, is_primary, status)
    values (v_new,
            nullif(pp ->> 'artist_id', '')::uuid,
            nullif(pp ->> 'placeholder_type', '')::public.placeholder_type,
            nullif(pp ->> 'display_name_override', ''),
            coalesce(nullif(pp ->> 'participant_role', '')::public.participant_role, 'unknown'),
            v_ord, v_ord,
            coalesce((pp ->> 'is_headliner')::boolean, false),
            coalesce((pp ->> 'is_primary')::boolean, false),
            'active');
  end loop;

  return v_new;

exception
  when unique_violation then
    if sqlerrm like '%uq_performance_set%' then
      raise exception 'A set with this place, room, scenario, version and start already exists' using errcode = 'unique_violation';
    end if;
    raise;
end;
$$;
comment on function public.save_performance_set(jsonb, jsonb) is
  'Inserts a performance set with its participants in one transaction. With performance_set_id: a NEW row is inserted and the old one becomes superseded — rows are never updated with new information.';
revoke execute on function public.save_performance_set(jsonb, jsonb) from public, anon;
grant  execute on function public.save_performance_set(jsonb, jsonb) to authenticated;
