-- What we have learned about where a brand's and an act's news comes from.
--
-- A place has carried news_pattern and lineup_pattern since the first
-- migration, and it is what makes the second reading of a venue better than
-- the first: where its bills appear, what its wording means. An event and an
-- artist need exactly the same memory — "the winter edition publishes on
-- Instagram three weeks ahead", "the tour dates on the label site are stale,
-- use the booking agency" — and now that AI actualization can be told such a
-- thing by the operator, it needs somewhere to keep it.
alter table public.event
  add column news_pattern   text,
  add column lineup_pattern text;

alter table public.artist
  add column news_pattern   text,
  add column lineup_pattern text;

comment on column public.event.news_pattern is
  'Where and how news about this brand appears, in the operator''s or the agent''s words. Accumulated knowledge: an actualization merges what it learns into it rather than replacing it.';
comment on column public.event.lineup_pattern is
  'How this brand publishes its bills — where, how far ahead, what its wording means (which separator is a shared set, whether the run is split by day).';
comment on column public.artist.news_pattern is
  'Where and how news about this act appears (the agency page, the label, which Instagram account is the real one).';
comment on column public.artist.lineup_pattern is
  'How this act is printed on a bill: the spelling to expect, the aliases it plays under, whether it is announced as a b2b.';

-- save_event_with_occurrences(): the event keeps its patterns.
-- Same body as 20260923140000 otherwise.
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
    insert into public.event (name, event_type, description, website_url, news_pattern, lineup_pattern, status)
    values (r.name, coalesce(r.event_type, 'party'), r.description, r.website_url, r.news_pattern, r.lineup_pattern, coalesce(r.status, 'active'))
    returning event_id into v_event_id;
  else
    update public.event set
      name = r.name, event_type = coalesce(r.event_type, event_type),
      description = r.description, website_url = r.website_url,
      news_pattern = r.news_pattern, lineup_pattern = r.lineup_pattern,
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
  'Saves an event (its patterns included) and its occurrences in one transaction. An occurrence may carry new_place {name, city, country, timezone, …} (created or reused by name, tagged with the event name), part_of_occurrence_id (the umbrella it belongs to) and website_url (the edition''s own site). Occurrences missing from p_occurrences become inactive; one with a line-up or a schedule refuses that.';

-- save_artist_with_members(): the artist keeps its patterns.
-- Same body as 20260920100000 otherwise.
create or replace function public.save_artist_with_members(p_artist jsonb, p_members jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_artist_id uuid := nullif(p_artist ->> 'artist_id', '')::uuid;
  r           public.artist;
  m           jsonb;
  v_id        uuid;
  v_person    uuid;
  v_ids       uuid[] := '{}';
  v_ord       int := 0;
  v_type      public.artist_type;
  v_current   int;
  v_expected  text;
  v_message   text;
begin
  if jsonb_typeof(p_artist) is distinct from 'object' then
    raise exception 'p_artist must be a JSON object' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_typeof(p_members) is distinct from 'array' then
    raise exception 'p_members must be a JSON array' using errcode = 'invalid_parameter_value';
  end if;

  r := jsonb_populate_record(null::public.artist, p_artist - 'artist_id');

  if v_artist_id is null then
    insert into public.artist (name, artist_type, country, instagram_url, news_pattern, lineup_pattern, status)
    values (r.name, r.artist_type, r.country, r.instagram_url, r.news_pattern, r.lineup_pattern, coalesce(r.status, 'active'))
    returning artist_id into v_artist_id;
  else
    update public.artist set
      name = r.name, artist_type = r.artist_type, country = r.country,
      instagram_url = r.instagram_url, news_pattern = r.news_pattern, lineup_pattern = r.lineup_pattern,
      status = coalesce(r.status, status)
    where artist_id = v_artist_id;
    if not found then
      raise exception 'Artist % does not exist or is not editable', v_artist_id using errcode = 'no_data_found';
    end if;
  end if;

  for m in select e from jsonb_array_elements(p_members) as e loop
    v_ord := v_ord + 1;
    v_id := nullif(m ->> 'membership_id', '')::uuid;
    v_person := nullif(m ->> 'person_id', '')::uuid;

    if v_person is null and jsonb_typeof(m -> 'new_person') = 'object' then
      insert into public.person (display_name, country, notes)
      values (m -> 'new_person' ->> 'display_name',
              nullif(m -> 'new_person' ->> 'country', ''),
              nullif(m -> 'new_person' ->> 'notes', ''))
      returning person_id into v_person;
    end if;
    if v_person is null then
      raise exception 'Member % has neither person_id nor new_person', v_ord using errcode = 'invalid_parameter_value';
    end if;

    if v_id is null then
      select membership_id into v_id from public.artist_membership
       where artist_id = v_artist_id and person_id = v_person
         and started_at is not distinct from nullif(m ->> 'started_at', '')::date
       limit 1;
    end if;

    if v_id is null then
      insert into public.artist_membership
        (artist_id, person_id, membership_role, is_primary, display_order, started_at, ended_at, status)
      values (
        v_artist_id, v_person,
        nullif(m ->> 'membership_role', '')::public.membership_role,
        coalesce((m ->> 'is_primary')::boolean, false),
        v_ord,
        nullif(m ->> 'started_at', '')::date,
        nullif(m ->> 'ended_at', '')::date,
        'active')
      returning membership_id into v_id;
    else
      update public.artist_membership set
        person_id       = v_person,
        membership_role = nullif(m ->> 'membership_role', '')::public.membership_role,
        is_primary      = coalesce((m ->> 'is_primary')::boolean, false),
        display_order   = v_ord,
        started_at      = nullif(m ->> 'started_at', '')::date,
        ended_at        = nullif(m ->> 'ended_at', '')::date,
        status          = 'active'
      where membership_id = v_id and artist_id = v_artist_id;
      if not found then
        raise exception 'Membership % does not belong to artist %', v_id, v_artist_id using errcode = 'check_violation';
      end if;
    end if;
    v_ids := v_ids || v_id;
  end loop;

  update public.artist_membership set status = 'inactive'
   where artist_id = v_artist_id and status = 'active' and not (membership_id = any (v_ids));

  select artist_type into v_type from public.artist where artist_id = v_artist_id;
  select count(*) into v_current from public.artist_membership
   where artist_id = v_artist_id and status = 'active' and ended_at is null;

  v_expected := case v_type
    when 'solo' then '1'
    when 'duo' then '2'
    when 'group' then '2+'
    when 'collective' then '2+'
    else null end;

  if v_expected is not null and v_current > 0 and (
       (v_expected = '1'  and v_current <> 1) or
       (v_expected = '2'  and v_current <> 2) or
       (v_expected = '2+' and v_current < 2)) then
    v_message := format('artist_type "%s" expects %s current member(s); %s recorded', v_type, v_expected, v_current);
    insert into public.review_task (entity_type, entity_id, kind, message)
    values ('artist', v_artist_id, 'artist_type_member_count', v_message)
    on conflict (entity_type, entity_id, kind) where status = 'active'
    do update set message = excluded.message;
  else
    update public.review_task set status = 'closed'
     where entity_type = 'artist' and entity_id = v_artist_id
       and kind = 'artist_type_member_count' and status = 'active';
  end if;

  return v_artist_id;

exception
  when unique_violation then
    if sqlerrm like '%uq_artist_membership%' then
      raise exception 'The same person is listed twice with the same start date' using errcode = 'unique_violation';
    end if;
    raise;
end;
$$;

comment on function public.save_artist_with_members(jsonb, jsonb) is
  'Saves an artist (its patterns included) and its memberships in one transaction; new people can be created inline. Memberships missing from p_members become inactive. Records a review_task when artist_type and member count disagree instead of failing.';
