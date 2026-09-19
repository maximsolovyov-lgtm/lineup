-- v1.4 delta, part 3 of 4: schedule model changes.

-- program_release -------------------------------------------------------------
-- A version corresponds to a PUBLICATION, not to the state of a room.
-- Tying scenario_version to a release turns it from a bare number into a
-- reference to the announcement that caused it.

create table public.program_release (
  release_id    uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.event_occurrence (occurrence_id) on delete cascade,
  source_id     uuid references public.evidence_source (source_id),

  release_kind public.release_kind not null default 'other',
  published_at timestamptz,
  summary      text,

  status     public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

comment on table public.program_release is
  'Immutable snapshot of a public announcement. Advances scenario_version.';

create trigger trg_program_release_updated_at
  before update on public.program_release
  for each row execute function public.set_updated_at();

create index idx_program_release_occurrence
  on public.program_release (occurrence_id, published_at desc);

-- evidence_source.content_hash --------------------------------------------------
-- Idempotency (NFR): reprocessing the same material must not create a new
-- version. Identify a source by its content, not only by its URL.

alter table public.evidence_source add column content_hash text;

create unique index uq_evidence_source_content_hash
  on public.evidence_source (content_hash)
  where content_hash is not null;

-- place_space --------------------------------------------------------------------

alter table public.place_space
  add column is_primary    boolean not null default false,
  add column display_order int;

comment on column public.place_space.is_primary is
  'The venue main room. A hint for predicting headliner timing.';

create unique index uq_place_space_name
  on public.place_space (place_id, normalized_name)
  where status = 'active';

-- event_occurrence.event_date ----------------------------------------------------
-- Business day: a party running 23:00 Friday to 08:00 Saturday is FRIDAY.
-- Without this, grouping by date and the place.typical_*_day_offset fields
-- disagree with each other.

alter table public.event_occurrence add column event_date date;

-- Backfill: shift six hours back, then take the local date. 23:00 -> Friday,
-- 02:00 -> Friday. Review any row the venue timezone makes ambiguous.
update public.event_occurrence
set event_date = (
  (starts_at at time zone coalesce(timezone, 'UTC')) - interval '6 hours'
)::date
where event_date is null;

alter table public.event_occurrence alter column event_date set not null;

comment on column public.event_occurrence.event_date is
  'Business day of the event, not the calendar date of starts_at.';

-- performance_set ------------------------------------------------------------------

alter table public.performance_set
  add column place_role      public.place_role,
  add column release_id      uuid references public.program_release (release_id),
  add column event_day       date,
  add column lineup_complete boolean not null default false;

comment on column public.performance_set.place_id is
  'NULL means the place has NOT been announced. There is no default to event_occurrence.primary_place_id: a multi-venue line-up published without attribution is ONE row with place_id null, never one copy per venue.';
comment on column public.performance_set.event_day is
  'Business day. A 02:00 set belongs to the previous night.';
comment on column public.performance_set.lineup_complete is
  '"+ more TBA" is a property of the block, not of a participant; no phantom participant rows.';

-- Times become nullable: "till close" and "only the festival day is known"
-- could not be recorded at all before.
alter table public.performance_set
  alter column scheduled_start_at drop not null,
  alter column scheduled_end_at   drop not null;

alter table public.performance_set drop constraint if exists ck_performance_set_window;
alter table public.performance_set add constraint ck_performance_set_window check (
  scheduled_start_at is null
  or scheduled_end_at is null
  or scheduled_end_at > scheduled_start_at
);

-- A prediction without a confidence score must not be presentable as one.
-- Enforced, not merely documented.
alter table public.performance_set add constraint ck_performance_set_predicted_confidence check (
  scenario_type <> 'predicted' or confidence_score is not null
);

-- information_origin / confirmation_status: unconstrained varchar -> enum.
-- Guard first: fail loudly rather than silently nulling a recorded fact.
do $guard$
declare bad int;
begin
  select count(*) into bad from public.performance_set
  where information_origin is not null
    and information_origin not in (
      'venue_announced','artist_announced','ticketing','press',
      'user_submitted','predicted','observed','manual');
  if bad > 0 then
    raise exception 'performance_set.information_origin has % row(s) outside the v1.4 vocabulary; map them before migrating', bad;
  end if;

  select count(*) into bad from public.performance_set
  where confirmation_status is not null
    and confirmation_status not in ('unconfirmed','confirmed','disputed','retracted');
  if bad > 0 then
    raise exception 'performance_set.confirmation_status has % row(s) outside the v1.4 vocabulary; map them before migrating', bad;
  end if;
end
$guard$;

alter table public.performance_set
  alter column information_origin type public.information_origin
  using information_origin::public.information_origin;

update public.performance_set set confirmation_status = 'unconfirmed'
where confirmation_status is null;

alter table public.performance_set
  alter column confirmation_status type public.confirmation_status
  using confirmation_status::public.confirmation_status;

alter table public.performance_set
  alter column confirmation_status set default 'unconfirmed',
  alter column confirmation_status set not null;

-- Uniqueness. One index cannot cover both shapes: there is one group block per
-- room and version, but many detailed sets in that same room and version.
--
-- NULLS NOT DISTINCT is mandatory (Postgres 15+). Without it two rows with
-- place_space_id null do not collide, and an unknown room is the NORMAL case
-- in early stages.
create unique index uq_performance_set_group
  on public.performance_set (occurrence_id, place_id, place_space_id, scenario_type, scenario_version)
  nulls not distinct
  where set_type = 'group' and status = 'active';

create unique index uq_performance_set_detailed
  on public.performance_set (occurrence_id, place_id, place_space_id, scenario_type,
                             scenario_version, scheduled_start_at)
  nulls not distinct
  where set_type <> 'group' and status = 'active';

-- Current official state resolves PER ROOM: max(scenario_version) grouped by
-- (occurrence_id, place_space_id). A club publishing one room's timetable
-- leaves the other rooms correctly on an earlier version.
create index idx_performance_set_current
  on public.performance_set (occurrence_id, scenario_type, place_space_id, scenario_version desc)
  where status = 'active';

create index idx_performance_set_event_day
  on public.performance_set (event_day, scheduled_start_at)
  where status = 'active';

create index idx_performance_set_release on public.performance_set (release_id);

-- performance_set_participant --------------------------------------------------------

alter table public.performance_set_participant
  add column placeholder_type public.placeholder_type;

comment on column public.performance_set_participant.placeholder_type is
  'Set when the slot was announced as a placeholder, and NOT cleared on reveal. The pair (artist_id, placeholder_type) carries the whole history: null+tbd = "TBA"; null+secret_guest = "Secret Guest"; set+null = ordinary announcement; set+secret_guest = revealed, show the badge.';

alter table public.performance_set_participant drop constraint if exists ck_participant_identity;
alter table public.performance_set_participant add constraint ck_participant_identity check (
  artist_id is not null
  or placeholder_type is not null
  or display_name_override is not null
);

create index idx_participant_placeholder
  on public.performance_set_participant (placeholder_type)
  where placeholder_type is not null;

-- performance_set_participant_person ---------------------------------------------------
-- A collective often arrives short of its full line-up: Keinemusik announced,
-- two of three on stage. artist_membership describes the line-up in general,
-- not the line-up at one event.
--
-- Read rule: no rows here -> show the membership; rows here -> show them.

create table public.performance_set_participant_person (
  participant_person_id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.performance_set_participant (participant_id) on delete cascade,
  person_id      uuid not null references public.person (person_id),
  source_id      uuid references public.evidence_source (source_id),
  created_at     timestamptz not null default now()
);

comment on table public.performance_set_participant_person is
  'Written ONLY when the announced line-up differs from artist_membership. Empty = the default membership performs.';

create unique index uq_participant_person
  on public.performance_set_participant_person (participant_id, person_id);
