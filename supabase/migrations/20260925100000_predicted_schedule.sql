-- A predicted timetable, written in one transaction.
--
-- A line-up says who plays; the timetable says when. Generating it is one
-- action for the operator, so it must be one transaction for the database:
-- a dozen save_performance_set() calls from the browser is exactly the
-- sequence of per-row requests CLAUDE.md forbids, and a failure halfway
-- through would leave a night with half a schedule.
--
-- The rows are ordinary predicted sets: scenario_version comes from the
-- line-up they were derived from (save_performance_set() reads it), so a
-- prediction always says which publication it was predicted from, and
-- information_origin is 'predicted' — nothing here pretends to be announced.
--
-- Re-generating supersedes the previous prediction for that line-up rather
-- than deleting it: history is what lets a prediction be compared with what
-- happened. There is no row-for-row pairing (a new plan may have a different
-- number of sets), so supersedes_performance_set_id stays null and the old
-- rows simply leave 'active'.
create or replace function public.save_predicted_sets(
  p_occurrence_id uuid,
  p_lineup_id     uuid,
  p_sets          jsonb,
  p_replace       boolean default true
)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  e       jsonb;
  v_n     int := 0;
  v_place uuid;
begin
  if jsonb_typeof(p_sets) is distinct from 'array' then
    raise exception 'p_sets must be a JSON array' using errcode = 'invalid_parameter_value';
  end if;
  if p_occurrence_id is null or p_lineup_id is null then
    raise exception 'occurrence_id and lineup_id are required' using errcode = 'invalid_parameter_value';
  end if;
  if not exists (select 1 from public.lineup l
                  where l.lineup_id = p_lineup_id and l.occurrence_id = p_occurrence_id and l.status = 'active') then
    raise exception 'That line-up does not belong to this occurrence' using errcode = 'check_violation';
  end if;

  if p_replace then
    update public.performance_set set status = 'superseded'
     where occurrence_id = p_occurrence_id and lineup_id = p_lineup_id
       and scenario_type = 'predicted' and status = 'active';
  end if;

  for e in select x from jsonb_array_elements(p_sets) as x loop
    v_place := nullif(e ->> 'place_id', '')::uuid;
    perform public.save_performance_set(
      jsonb_build_object(
        'occurrence_id', p_occurrence_id,
        'lineup_id', p_lineup_id,
        'place_id', v_place,
        'place_space_id', nullif(e ->> 'place_space_id', ''),
        'scenario_type', 'predicted',
        'completeness', coalesce(nullif(e ->> 'completeness', ''), 'partial'),
        'set_type', coalesce(nullif(e ->> 'set_type', ''), 'unknown'),
        'display_name', nullif(e ->> 'display_name', ''),
        'scheduled_start_at', e ->> 'scheduled_start_at',
        'scheduled_end_at', e ->> 'scheduled_end_at',
        'sequence_number', nullif(e ->> 'sequence_number', '')::int,
        'event_day', nullif(e ->> 'event_day', ''),
        'place_role', nullif(e ->> 'place_role', ''),
        'information_origin', 'predicted',
        'confirmation_status', 'unconfirmed',
        'confidence_score', nullif(e ->> 'confidence_score', '')::numeric,
        'notes', nullif(e ->> 'notes', ''),
        'status', 'active'),
      case when jsonb_typeof(e -> 'participants') = 'array' then e -> 'participants' else '[]'::jsonb end);
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

comment on function public.save_predicted_sets(uuid, uuid, jsonb, boolean) is
  'Writes a predicted timetable for one occurrence from one line-up, in one transaction. Each element of p_sets is { place_id?, place_space_id?, set_type, display_name?, scheduled_start_at, scheduled_end_at, sequence_number?, event_day?, place_role?, confidence_score?, notes?, participants: [...] } and goes through save_performance_set(), so the version comes from the line-up and the immutability rules hold. p_replace supersedes the previous prediction for that line-up instead of deleting it.';

revoke execute on function public.save_predicted_sets(uuid, uuid, jsonb, boolean) from public, anon;
grant  execute on function public.save_predicted_sets(uuid, uuid, jsonb, boolean) to authenticated;
