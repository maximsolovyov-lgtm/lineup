-- Finding a line-up from what an operator actually knows: a date and one of
-- an event, a place or an artist — or an occurrence directly. The function
-- resolves the occurrences that fit and returns each with its line-ups, so
-- the interface can offer "open this version" or "publish a new one" instead
-- of letting a second line-up for the same publication appear by accident.
--
-- Match rules:
--   date     the business day; p_days widens it (±) for "around that night".
--   event    the occurrence's event.
--   place    the occurrence's default place, OR a line-up of the occurrence
--            announced for that place, OR a set of the occurrence at it —
--            a multi-venue night is found from any of its venues.
--   artist   announced in a line-up of the occurrence, or a participant of
--            one of its sets (placeholders never match).
-- At least one of occurrence, date, event, place or artist is required.
create or replace function public.find_lineups(
  p_occurrence_id uuid default null,
  p_date          date default null,
  p_event_id      uuid default null,
  p_place_id      uuid default null,
  p_artist_id     uuid default null,
  p_days          int  default 0
)
returns table (
  occurrence_id      uuid,
  event_id           uuid,
  event_name         text,
  event_date         date,
  occurrence_name    text,
  occurrence_status  public.record_status,
  primary_place_id   uuid,
  primary_place_name text,
  lineups            jsonb
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
       and (p_occurrence_id is null or o.occurrence_id = p_occurrence_id)
       and (p_date is null or o.event_date between p_date - coalesce(p_days, 0) and p_date + coalesce(p_days, 0))
       and (p_event_id is null or o.event_id = p_event_id)
       and (p_place_id is null
            or o.primary_place_id = p_place_id
            or exists (select 1 from public.lineup l where l.occurrence_id = o.occurrence_id and l.place_id = p_place_id and l.status = 'active')
            or exists (select 1 from public.performance_set s where s.occurrence_id = o.occurrence_id and s.place_id = p_place_id and s.status = 'active'))
       and (p_artist_id is null
            or exists (select 1 from public.lineup l join public.lineup_artist la on la.lineup_id = l.lineup_id
                        where l.occurrence_id = o.occurrence_id and l.status = 'active' and la.status = 'active' and la.artist_id = p_artist_id)
            or exists (select 1 from public.performance_set s join public.performance_set_participant pp on pp.performance_set_id = s.performance_set_id
                        where s.occurrence_id = o.occurrence_id and s.status = 'active' and pp.status = 'active' and pp.artist_id = p_artist_id))
       and (p_occurrence_id is not null or p_date is not null or p_event_id is not null or p_place_id is not null or p_artist_id is not null)
  )
  select o.occurrence_id, o.event_id, e.name, o.event_date, o.occurrence_name, o.status,
         o.primary_place_id, pp.name,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'lineup_id', l.lineup_id,
                    'version', l.version,
                    'place_id', l.place_id,
                    'place_name', lp.name,
                    'published_at', l.published_at,
                    'status', l.status,
                    'artist_count', (select count(*) from public.lineup_artist la where la.lineup_id = l.lineup_id and la.status = 'active'),
                    'artists', (select coalesce(jsonb_agg(coalesce(a.name, la.display_name_override,
                                        case la.placeholder_type when 'tbd' then 'TBA' when 'secret_guest' then 'Secret Guest' end)
                                        order by la.billing_order), '[]'::jsonb)
                                  from public.lineup_artist la left join public.artist a on a.artist_id = la.artist_id
                                 where la.lineup_id = l.lineup_id and la.status = 'active'),
                    'matches_artist', p_artist_id is not null and exists (
                        select 1 from public.lineup_artist la where la.lineup_id = l.lineup_id and la.status = 'active' and la.artist_id = p_artist_id),
                    'is_current', l.version = (select max(l2.version) from public.lineup l2
                                                where l2.occurrence_id = l.occurrence_id and l2.place_id is not distinct from l.place_id and l2.status = 'active'))
                  order by coalesce(l.place_id = p_place_id, false) desc, lp.name nulls first, l.version desc)
             from public.lineup l left join public.place lp on lp.place_id = l.place_id
            where l.occurrence_id = o.occurrence_id and l.status = 'active'), '[]'::jsonb)
    from occ o
    join public.event e on e.event_id = o.event_id
    left join public.place pp on pp.place_id = o.primary_place_id
   order by o.event_date desc, e.name
   limit 50;
$$;

comment on function public.find_lineups(uuid, date, uuid, uuid, uuid, int) is
  'Occurrences matching a date and/or event, place, artist (or one occurrence), each with its active line-ups. Runs under the caller''s RLS.';

revoke execute on function public.find_lineups(uuid, date, uuid, uuid, uuid, int) from public, anon;
grant  execute on function public.find_lineups(uuid, date, uuid, uuid, uuid, int) to authenticated;
