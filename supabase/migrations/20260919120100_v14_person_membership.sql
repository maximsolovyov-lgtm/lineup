-- v1.4 delta, part 2 of 4: the person model.
--
-- artist  = the name printed on the poster, and what users follow.
-- person  = the human behind it.
-- Many-to-many in BOTH directions: one human may stand behind several names
-- (solo + duo + alias), and one name may cover several humans (duo,
-- collective).
--
-- B2B is deliberately NOT modelled here. A duo is a permanent entity with a
-- name on the poster; a b2b is a one-off collaboration and lives in
-- performance_set.set_type plus its participants.

-- person --------------------------------------------------------------------

create table public.person (
  person_id       uuid primary key default gen_random_uuid(),
  display_name    varchar(512) not null,
  normalized_name varchar(512),
  country         varchar(64),
  notes           text,
  status          public.record_status not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

comment on table public.person is
  'Linking entity between humans and stage names. Not a subscription target: users follow artist.';
comment on column public.person.display_name is
  'Publicly known name ONLY. Legal or birth names are never stored unless the artist has published them; otherwise this becomes a deanonymisation database.';

-- person uses display_name rather than name, so it needs its own
-- normalisation trigger; set_normalized_name() reads new.name.
create or replace function public.set_person_normalized_name()
returns trigger
language plpgsql
as $$
begin
  new.normalized_name := public.normalize_name(new.display_name);
  return new;
end;
$$;

create trigger trg_person_normalized_name
  before insert or update on public.person
  for each row execute function public.set_person_normalized_name();

create trigger trg_person_updated_at
  before update on public.person
  for each row execute function public.set_updated_at();

create index idx_person_normalized_name on public.person (normalized_name);

-- artist_membership ----------------------------------------------------------

create table public.artist_membership (
  membership_id uuid primary key default gen_random_uuid(),
  artist_id     uuid not null references public.artist (artist_id) on delete cascade,
  person_id     uuid not null references public.person (person_id),

  membership_role public.membership_role,
  is_primary      boolean not null default false,
  display_order   int,

  started_at date,
  ended_at   date,

  status     public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz,

  constraint ck_membership_period check (
    ended_at is null or started_at is null or ended_at >= started_at)
);

comment on column public.artist_membership.is_primary is
  'For artist_type = alias: the main bearer of the name.';
comment on column public.artist_membership.ended_at is
  'Null = the membership is current. Dates matter so a 2019 event shows the line-up of its own time, not today''s.';

create trigger trg_artist_membership_updated_at
  before update on public.artist_membership
  for each row execute function public.set_updated_at();

-- nulls not distinct: a membership with no start date must not be insertable twice.
create unique index uq_artist_membership
  on public.artist_membership (artist_id, person_id, started_at)
  nulls not distinct;

create index idx_membership_person on public.artist_membership (person_id)
  where status = 'active';
create index idx_membership_artist on public.artist_membership (artist_id, display_order)
  where status = 'active';

-- artist.artist_type: varchar + CHECK -> enum ---------------------------------
-- Same vocabulary, so no data can be lost.

alter table public.artist drop constraint if exists ck_artist_type;

alter table public.artist
  alter column artist_type type public.artist_type
  using artist_type::public.artist_type;

comment on column public.artist.artist_type is
  'duo / group / collective belong HERE, not in performance_set.set_type. B2B is a set-level format, not an artist type.';
