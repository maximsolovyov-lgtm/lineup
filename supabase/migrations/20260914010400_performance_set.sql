-- Part 5: roadmap schedule core. performance_set is the single table for
-- lineup-only group blocks, predicted, official, manual and actual records;
-- performance_set_participant is the normalized artist link.

create table public.performance_set (
  performance_set_id uuid primary key default gen_random_uuid(),

  occurrence_id  uuid not null references public.event_occurrence (occurrence_id),
  place_id       uuid references public.place (place_id),
  place_space_id uuid references public.place_space (space_id),

  scenario_type    public.set_scenario_type not null,
  scenario_version int not null,

  set_type     public.performance_set_type not null,
  display_name varchar(512),

  scheduled_start_at timestamptz not null,
  scheduled_end_at   timestamptz not null,
  sequence_number    int,

  artist_list_json jsonb,
  artist_count     int,

  information_origin  varchar(64),
  confirmation_status varchar(64),
  confidence_score    numeric(4,3),

  source_performance_set_id     uuid references public.performance_set (performance_set_id),
  supersedes_performance_set_id uuid references public.performance_set (performance_set_id),
  source_id                     uuid references public.evidence_source (source_id),

  notes      text,
  status     public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz,

  constraint ck_performance_set_window check (scheduled_end_at > scheduled_start_at),
  constraint ck_performance_set_version check (scenario_version >= 1),
  constraint ck_performance_set_confidence check (
    confidence_score is null or confidence_score between 0 and 1),
  constraint ck_performance_set_artist_count check (artist_count is null or artist_count >= 0),
  constraint ck_performance_set_artist_list check (
    artist_list_json is null or jsonb_typeof(artist_list_json) = 'array'),
  constraint ck_performance_set_not_own_source check (
    source_performance_set_id is distinct from performance_set_id),
  constraint ck_performance_set_not_own_supersede check (
    supersedes_performance_set_id is distinct from performance_set_id)
);
comment on table public.performance_set is
  'Roadmap. Central schedule table. place_id NULL means "inherit event_occurrence.primary_place_id"; place_space_id NULL means the stage/room is not known yet. artist_list_json is cache only; participants are the source of truth.';
comment on column public.performance_set.scenario_version is
  'New information creates a new row with a higher version; previous rows are superseded via supersedes_performance_set_id, never overwritten.';

create index idx_performance_set_occurrence_scenario
  on public.performance_set (occurrence_id, scenario_type, scenario_version);
create index idx_performance_set_occurrence_place
  on public.performance_set (occurrence_id, place_id, place_space_id);
create index idx_performance_set_type on public.performance_set (set_type);
create index idx_performance_set_source on public.performance_set (source_performance_set_id)
  where source_performance_set_id is not null;
create index idx_performance_set_supersedes on public.performance_set (supersedes_performance_set_id)
  where supersedes_performance_set_id is not null;
create index idx_performance_set_start on public.performance_set (scheduled_start_at);

-- Place-space integrity (Architecture §13 / DBML note): a stage must belong to
-- the place the set is at, where the set's place is place_id or, when that is
-- null, the occurrence's primary place.
create or replace function public.performance_set_check_place_space()
returns trigger
language plpgsql
as $$
declare
  v_effective_place uuid;
  v_space_place     uuid;
begin
  if new.place_space_id is null then
    return new;
  end if;

  select coalesce(new.place_id, eo.primary_place_id)
    into v_effective_place
    from public.event_occurrence eo
   where eo.occurrence_id = new.occurrence_id;

  if v_effective_place is null then
    raise exception 'place_space_id set but no place is known for this set (place_id and occurrence primary_place_id are both null)'
      using errcode = 'check_violation';
  end if;

  select place_id into v_space_place
    from public.place_space
   where space_id = new.place_space_id;

  if v_space_place is distinct from v_effective_place then
    raise exception 'place_space % does not belong to place %', new.place_space_id, v_effective_place
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger trg_performance_set_place_space
  before insert or update of place_id, place_space_id, occurrence_id on public.performance_set
  for each row execute function public.performance_set_check_place_space();

create trigger trg_performance_set_updated_at before update on public.performance_set
  for each row execute function public.set_updated_at();

create table public.performance_set_participant (
  participant_id     uuid primary key default gen_random_uuid(),
  performance_set_id uuid not null references public.performance_set (performance_set_id) on delete cascade,
  artist_id          uuid references public.artist (artist_id),

  participant_role      public.participant_role not null default 'unknown',
  billing_order         int,
  display_order         int,
  is_headliner          boolean,
  is_primary            boolean,
  display_name_override varchar(512),

  status     public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz,

  -- A placeholder (TBD, Special Guest) has no artist but must have a label.
  constraint ck_participant_identity check (
    artist_id is not null or display_name_override is not null)
);
comment on table public.performance_set_participant is
  'Roadmap. Normalized link between performance_set and artist. Single set: one primary. B2B: two rows role=b2b. Multi-B2B: three or more. Featuring: primary plus featured/guest. Placeholder: artist_id null, display_name_override holds the label.';

create index idx_participant_set on public.performance_set_participant (performance_set_id);
create index idx_participant_artist on public.performance_set_participant (artist_id)
  where artist_id is not null;
create index idx_participant_set_order on public.performance_set_participant (performance_set_id, display_order);

create trigger trg_participant_updated_at before update on public.performance_set_participant
  for each row execute function public.set_updated_at();
