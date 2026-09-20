-- Phases 4 and 5: people, artists, events and occurrences edited in the admin.
--
-- Same shape as 20260919230000_place_space_editing.sql: a parent and its
-- children are saved by one SECURITY INVOKER function called through RPC, so
-- the save is one transaction and RLS stays the authority. Children left out
-- of the list become inactive, never deleted; a child something else refers
-- to refuses that and fails the whole save.

-- Privileges -----------------------------------------------------------------------------
-- Supabase's default privileges grant ALL on every new table to authenticated.
-- 20260919120300_v14_rls_delta.sql granted select/insert/update on the v1.4
-- tables without revoking the rest, so DELETE stayed granted. RLS has no delete
-- policy, so no row could actually go — the statement just succeeded with zero
-- rows — but "no hard delete for anyone" is enforced twice from here on, and
-- tables created by later migrations start closed.
revoke delete, truncate, references, trigger
  on public.person, public.artist_membership, public.program_release,
     public.performance_set_participant_person
  from anon, authenticated;

alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- Columns the mockups need that the v1.4 model did not carry ----------------------
-- design/EventEdit.dc.html: description and site. design/ArtistEdit.dc.html:
-- country and Instagram. Free reference fields, no ingestion behind them yet.
alter table public.event
  add column description text,
  add column website_url text;

alter table public.artist
  add column country       varchar(64),
  add column instagram_url text;

-- review_task -----------------------------------------------------------------------
-- Validation that can fire on incomplete data must not block a save (CLAUDE.md).
-- It records a task instead. One open task per (entity, kind); resolving it is a
-- status change to 'closed', and a save that makes the data consistent closes
-- it automatically.
create table public.review_task (
  review_task_id uuid primary key default gen_random_uuid(),
  entity_type    varchar(64) not null,
  entity_id      uuid not null,
  kind           varchar(64) not null,
  message        text not null,
  status         public.record_status not null default 'active',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz
);
comment on table public.review_task is
  'Advisory findings that must not block a save: an artist_type that does not match the member count, a secret-guest slot that vanished. active = open, closed = resolved.';

create unique index uq_review_task_open
  on public.review_task (entity_type, entity_id, kind)
  where status = 'active';
create index idx_review_task_entity on public.review_task (entity_type, entity_id);

create trigger trg_review_task_updated_at
  before update on public.review_task
  for each row execute function public.set_updated_at();

alter table public.review_task enable row level security;
revoke all on public.review_task from anon, authenticated;
grant select, insert, update on public.review_task to authenticated;
create policy review_task_select on public.review_task
  for select to authenticated using (public.is_operator_or_admin());
create policy review_task_insert on public.review_task
  for insert to authenticated with check (public.is_operator_or_admin());
create policy review_task_update on public.review_task
  for update to authenticated using (public.is_operator_or_admin()) with check (public.is_operator_or_admin());

-- Guard: an occurrence with a schedule or a release cannot leave 'active' ------------
-- Cancelling is different: 'cancelled' is a notification event and stays allowed;
-- what is refused is making the row vanish from the admin ('inactive' etc.).
create or replace function public.event_occurrence_guard_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'active'
     and new.status not in ('active', 'cancelled')
     and (exists (select 1 from public.performance_set ps where ps.occurrence_id = old.occurrence_id)
          or exists (select 1 from public.program_release pr where pr.occurrence_id = old.occurrence_id)) then
    raise exception 'Occurrence on % has a schedule or a release and cannot be removed; cancel it instead', old.event_date
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;
revoke execute on function public.event_occurrence_guard_status() from public, anon, authenticated;

create trigger trg_event_occurrence_guard_status
  before update of status on public.event_occurrence
  for each row execute function public.event_occurrence_guard_status();

-- save_artist_with_members ------------------------------------------------------------
-- p_artist:  { artist_id?, name, artist_type?, country?, instagram_url?, status? }
-- p_members: array in display order of
--   { membership_id?, person_id? | new_person: { display_name, country?, notes? },
--     membership_role?, is_primary?, started_at?, ended_at? }
-- A member with new_person creates the person in the same transaction — the
-- picker's "create and add" never leaves a person behind when the artist save
-- fails. Active memberships not in the array become inactive.
--
-- Advisory check (never blocks): solo expects 1 current member, duo 2,
-- group/collective at least 2. Only judged once at least one member is
-- recorded — an artist with no members yet is incomplete, not wrong.
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
    insert into public.artist (name, artist_type, country, instagram_url, status)
    values (r.name, r.artist_type, r.country, r.instagram_url, coalesce(r.status, 'active'))
    returning artist_id into v_artist_id;
  else
    update public.artist set
      name = r.name, artist_type = r.artist_type, country = r.country,
      instagram_url = r.instagram_url, status = coalesce(r.status, status)
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

    -- Without a membership_id, an existing membership of the same person with
    -- the same start date is the same membership: reuse it rather than trip the
    -- unique index. Makes the call idempotent for clients that resend the list.
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

  -- Advisory type/member check --------------------------------------------------
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
  'Saves an artist and its memberships in one transaction; new people can be created inline. Memberships missing from p_members become inactive. Records a review_task when artist_type and member count disagree instead of failing.';

revoke execute on function public.save_artist_with_members(jsonb, jsonb) from public, anon;
grant  execute on function public.save_artist_with_members(jsonb, jsonb) to authenticated;

-- save_event_with_occurrences ---------------------------------------------------------
-- p_event:       { event_id?, name, event_type?, description?, website_url?, status? }
-- p_occurrences: array of { occurrence_id?, event_date, primary_place_id?, starts_at,
--                           ends_at, timezone?, occurrence_name?, status? }
-- event_date is the BUSINESS DAY, entered by the operator, never derived here:
-- 23:00 Friday to 08:00 Saturday is Friday. Occurrences left out of the array
-- become inactive; the guard trigger refuses that for one with a schedule.
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
  v_id       uuid;
  v_ids      uuid[] := '{}';
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

  for o in select e from jsonb_array_elements(p_occurrences) as e loop
    v_id := nullif(o ->> 'occurrence_id', '')::uuid;
    if v_id is null then
      insert into public.event_occurrence
        (event_id, event_date, primary_place_id, occurrence_name, starts_at, ends_at, timezone, status)
      values (
        v_event_id,
        (o ->> 'event_date')::date,
        nullif(o ->> 'primary_place_id', '')::uuid,
        nullif(o ->> 'occurrence_name', ''),
        (o ->> 'starts_at')::timestamptz,
        (o ->> 'ends_at')::timestamptz,
        nullif(o ->> 'timezone', ''),
        coalesce(nullif(o ->> 'status', '')::public.record_status, 'active'))
      returning occurrence_id into v_id;
    else
      update public.event_occurrence set
        event_date       = (o ->> 'event_date')::date,
        primary_place_id = nullif(o ->> 'primary_place_id', '')::uuid,
        occurrence_name  = nullif(o ->> 'occurrence_name', ''),
        starts_at        = (o ->> 'starts_at')::timestamptz,
        ends_at          = (o ->> 'ends_at')::timestamptz,
        timezone         = nullif(o ->> 'timezone', ''),
        status           = coalesce(nullif(o ->> 'status', '')::public.record_status, 'active')
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
  'Saves an event and its occurrences in one transaction. Occurrences missing from p_occurrences become inactive; one with a schedule or a release refuses that.';

revoke execute on function public.save_event_with_occurrences(jsonb, jsonb) from public, anon;
grant  execute on function public.save_event_with_occurrences(jsonb, jsonb) to authenticated;
