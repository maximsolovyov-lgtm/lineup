-- Part 3: place — the one active MVP v1 business table.

-- typical_rooms_json shape: array of
--   { "name": string (required), "is_headliner_room": boolean (required),
--     "capacity": non-negative integer (optional), "notes": string (optional) }
-- No other keys are allowed, so the structured editor and the database agree.
create or replace function public.is_valid_rooms_json(j jsonb)
returns boolean
language sql
immutable
as $$
  select j is null
      or (
        jsonb_typeof(j) = 'array'
        and not exists (
          select 1
            from jsonb_array_elements(j) as r
           where jsonb_typeof(r) is distinct from 'object'
              or jsonb_typeof(r -> 'name') is distinct from 'string'
              or length(r ->> 'name') = 0
              or jsonb_typeof(r -> 'is_headliner_room') is distinct from 'boolean'
              or (r ? 'capacity' and (
                    jsonb_typeof(r -> 'capacity') is distinct from 'number'
                 or (r ->> 'capacity')::numeric < 0
                 or (r ->> 'capacity')::numeric <> floor((r ->> 'capacity')::numeric)))
              or (r ? 'notes' and jsonb_typeof(r -> 'notes') is distinct from 'string')
              or exists (
                   select 1 from jsonb_object_keys(r) as k
                    where k not in ('name', 'is_headliner_room', 'capacity', 'notes'))
        )
      );
$$;

create table public.place (
  place_id         uuid primary key default gen_random_uuid(),
  parent_place_id  uuid references public.place (place_id),
  name             varchar(512) not null,
  normalized_name  varchar(512),
  lifecycle_type   public.place_lifecycle_type not null default 'permanent',
  address          text,
  city             varchar(256),
  region           varchar(256),
  country          varchar(128),
  latitude         numeric(9,6),
  longitude        numeric(9,6),
  timezone         varchar(64),
  capacity         integer,

  -- Canonical venue links (MVP keeps them on Place; EntityLink is roadmap).
  website_url       text,
  instagram_account varchar(64),
  instagram_url     text,
  facebook_account  varchar(128),
  facebook_url      text,

  -- How the venue publishes, and how it usually runs a night. These are
  -- prediction hints for the future Schedule Agent, not official facts.
  news_pattern                       text,
  lineup_pattern                     text,
  typical_party_start_time           time,
  typical_party_end_time             time,
  typical_party_start_day_offset     int default 0,
  typical_party_end_day_offset       int,
  typical_room_count                 int,
  typical_rooms_json                 jsonb,
  typical_headliner_room_name        varchar(256),
  typical_headliner_start_time       time,
  typical_headliner_start_day_offset int,
  typical_headliner_end_time         time,
  typical_headliner_end_day_offset   int,
  lineup_pattern_confidence_score    numeric(4,3),
  lineup_pattern_sample_size         int,
  lineup_pattern_notes               text,

  status             public.record_status not null default 'active',
  created_by_user_id uuid references public.app_user_profile (user_id),
  updated_by_user_id uuid references public.app_user_profile (user_id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz,

  constraint ck_place_not_own_parent check (parent_place_id is distinct from place_id),
  constraint ck_place_capacity check (capacity is null or capacity >= 0),
  constraint ck_place_latitude check (latitude is null or latitude between -90 and 90),
  constraint ck_place_longitude check (longitude is null or longitude between -180 and 180),
  constraint ck_place_rooms_json check (public.is_valid_rooms_json(typical_rooms_json)),
  constraint ck_place_room_count check (typical_room_count is null or typical_room_count >= 0),
  constraint ck_place_confidence check (
    lineup_pattern_confidence_score is null or lineup_pattern_confidence_score between 0 and 1),
  constraint ck_place_sample_size check (
    lineup_pattern_sample_size is null or lineup_pattern_sample_size >= 0),
  constraint ck_place_instagram_account check (
    instagram_account is null or instagram_account ~ '^[A-Za-z0-9._]{1,30}$')
);
comment on table public.place is
  'Physical, temporary, mobile, or virtual place. MVP stores official web/social links and news/lineup patterns directly on Place.';
comment on column public.place.typical_party_start_day_offset is
  'Days relative to the event date. 0 = same day; 1 = the following day (e.g. a night that ends at 06:00 next morning has end offset 1).';

-- Indexes per Architecture §15 Phase 2: name, city, country, status, social handles.
create index idx_place_normalized_name on public.place (normalized_name);
create index idx_place_city_country on public.place (city, country);
create index idx_place_status on public.place (status);
create index idx_place_instagram on public.place (lower(instagram_account)) where instagram_account is not null;
create index idx_place_facebook on public.place (lower(facebook_account)) where facebook_account is not null;
create index idx_place_parent on public.place (parent_place_id) where parent_place_id is not null;

-- One trigger owns the derived and audit columns, so clients cannot forge them.
create or replace function public.place_before_write()
returns trigger
language plpgsql
as $$
begin
  new.normalized_name := public.normalize_name(new.name);

  if new.typical_rooms_json is not null then
    new.typical_room_count := jsonb_array_length(new.typical_rooms_json);
  end if;

  if tg_op = 'INSERT' then
    new.created_by_user_id := auth.uid();
    new.created_at := now();
    new.updated_by_user_id := null;
    new.updated_at := null;
  else
    new.created_by_user_id := old.created_by_user_id;
    new.created_at := old.created_at;
    new.updated_by_user_id := auth.uid();
    new.updated_at := now();
  end if;

  return new;
end;
$$;

create trigger trg_place_before_write
  before insert or update on public.place
  for each row execute function public.place_before_write();
