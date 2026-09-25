import { Star } from 'lucide-react';
import { slotLabel } from '@/lib/slot-label';
import { SLOT_FORMAT_INFO, SLOT_KIND_INFO, SLOT_TAG_INFO, type LineupSlotKind, type LineupSlotTag, type PerformanceFormat } from './schema';

/** A slot as the queries return it — the shape the read-only summary needs. */
export interface SlotSummaryRow {
  lineup_artist_id: string;
  kind: LineupSlotKind;
  performance_format: PerformanceFormat;
  tags: LineupSlotTag[] | null;
  placeholder_type: string | null;
  is_headliner: boolean;
  billing_order: number | null;
  slot_date: string | null;
  display_name_override: string | null;
  space: { name: string } | null;
  lineup_artist_participant: { participant_order: number; artist_id: string; artist: { name: string } | null }[];
}

const CHIP = 'rounded-full border px-2 py-0.5 font-mono text-[11px]';

function actNames(slot: SlotSummaryRow): string[] {
  return [...(slot.lineup_artist_participant ?? [])]
    .sort((a, b) => a.participant_order - b.participant_order)
    .map((p) => p.artist?.name ?? '')
    .filter(Boolean);
}

/**
 * The lines of a line-up, read-only, exactly as the line-up editor shows them
 * collapsed: the day, the kind, the acts as they are printed, the room and only
 * the tags the line actually carries. Used wherever a line-up is shown but not
 * edited — the occurrence screen, for one.
 */
export function SlotSummary({ slots, showDays = false }: { slots: SlotSummaryRow[]; showDays?: boolean }) {
  const rows = [...slots].sort((a, b) => (a.billing_order ?? 0) - (b.billing_order ?? 0));
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No lines on this version.</p>;
  return (
    <ul className="divide-y rounded-lg border">
      {rows.map((s) => {
        const info = SLOT_KIND_INFO[s.kind];
        const label = slotLabel(s.kind, actNames(s), s.display_name_override ?? '');
        return (
          <li key={s.lineup_artist_id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5">
            {showDays && (
              <span className={`${CHIP} ${s.slot_date ? 'bg-card text-muted-foreground' : 'border-dashed text-amber-700'}`}>
                {s.slot_date ?? 'no day'}
              </span>
            )}
            <span className={`${CHIP} bg-card text-muted-foreground`} title={info.rule}>{info.label}</span>
            <span className="text-sm font-medium">{label || '—'}</span>
            {s.is_headliner && <Star className="h-3.5 w-3.5 fill-primary text-primary" aria-label="Headliner" />}
            {s.performance_format !== 'dj_set' && (
              <span className={`${CHIP} bg-secondary text-secondary-foreground`} title={SLOT_FORMAT_INFO[s.performance_format].hint}>
                {SLOT_FORMAT_INFO[s.performance_format].label}
              </span>
            )}
            {s.space?.name && <span className={`${CHIP} bg-card text-muted-foreground`}>{s.space.name}</span>}
            {(s.tags ?? []).map((t) => (
              <span key={t} className={`${CHIP} border-primary bg-primary text-primary-foreground`} title={SLOT_TAG_INFO[t].hint}>{SLOT_TAG_INFO[t].label}</span>
            ))}
            {s.placeholder_type && actNames(s).length > 0 && (
              <span className={`${CHIP} bg-secondary text-secondary-foreground`}>
                {s.placeholder_type === 'secret_guest' ? 'was a secret guest' : s.placeholder_type === 'tbd' ? 'was TBA' : 'was unidentified'}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
