import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Search, Sparkles } from 'lucide-react';
import type { FinderParams } from './generate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LookupField } from '@/components/form/LookupField';
import { StatusBadge } from '@/components/StatusBadge';
import { supabase } from '@/lib/supabase';
import { artistLookup, eventLookup, placeLookup } from '@/lib/lookups';
import type { Database } from '@/types/database';

type Found = Database['public']['Functions']['find_lineups']['Returns'][number];
interface FoundLineup {
  lineup_id: string; version: number; place_id: string | null; place_name: string | null; published_at: string | null;
  status: string; artist_count: number; artists: string[]; matches_artist: boolean; is_current: boolean;
}

/**
 * "Find a line-up": a date and any of event, place, artist. The database
 * resolves the occurrences (a place matches through the occurrence's default
 * place, a line-up or a set at it; an artist through line-ups and sets) and
 * returns each with its line-ups, so the operator opens the right version
 * or publishes the next one — never a second first version by accident.
 */
interface LineupFinderProps {
  /** Given, the finder hands the raw results over instead of rendering them: the New line-up page drives the AI flow from them. */
  onResults?: (results: Found[], params: FinderParams) => void;
  submitLabel?: string;
  submitIcon?: 'search' | 'sparkles';
  busy?: boolean;
}

export function LineupFinder({ onResults, submitLabel = 'Find', submitIcon = 'search', busy = false }: LineupFinderProps = {}) {
  const navigate = useNavigate();
  const events = useMemo(() => eventLookup(), []);
  const places = useMemo(() => placeLookup(), []);
  const artists = useMemo(() => artistLookup(), []);
  const [date, setDate] = useState('');
  const [days, setDays] = useState('0');
  const [eventId, setEventId] = useState<string | null>(null);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [artistId, setArtistId] = useState<string | null>(null);
  const search = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('find_lineups', {
        p_date: date || undefined,
        p_days: Number.parseInt(days, 10) || 0,
        p_event_id: eventId ?? undefined,
        p_place_id: placeId ?? undefined,
        p_artist_id: artistId ?? undefined,
      });
      if (error) throw error;
      const results = data as Found[];
      if (onResults) {
        // Names of the chosen event/place/artist travel with the params — the agent reads names, not ids.
        const [ev, pl, ar] = await Promise.all([
          eventId ? events.resolve(eventId) : null, placeId ? places.resolve(placeId) : null, artistId ? artists.resolve(artistId) : null,
        ]);
        onResults(results, { date, days: Number.parseInt(days, 10) || 0, eventId, eventName: ev?.label ?? null, placeId, placeName: pl?.label ?? null, artistId, artistName: ar?.label ?? null });
      }
      return results;
    },
  });

  const canSearch = !!(date || eventId || placeId || artistId);
  const results = onResults ? undefined : search.data;

  function newLineup(occurrenceId: string, placeId: string | null, fromLineupId?: string) {
    const q = new URLSearchParams({ occurrence: occurrenceId });
    if (placeId) q.set('place', placeId);
    if (fromLineupId) q.set('from', fromLineupId);
    navigate(`/lineups/new?${q.toString()}`);
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.3px] text-muted-foreground">{onResults ? 'Find the night and generate the line-up' : 'Find a line-up'}</h2>
        <span className="text-xs text-muted-foreground">a date and any of event, place or artist — the occurrence is resolved for you</span>
      </div>
      <form
        className="grid grid-cols-1 gap-3 sm:grid-cols-[9.5rem_5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
        onSubmit={(e) => { e.preventDefault(); if (canSearch) search.mutate(); }}
      >
        <div className="space-y-1">
          <Label htmlFor="lf-date" className="text-xs">Date</Label>
          <Input id="lf-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="lf-days" className="text-xs">± days</Label>
          <Input id="lf-days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} disabled={!date} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Event</Label>
          <LookupField value={eventId} onChange={setEventId} search={events.search} resolve={events.resolve} placeholder="Any event" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Place</Label>
          <LookupField value={placeId} onChange={setPlaceId} search={places.search} resolve={places.resolve} placeholder="Any place" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Artist</Label>
          <LookupField value={artistId} onChange={setArtistId} search={artists.search} resolve={artists.resolve} placeholder="Any artist" />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={!canSearch || search.isPending || busy} className="h-10">
            {submitIcon === 'sparkles' ? <Sparkles /> : <Search />} {search.isPending ? 'Searching…' : submitLabel}
          </Button>
        </div>
      </form>

      {search.isError && <p className="text-sm text-destructive">{(search.error as Error).message}</p>}
      {results && results.length === 0 && (
        <p className="text-sm text-muted-foreground">No occurrence matches. Check the date (it is the business day, the night the party starts) or add the date first on the event.</p>
      )}
      {results && results.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {results.map((r) => {
            const lineups = (r.lineups as unknown as FoundLineup[]) ?? [];
            return (
              <li key={r.occurrence_id} className="space-y-2 px-3 py-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Link to={`/events/${r.event_id}`} className="font-medium underline-offset-2 hover:underline">{r.event_name}</Link>
                  <span className="text-muted-foreground">· {r.event_date}{r.occurrence_name ? ` · ${r.occurrence_name}` : ''}</span>
                  <span className={r.primary_place_name ? 'text-muted-foreground' : 'italic text-muted-foreground'}>· {r.primary_place_name ?? 'no default place'}</span>
                  {r.occurrence_status !== 'active' && <StatusBadge status={r.occurrence_status} />}
                </div>
                {lineups.length === 0 ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm">
                    <span className="text-muted-foreground">No line-up published for this occurrence yet.</span>
                    <span className="flex-1" />
                    <Button type="button" size="sm" onClick={() => newLineup(r.occurrence_id, r.primary_place_id)}><Sparkles /> Create the first line-up</Button>
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {lineups.map((l) => (
                      <li key={l.lineup_id} className={`flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm ${l.is_current ? 'bg-secondary/40' : 'opacity-80'}`}>
                        <Link to={`/lineups/${l.lineup_id}`} className="font-mono font-semibold underline-offset-2 hover:underline">v{l.version}</Link>
                        <span className={l.place_name ? '' : 'italic text-muted-foreground'}>{l.place_name ?? 'place not announced'}</span>
                        {l.is_current && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">current</span>}
                        {l.matches_artist && <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">has this artist</span>}
                        <span className="text-xs text-muted-foreground">
                          {l.artist_count} artist{l.artist_count === 1 ? '' : 's'}{l.artists.length > 0 && `: ${l.artists.slice(0, 5).join(', ')}${l.artists.length > 5 ? '…' : ''}`}
                          {l.published_at && ` · published ${new Date(l.published_at).toLocaleDateString()}`}
                        </span>
                        <span className="flex-1" />
                        <Button asChild size="sm" variant="outline"><Link to={`/lineups/${l.lineup_id}`}>Open</Link></Button>
                        {l.is_current && (
                          <Button type="button" size="sm" variant="secondary" title="Start the next version from this one — this one stays as it was"
                            onClick={() => newLineup(r.occurrence_id, l.place_id, l.lineup_id)}>
                            Publish new version
                          </Button>
                        )}
                      </li>
                    ))}
                    {!lineups.some((l) => l.place_id === (placeId ?? r.primary_place_id)) && (
                      <li className="flex flex-wrap items-center gap-2 px-3 py-1 text-xs text-muted-foreground">
                        No line-up for {placeId ? 'the searched place' : 'the default place'} yet.
                        <button type="button" className="underline" onClick={() => newLineup(r.occurrence_id, placeId ?? r.primary_place_id)}>Create one</button>
                      </li>
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
