-- An edition has its own site.
--
-- A festival brand keeps one site (electricdaisycarnival.com) while every
-- edition publishes its bill on its own (edcorlando.com, edclasvegas.com).
-- With nowhere to put that, the line-up agent was handed the brand's site,
-- whose sitemap knows nothing about the night, and had to search blind — the
-- EDC Orlando bill was never found. The occurrence keeps its own URL, and the
-- agent reads it first.
alter table public.event_occurrence
  add column website_url text;

comment on column public.event_occurrence.website_url is
  'The edition''s own site, when it has one apart from the event''s (edcorlando.com under electricdaisycarnival.com). The line-up agent reads its sitemap for the night before searching.';

-- save_event_with_occurrences(): each occurrence may carry website_url.
-- Same body as 20260921160000 otherwise.
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
        (event_id, event_date, primary_place_id, occurrence_name, starts_at, ends_at, timezone, status, part_of_occurrence_id, website_url)
      values (
        v_event_id,
        (o ->> 'event_date')::date,
        v_place,
        nullif(o ->> 'occurrence_name', ''),
        (o ->> 'starts_at')::timestamptz,
        (o ->> 'ends_at')::timestamptz,
        nullif(o ->> 'timezone', ''),
        coalesce(nullif(o ->> 'status', '')::public.record_status, 'active'),
        nullif(o ->> 'part_of_occurrence_id', '')::uuid,
        nullif(o ->> 'website_url', ''))
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
        part_of_occurrence_id = nullif(o ->> 'part_of_occurrence_id', '')::uuid,
        website_url           = nullif(o ->> 'website_url', '')
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
  'Saves an event and its occurrences in one transaction. An occurrence may carry new_place {name, city, country, timezone, …} (created or reused by name, tagged with the event name), part_of_occurrence_id (the umbrella it belongs to) and website_url (the edition''s own site). Occurrences missing from p_occurrences become inactive; one with a line-up or a schedule refuses that.';
