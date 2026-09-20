-- PENDING — do NOT move this into supabase/migrations/ yet.
--
-- Applying it before the code below is updated breaks `npm run build`,
-- `supabase/seed.sql` and six tests in `supabase/test/rls_test.sql`.
--
-- Prerequisites, in order (status as of 2026-09-19):
--   1. DONE  20260919200000_rooms_to_place_space.sql applied and verified.
--   2. DONE  src/features/places/schema.ts no longer maps the three columns.
--   3. DONE  src/features/places/PlaceFormPage.tsx edits place_space through
--            save_place_with_spaces() (20260919230000_place_space_editing.sql).
--   4. DONE  RoomsEditor.tsx replaced by src/components/form/SpacesEditor.tsx.
--   5. TODO  supabase/seed.sql — remove typical_rooms_json /
--            typical_headliner_room_name from the place inserts (the
--            place_space inserts at the end already stand on their own).
--   6. TODO  supabase/test/rls_test.sql — remove the four "rooms json" shape
--            tests and "valid shape sets typical_room_count"; the place_space
--            tests already exist.
--   7. TODO  regenerate src/types/database.ts (npm run db:types).
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
