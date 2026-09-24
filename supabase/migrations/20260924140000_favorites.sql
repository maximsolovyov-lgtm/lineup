-- The records an operator keeps an eye on.
--
-- A favourite is PERSONAL, not a property of the record: two operators watch
-- different venues, and a star one of them clears must not vanish for the
-- other. So it is a row per (user, record), not a column per table — which
-- also means adding a seventh kind of record later costs nothing here.
--
-- entity_type is checked against the list rather than being a foreign key:
-- one table cannot reference seven, and a favourite that outlives its record
-- is harmless (the lists join on ids that exist).
create table public.user_favorite (
  user_id     uuid not null references auth.users (id) on delete cascade,
  entity_type varchar(32) not null,
  entity_id   uuid not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, entity_type, entity_id),
  constraint ck_user_favorite_entity check (
    entity_type in ('place', 'event', 'artist', 'person', 'lineup', 'performance_set', 'event_occurrence'))
);

comment on table public.user_favorite is
  'Records one operator has starred. Personal: every policy scopes to auth.uid(), so a star is never shared or cleared by someone else. Toggled by inserting and deleting, never updated.';

create index idx_user_favorite_entity on public.user_favorite (entity_type, entity_id);

-- RLS: your own stars, nobody else's — not even an admin's, which is the point
-- of a favourite. Operator or admin, like every other business table.
alter table public.user_favorite enable row level security;
revoke all on public.user_favorite from anon, authenticated;
grant select, insert, delete on public.user_favorite to authenticated;

create policy user_favorite_select on public.user_favorite for select to authenticated
  using (user_id = auth.uid() and public.is_operator_or_admin());
create policy user_favorite_insert on public.user_favorite for insert to authenticated
  with check (user_id = auth.uid() and public.is_operator_or_admin());
create policy user_favorite_delete on public.user_favorite for delete to authenticated
  using (user_id = auth.uid() and public.is_operator_or_admin());
