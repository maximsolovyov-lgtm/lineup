-- v1.4 delta, part 4 of 4: row-level security for the new tables.
--
-- Same model as 20260914010500_rls.sql:
--   admin    - everything, including user management.
--   operator - select/insert/update on all business tables.
--   anon     - nothing.
-- No hard delete for anyone; "deactivate" is a status change.
--
-- performance_set_participant_person has no status column: it is a factual
-- join, written when the announced line-up differs from the membership. It is
-- removed by deleting the row, which no policy grants; corrections go through
-- the parent participant.

do $$
declare
  t text;
begin
  foreach t in array array[
    'person', 'artist_membership', 'program_release',
    'performance_set_participant_person'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);

    execute format($p$
      create policy %I on public.%I
        for select to authenticated
        using (public.is_operator_or_admin())
    $p$, t || '_select', t);

    execute format($p$
      create policy %I on public.%I
        for insert to authenticated
        with check (public.is_operator_or_admin())
    $p$, t || '_insert', t);

    execute format($p$
      create policy %I on public.%I
        for update to authenticated
        using (public.is_operator_or_admin())
        with check (public.is_operator_or_admin())
    $p$, t || '_update', t);
  end loop;
end
$$;
