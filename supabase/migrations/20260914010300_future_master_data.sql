-- Part 4: roadmap master data. Schema shipped now (decision 2026-09-14);
-- no UI tabs in MVP v1. Tables: event, event_occurrence, place_space,
-- artist, evidence_source.

create table public.event (
  event_id        uuid primary key default gen_random_uuid(),
  name            varchar(512) not null,
  normalized_name varchar(512),
  event_type      public.event_type not null default 'party',
  status          public.record_status not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);
comment on table public.event is 'Roadmap. Reusable event brand or concept: Circoloco, Music On, a festival brand.';
create index idx_event_normalized_name on public.event (normalized_name);
create trigger trg_event_normalized_name before insert or update of name on public.event
  for each row execute function public.set_normalized_name();
create trigger trg_event_updated_at before update on public.event
  for each row execute function public.set_updated_at();

create table public.event_occurrence (
  occurrence_id    uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.event (event_id),
  primary_place_id uuid references public.place (place_id),
  occurrence_name  varchar(512),
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  timezone         varchar(64),
  status           public.record_status not null default 'active',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz,
  constraint ck_event_occurrence_window check (ends_at > starts_at)
);
comment on table public.event_occurrence is
  'Roadmap. Concrete event instance. primary_place_id is the default place; multi-venue detail lives on performance_set.place_id.';
create index idx_event_occurrence_event on public.event_occurrence (event_id);
create index idx_event_occurrence_place on public.event_occurrence (primary_place_id);
create index idx_event_occurrence_starts on public.event_occurrence (starts_at);
create trigger trg_event_occurrence_updated_at before update on public.event_occurrence
  for each row execute function public.set_updated_at();

create table public.place_space (
  space_id        uuid primary key default gen_random_uuid(),
  place_id        uuid not null references public.place (place_id),
  name            varchar(512) not null,
  normalized_name varchar(512),
  space_type      varchar(64),
  capacity        integer,
  status          public.record_status not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  constraint ck_place_space_capacity check (capacity is null or capacity >= 0)
);
comment on table public.place_space is
  'Roadmap. Permanent or known room/stage inside a place. performance_set.place_space_id points here when the stage is known.';
create index idx_place_space_place on public.place_space (place_id);
create trigger trg_place_space_normalized_name before insert or update of name on public.place_space
  for each row execute function public.set_normalized_name();
create trigger trg_place_space_updated_at before update on public.place_space
  for each row execute function public.set_updated_at();

create table public.artist (
  artist_id       uuid primary key default gen_random_uuid(),
  name            varchar(512) not null,
  normalized_name varchar(512),
  artist_type     varchar(32),
  status          public.record_status not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  -- The DBML types this as varchar with a listed vocabulary; enforce it.
  constraint ck_artist_type check (
    artist_type is null or artist_type in ('solo', 'duo', 'group', 'collective', 'alias', 'unknown'))
);
comment on table public.artist is
  'Roadmap. Artist master data. duo/group/collective are artist_type values, not performance_set.set_type values.';
create index idx_artist_normalized_name on public.artist (normalized_name);
create trigger trg_artist_normalized_name before insert or update of name on public.artist
  for each row execute function public.set_normalized_name();
create trigger trg_artist_updated_at before update on public.artist
  for each row execute function public.set_updated_at();

create table public.evidence_source (
  source_id    uuid primary key default gen_random_uuid(),
  source_type  varchar(64),
  source_url   text,
  source_title varchar(512),
  captured_at  timestamptz,
  status       public.record_status not null default 'active',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz
);
comment on table public.evidence_source is
  'Roadmap. Source/evidence for an official lineup, stage assignment, timetable, or prediction input.';
create trigger trg_evidence_source_updated_at before update on public.evidence_source
  for each row execute function public.set_updated_at();
