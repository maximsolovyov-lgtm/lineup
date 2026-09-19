-- PENDING — do NOT move this into supabase/migrations/ yet.
--
-- Applying it before the code below is updated breaks `npm run build`,
-- `supabase/seed.sql` and six tests in `supabase/test/rls_test.sql`.
--
-- Prerequisites, in order:
--   1. 20260919200000_rooms_to_place_space.sql applied, and the resulting
--      place_space rows eyeballed against the JSON they came from.
--   2. src/features/places/schema.ts      — drop typical_rooms / typical_room_count /
--                                            typical_headliner_room_name from the form
--                                            schema and both mapping directions.
--   3. src/features/places/PlaceFormPage.tsx — remove the three fields; the rooms
--                                            block now edits place_space.
--   4. src/components/form/RoomsEditor.tsx — rewrite against place_space rows,
--                                            or delete if replaced by a new editor.
--   5. supabase/seed.sql                  — the place_space block at the end
--                                          derives rooms from the JSON; replace it
--                                          with plain inserts.
--   6. supabase/test/rls_test.sql         — the four "rooms json" shape tests and
--                                            "valid shape sets typical_room_count"
--                                            go away; add place_space tests, including
--                                            that a second primary room is rejected.
--
-- Then give this file a timestamp, move it into supabase/migrations/, and run
-- `supabase db reset` followed by `npm run db:types`.

-- The trigger stops deriving a column that no longer exists.
create or replace function public.place_before_write()
returns trigger
language plpgsql
as $$
begin
  new.normalized_name := public.normalize_name(new.name);

  if tg_op = 'INSERT' then
    new.created_by_user_id := auth.uid();
    new.created_at := now();
    new.updated_by_user_id := null;
    new.updated_at := null;
  else
    new.created_by_user_id := old.created_by_user_id;
    new.created_at := old.created_at;
    new.updated_by_user_id := auth.uid();
    new.updated_at := now();
  end if;

  return new;
end;
$$;

alter table public.place drop constraint if exists ck_place_rooms_json;
alter table public.place drop constraint if exists ck_place_room_count;

alter table public.place
  drop column if exists typical_rooms_json,
  drop column if exists typical_headliner_room_name,
  drop column if exists typical_room_count;

-- Granted to authenticated in 20260914010500_rls.sql; revoke before dropping.
revoke execute on function public.is_valid_rooms_json(jsonb) from authenticated;
drop function if exists public.is_valid_rooms_json(jsonb);
