-- An occurrence can be part of an umbrella occurrence.
--
-- Miami Music Week, ADE, an island's closing weekend: a brand under which
-- hundreds of independent parties happen, each at its own venue with its
-- own line-up and ticket. The umbrella is not "one occurrence at fifty
-- places" — it has no roster of its own — it is a parent. Each party's
-- occurrence points at the umbrella's occurrence with part_of_occurrence_id;
-- the umbrella is an ordinary event (usually event_type festival) with one
-- occurrence spanning the days, primary_place_id null or the city.
--
-- One level only: an umbrella has no parent, and an occurrence with
-- children cannot become a child. A genuinely multi-venue party (one
-- ticket, two venues at once) is NOT this: that stays one occurrence with
-- line-ups and sets per place (decision 2026-09-19).

alter table public.event_occurrence
  add column part_of_occurrence_id uuid references public.event_occurrence (occurrence_id),
  add constraint event_occurrence_not_part_of_itself check (part_of_occurrence_id is distinct from occurrence_id);

create index idx_event_occurrence_part_of on public.event_occurrence (part_of_occurrence_id) where part_of_occurrence_id is not null;

comment on column public.event_occurrence.part_of_occurrence_id is
  'The umbrella occurrence this one is part of (Miami Music Week 2027, ADE 2026). One level: the umbrella has no parent. Null for a stand-alone date.';

create or replace function public.event_occurrence_part_of_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.part_of_occurrence_id is not null then
    if exists (select 1 from public.event_occurrence p where p.occurrence_id = new.part_of_occurrence_id and p.part_of_occurrence_id is not null) then
      raise exception 'An occurrence cannot be part of one that is itself part of another' using errcode = 'check_violation';
    end if;
    if exists (select 1 from public.event_occurrence c where c.part_of_occurrence_id = new.occurrence_id) then
      raise exception 'An occurrence with parts cannot become part of another' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_event_occurrence_part_of_guard
  before insert or update of part_of_occurrence_id on public.event_occurrence
  for each row execute function public.event_occurrence_part_of_guard();

-- save_event_with_occurrences(): each occurrence may carry part_of_occurrence_id.
-- Same body as 20260920170000 otherwise.
create or replace function public.save_event_with_occurrences(p_event jsonb, p_occurrences jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_event_id uuid := nullif(p_event ->> 'event_id', '')::uuid;
  r          public.event;
  o          jsonb;
  np         jsonb;
  v_id       uuid;
  v_ids      uuid[] := '{}';
  v_place    uuid;
  v_tag      text;
begin
  if jsonb_typeof(p_event) is distinct from 'object' then
    raise exception 'p_event must be a JSON object' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_typeof(p_occurrences) is distinct from 'array' then
    raise exception 'p_occurrences must be a JSON array' using errcode = 'invalid_parameter_value';
  end if;

  r := jsonb_populate_record(null::public.event, p_event - 'event_id');

  if v_event_id is null then
    insert into public.event (name, event_type, description, website_url, status)
    values (r.name, coalesce(r.event_type, 'party'), r.description, r.website_url, coalesce(r.status, 'active'))
    returning event_id into v_event_id;
  else
    update public.event set
      name = r.name, event_type = coalesce(r.event_type, event_type),
      description = r.description, website_url = r.website_url,
      status = coalesce(r.status, status)
    where event_id = v_event_id;
    if not found then
      raise exception 'Event % does not exist or is not editable', v_event_id using errcode = 'no_data_found';
    end if;
  end if;

  select left(btrim(name), 64) into v_tag from public.event where event_id = v_event_id;

  for o in select e from jsonb_array_elements(p_occurrences) as e loop
    v_id := nullif(o ->> 'occurrence_id', '')::uuid;
    v_place := nullif(o ->> 'primary_place_id', '')::uuid;

    np := o -> 'new_place';
    if v_place is null and jsonb_typeof(np) = 'object' and coalesce(np ->> 'name', '') <> '' then
      select place_id into v_place from public.place
       where normalized_name = public.normalize_name(np ->> 'name') and status = 'active'
       order by created_at limit 1;
      if v_place is null then
        insert into public.place (name, city, region, country, timezone, address, lifecycle_type, tags)
        values (np ->> 'name', nullif(np ->> 'city', ''), nullif(np ->> 'region', ''), nullif(np ->> 'country', ''),
                nullif(np ->> 'timezone', ''), nullif(np ->> 'address', ''),
                coalesce(nullif(np ->> 'lifecycle_type', '')::public.place_lifecycle_type, 'permanent'),
                case when v_tag is null or v_tag = '' then '{}'::text[] else array[v_tag] end)
        returning place_id into v_place;
      elsif v_tag is not null and v_tag <> '' then
        update public.place set tags = tags || v_tag
         where place_id = v_place and not exists (select 1 from unnest(tags) t where lower(t) = lower(v_tag));
      end if;
    end if;

    if v_id is null then
      insert into public.event_occurrence
        (event_id, event_date, primary_place_id, occurrence_name, starts_at, ends_at, timezone, status, part_of_occurrence_id)
      values (
        v_event_id,
        (o ->> 'event_date')::date,
        v_place,
        nullif(o ->> 'occurrence_name', ''),
        (o ->> 'starts_at')::timestamptz,
        (o ->> 'ends_at')::timestamptz,
        nullif(o ->> 'timezone', ''),
        coalesce(nullif(o ->> 'status', '')::public.record_status, 'active'),
        nullif(o ->> 'part_of_occurrence_id', '')::uuid)
      returning occurrence_id into v_id;
    else
      update public.event_occurrence set
        event_date            = (o ->> 'event_date')::date,
        primary_place_id      = v_place,
        occurrence_name       = nullif(o ->> 'occurrence_name', ''),
        starts_at             = (o ->> 'starts_at')::timestamptz,
        ends_at               = (o ->> 'ends_at')::timestamptz,
        timezone              = nullif(o ->> 'timezone', ''),
        status                = coalesce(nullif(o ->> 'status', '')::public.record_status, 'active'),
        part_of_occurrence_id = nullif(o ->> 'part_of_occurrence_id', '')::uuid
      where occurrence_id = v_id and event_id = v_event_id;
      if not found then
        raise exception 'Occurrence % does not belong to event %', v_id, v_event_id using errcode = 'check_violation';
      end if;
    end if;
    v_ids := v_ids || v_id;
  end loop;

  update public.event_occurrence set status = 'inactive'
   where event_id = v_event_id and status = 'active' and not (occurrence_id = any (v_ids));

  return v_event_id;
end;
$$;

comment on function public.save_event_with_occurrences(jsonb, jsonb) is
  'Saves an event and its occurrences in one transaction. An occurrence may carry new_place {name, city, country, timezone, …} (created or reused by name, tagged with the event name) and part_of_occurrence_id (the umbrella it belongs to). Occurrences missing from p_occurrences become inactive; one with a line-up or a schedule refuses that.';

-- find_lineups(): an umbrella finds its parts. Searching by the umbrella's
-- event or occurrence lists every party under it; each row says what it is
-- part of. The result columns change, so the function is recreated.
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
            or exists (select 1 from public.lineup l join public.lineup_artist la on la.lineup_id = l.lineup_id
                        where l.occurrence_id = o.occurrence_id and l.status = 'active' and la.status = 'active' and la.artist_id = p_artist_id)
            or exists (select 1 from public.performance_set s join public.performance_set_participant pp on pp.performance_set_id = s.performance_set_id
                        where s.occurrence_id = o.occurrence_id and s.status = 'active' and pp.status = 'active' and pp.artist_id = p_artist_id))
       and (p_occurrence_id is not null or p_date is not null or p_event_id is not null or p_place_id is not null or p_artist_id is not null)
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
    left join public.event_occurrence u on u.occurrence_id = o.part_of_occurrence_id
    left join public.event ue on ue.event_id = u.event_id
   order by o.event_date desc, e.name
   limit 50;
$$;

comment on function public.find_lineups(uuid, date, uuid, uuid, uuid, int) is
  'Occurrences matching a date and/or event, place, artist (or one occurrence — an umbrella lists its parts), each with its active line-ups and what it is part of. Runs under the caller''s RLS.';

revoke execute on function public.find_lineups(uuid, date, uuid, uuid, uuid, int) from public, anon;
grant  execute on function public.find_lineups(uuid, date, uuid, uuid, uuid, int) to authenticated;
