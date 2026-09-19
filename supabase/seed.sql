-- Local development seed. Runs after migrations on `supabase db reset`.
--
-- Users are created by inserting into auth.users directly, which is fine
-- locally. On a hosted project, create the first admin by inviting them from
-- the Supabase dashboard, then run:
--   update public.app_user_profile set role = 'admin' where email = '<their email>';
-- Every later user is invited from the app's Users tab.

insert into auth.users (id, email, raw_app_meta_data)
values
  ('00000000-0000-4000-8000-000000000001', 'admin@lineapp.local',
   '{"app_role": "admin", "full_name": "Local Admin"}'),
  ('00000000-0000-4000-8000-000000000002', 'operator@lineapp.local',
   '{"app_role": "operator", "full_name": "Local Operator"}')
on conflict (id) do nothing;

-- Three real venues from the former pilot list, with the enrichment fields
-- filled in as an operator would fill them. Pattern values are illustrative.
insert into public.place
  (name, lifecycle_type, city, region, country, timezone, capacity,
   website_url, instagram_account, instagram_url,
   news_pattern, lineup_pattern,
   typical_party_start_time, typical_party_end_time,
   typical_party_start_day_offset, typical_party_end_day_offset,
   typical_rooms_json, typical_headliner_room_name,
   typical_headliner_start_time, typical_headliner_start_day_offset,
   typical_headliner_end_time, typical_headliner_end_day_offset,
   lineup_pattern_confidence_score, lineup_pattern_sample_size, lineup_pattern_notes)
values
  ('UNVRS', 'permanent', 'Ibiza', 'Balearic Islands', 'Spain', 'Europe/Madrid', 15000,
   'https://www.unvrs.com/', 'unvrs', 'https://www.instagram.com/unvrs',
   'Season lineup on website in spring; weekly event posts on Instagram; set times usually only in Stories on the day.',
   'Doors 23:30, closes 06:00. Headliner typically 03:00–06:00 in the main room.',
   '23:30', '06:00', 0, 1,
   '[{"name":"Main Room","is_headliner_room":true},{"name":"Terrace","is_headliner_room":false}]',
   'Main Room', '03:00', 1, '06:00', 1,
   0.6, 4, 'Based on 2026 opening weeks.'),
  ('Club Space', 'permanent', 'Miami', 'Florida', 'United States', 'America/New_York', 3000,
   'https://www.clubspace.com/', 'clubspacemiami', 'https://www.instagram.com/clubspacemiami',
   'Event calendar on website with lineups; timetable rarely published, headliner "sunrise set" is the norm.',
   'Opens 23:00 Saturday, Terrace runs until early afternoon Sunday. Headliner takes the sunrise slot around 06:00–10:00.',
   '23:00', '14:00', 0, 1,
   '[{"name":"Terrace","is_headliner_room":true},{"name":"Ground","is_headliner_room":false},{"name":"Loft","is_headliner_room":false}]',
   'Terrace', '06:00', 1, '10:00', 1,
   0.7, 6, null),
  ('fabric', 'permanent', 'London', 'England', 'United Kingdom', 'Europe/London', 1600,
   'https://www.fabriclondon.com/', 'fabriclondonofficial', 'https://www.instagram.com/fabriclondonofficial',
   'Full timetable published on the event page a day or two before the night.',
   'Fridays and Saturdays 23:00–06:00, three rooms. Room 1 headliner around 03:00.',
   '23:00', '06:00', 0, 1,
   '[{"name":"Room 1","is_headliner_room":true,"capacity":800},{"name":"Room 2","is_headliner_room":false},{"name":"Room 3","is_headliner_room":false}]',
   'Room 1', '03:00', 1, '05:00', 1,
   0.8, 10, 'Timetables are public, so the sample is reliable.');

-- Rooms as place_space rows.
--
-- `supabase db reset` runs migrations BEFORE this file, so the backfill in
-- 20260919200000_rooms_to_place_space.sql sees an empty database and does
-- nothing. Without this block a freshly reset local database has venues with
-- typical_rooms_json and no rooms at all, and phase 3b has nothing to show.
--
-- Derived from the JSON above rather than written out again, so the two cannot
-- drift. When typical_rooms_json is dropped, replace this with plain inserts.
with expanded as (
  select
    p.place_id,
    r.elem ->> 'name'                        as name,
    nullif(r.elem ->> 'capacity', '')::int   as capacity,
    nullif(r.elem ->> 'notes', '')           as notes,
    coalesce((r.elem ->> 'is_headliner_room')::boolean, false)
      or (
        p.typical_headliner_room_name is not null
        and public.normalize_name(r.elem ->> 'name')
            = public.normalize_name(p.typical_headliner_room_name)
      )                                      as primary_candidate,
    r.ord                                    as ord
  from public.place p
  cross join lateral jsonb_array_elements(p.typical_rooms_json)
    with ordinality as r(elem, ord)
  where p.typical_rooms_json is not null
),
ranked as (
  select
    e.*,
    case
      when e.primary_candidate
       and row_number() over (
             partition by e.place_id, e.primary_candidate order by e.ord
           ) = 1
      then true else false
    end as is_primary
  from expanded e
)
insert into public.place_space
  (place_id, name, capacity, notes, is_primary, display_order, status)
select rk.place_id, rk.name, rk.capacity, rk.notes, rk.is_primary, rk.ord, 'active'
from ranked rk
where not exists (
  select 1 from public.place_space s
  where s.place_id = rk.place_id
    and s.normalized_name = public.normalize_name(rk.name)
    and s.status = 'active'
);
