-- Rooms consolidate onto place_space (decision 2026-09-19).
--
-- The headliner room was recorded in THREE independent places:
--   place.typical_rooms_json[i].is_headliner_room
--   place.typical_headliner_room_name   (a free string, matched nothing)
--   place_space.is_primary
-- and the room list itself in two. Only place_space can carry a schedule:
-- performance_set.place_space_id is a foreign key, and an element of a JSON
-- array has no identity to point at. So place_space becomes the single truth.
--
-- This migration is ADDITIVE and safe to apply now: it copies the JSON into
-- place_space rows and leaves the old columns in place. Dropping them is a
-- separate step (docs/pending/DROP_typical_rooms.sql) that must wait until the
-- form, the seed and the RLS tests stop using them, or the build breaks.

-- place_space gains the one field the JSON had and the table did not.
alter table public.place_space add column notes text;

-- Backfill ---------------------------------------------------------------------
-- Duplicate names inside one place are collapsed (the unique index on
-- (place_id, normalized_name) would reject them); the first occurrence wins.
-- At most one room per place is marked primary, even if the JSON marked two.

with expanded as (
  select
    p.place_id,
    r.elem ->> 'name'                                   as name,
    nullif(r.elem ->> 'capacity', '')::int              as capacity,
    nullif(r.elem ->> 'notes', '')                      as notes,
    coalesce((r.elem ->> 'is_headliner_room')::boolean, false)
      or (
        p.typical_headliner_room_name is not null
        and public.normalize_name(r.elem ->> 'name')
            = public.normalize_name(p.typical_headliner_room_name)
      )                                                 as primary_candidate,
    r.ord                                               as ord
  from public.place p
  cross join lateral jsonb_array_elements(p.typical_rooms_json)
    with ordinality as r(elem, ord)
  where p.typical_rooms_json is not null
),
deduped as (
  select distinct on (place_id, public.normalize_name(name))
    place_id, name, capacity, notes, primary_candidate, ord
  from expanded
  order by place_id, public.normalize_name(name), ord
),
ranked as (
  select
    d.*,
    case
      when d.primary_candidate
       and row_number() over (
             partition by d.place_id, d.primary_candidate
             order by d.ord
           ) = 1
      then true
      else false
    end as is_primary
  from deduped d
)
insert into public.place_space
  (place_id, name, capacity, notes, is_primary, display_order, status)
select
  rk.place_id, rk.name, rk.capacity, rk.notes, rk.is_primary, rk.ord, 'active'
from ranked rk
where not exists (
  select 1
  from public.place_space s
  where s.place_id = rk.place_id
    and s.normalized_name = public.normalize_name(rk.name)
    and s.status = 'active'
);

-- Exactly one primary room per place, enforced rather than trusted to the UI.
create unique index uq_place_space_primary
  on public.place_space (place_id)
  where is_primary and status = 'active';

-- Mark the old columns so nobody builds anything new on them ---------------------

comment on column public.place.typical_rooms_json is
  'DEPRECATED 2026-09-19 — superseded by place_space rows. Read-only; scheduled for removal once the form, seed and RLS tests no longer reference it.';
comment on column public.place.typical_headliner_room_name is
  'DEPRECATED 2026-09-19 — superseded by place_space.is_primary. It was a free string that matched no room reliably.';
comment on column public.place.typical_room_count is
  'DEPRECATED 2026-09-19 — becomes count(*) over active place_space rows.';
