-- An unclear line reads as it was printed.
--
-- lineup_slot_label() joins the acts the way the kind joins them, which for an
-- unclear line means "&" — and "&" is exactly the reading the operator has not
-- made yet. "Circle feat Supa D B2B Kismet B2B Feva & Tippa" came back as
-- "Circle & Supa D & Kismet & Feva & Tippa": a claim the source never made.
-- When the kind is unknown and the printed line was kept, the printed line is
-- the honest label.
create or replace function public.lineup_slot_label(p_kind public.lineup_slot_kind, p_names text[], p_printed text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_names is null or cardinality(p_names) = 0 then nullif(btrim(coalesce(p_printed, '')), '')
    when p_kind = 'unknown' and nullif(btrim(coalesce(p_printed, '')), '') is not null then btrim(p_printed)
    when cardinality(p_names) = 1 then p_names[1]
    when p_kind in ('b2b', 'b3b', 'b4b') then array_to_string(p_names, ' ' || p_kind::text || ' ')
    when p_kind = 'featuring' then p_names[1] || ' feat. ' || array_to_string(p_names[2:], ', ')
    when p_kind = 'multiple_guests' then p_names[1] || ' + ' || array_to_string(p_names[2:], ', ')
    else array_to_string(p_names, ' & ')
  end;
$$;

comment on function public.lineup_slot_label(public.lineup_slot_kind, text[], text) is
  'Display label of one slot: "Solomun b2b Dixon", "Jamie Jones feat. Seth Troxler", the printed line when the kind is still unclear, or when no act is named.';
