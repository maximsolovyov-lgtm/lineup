-- A line-up may name an artist the database does not know yet.
--
-- The line-up agent reads a publication and returns names; some are not
-- artist records. Rather than making the operator create each one first, a
-- slot may carry `new_artist: { name }`: save_lineup() reuses an active
-- artist with the same normalised name or creates one (artist_type
-- 'unknown', no members) in the same transaction, and records a review
-- task so the artist gets enriched later — the artist agent does that in
-- one click. Same body as 20260920150000 otherwise.
create or replace function public.save_lineup(p_lineup jsonb, p_artists jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id      uuid := nullif(p_lineup ->> 'lineup_id', '')::uuid;
  r         public.lineup;
  a         jsonb;
  v_aid     uuid;
  v_ids     uuid[] := '{}';
  v_ord     int := 0;
  v_artist  uuid;
  v_name    text;
begin
  if jsonb_typeof(p_lineup) is distinct from 'object' then
    raise exception 'p_lineup must be a JSON object' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_typeof(p_artists) is distinct from 'array' then
    raise exception 'p_artists must be a JSON array' using errcode = 'invalid_parameter_value';
  end if;

  r := jsonb_populate_record(null::public.lineup, p_lineup - 'lineup_id');
  if r.occurrence_id is null then
    raise exception 'occurrence_id is required' using errcode = 'invalid_parameter_value';
  end if;

  if v_id is null then
    if r.version is null then
      select coalesce(max(version), 0) + 1 into r.version
        from public.lineup
       where occurrence_id = r.occurrence_id and place_id is not distinct from r.place_id;
    end if;
    insert into public.lineup (occurrence_id, place_id, version, published_at, source_id, notes, status)
    values (r.occurrence_id, r.place_id, r.version, r.published_at, r.source_id, r.notes, coalesce(r.status, 'active'))
    returning lineup_id into v_id;
  else
    update public.lineup set
      occurrence_id = r.occurrence_id, place_id = r.place_id,
      version = coalesce(r.version, version), published_at = r.published_at,
      source_id = r.source_id, notes = r.notes, status = coalesce(r.status, status)
    where lineup_id = v_id;
    if not found then
      raise exception 'Line-up % does not exist or is not editable', v_id using errcode = 'no_data_found';
    end if;
  end if;

  for a in select e from jsonb_array_elements(p_artists) as e loop
    v_ord := v_ord + 1;
    v_aid := nullif(a ->> 'lineup_artist_id', '')::uuid;
    v_artist := nullif(a ->> 'artist_id', '')::uuid;

    -- new_artist: { name } — an act the publication names that is not stored yet.
    v_name := nullif(btrim(coalesce(a -> 'new_artist' ->> 'name', '')), '');
    if v_artist is null and v_name is not null then
      select artist_id into v_artist from public.artist
       where status = 'active' and normalized_name = public.normalize_name(v_name)
       order by created_at limit 1;
      if v_artist is null then
        insert into public.artist (name, artist_type, status) values (v_name, 'unknown', 'active')
        returning artist_id into v_artist;
        insert into public.review_task (entity_type, entity_id, kind, message)
        values ('artist', v_artist, 'artist_created_from_lineup',
                format('"%s" was created from a line-up with no type, country or members. Run the artist agent or fill it in.', v_name))
        on conflict (entity_type, entity_id, kind) where status = 'active' do nothing;
      end if;
    end if;

    if v_aid is null then
      insert into public.lineup_artist (lineup_id, artist_id, placeholder_type, display_name_override, is_headliner, billing_order, status)
      values (v_id,
              v_artist,
              nullif(a ->> 'placeholder_type', '')::public.placeholder_type,
              nullif(a ->> 'display_name_override', ''),
              coalesce((a ->> 'is_headliner')::boolean, false),
              v_ord, 'active')
      returning lineup_artist_id into v_aid;
    else
      update public.lineup_artist set
        artist_id             = v_artist,
        placeholder_type      = nullif(a ->> 'placeholder_type', '')::public.placeholder_type,
        display_name_override = nullif(a ->> 'display_name_override', ''),
        is_headliner          = coalesce((a ->> 'is_headliner')::boolean, false),
        billing_order         = v_ord,
        status                = 'active'
      where lineup_artist_id = v_aid and lineup_id = v_id;
      if not found then
        raise exception 'Line-up artist % does not belong to line-up %', v_aid, v_id using errcode = 'check_violation';
      end if;
    end if;
    v_ids := v_ids || v_aid;
  end loop;

  update public.lineup_artist set status = 'inactive'
   where lineup_id = v_id and status = 'active' and not (lineup_artist_id = any (v_ids));

  return v_id;

exception
  when unique_violation then
    if sqlerrm like '%uq_lineup_version%' then
      raise exception 'This occurrence and place already have a line-up with that version' using errcode = 'unique_violation';
    end if;
    if sqlerrm like '%uq_lineup_artist%' then
      raise exception 'The same artist is listed twice' using errcode = 'unique_violation';
    end if;
    raise;
end;
$$;

comment on function public.save_lineup(jsonb, jsonb) is
  'Saves a line-up version and its artists in one transaction. New line-up without version = next version for (occurrence, place). A slot with new_artist {name} reuses or creates the artist (type unknown, with a review task).';
