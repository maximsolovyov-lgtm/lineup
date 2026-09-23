-- A fourth kind of placeholder: the act is on the bill but nobody knows who.
--
-- 'tbd' promises a name later, 'secret_guest' withholds one deliberately.
-- 'unknown' is neither: the source names a slot we cannot identify ("local
-- support", an unreadable poster line, a set credited to no one). It is not
-- an anomaly when it never resolves.
--
-- Its own migration on purpose: a new enum value cannot be used in the
-- transaction that adds it.
alter type public.placeholder_type add value if not exists 'unknown';
