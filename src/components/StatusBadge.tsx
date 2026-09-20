import type { Enums } from '@/types/database';

// Colour per status, as in design/Main.dc.html: a dot and the word.
const INK: Record<Enums<'record_status'>, string> = {
  active: '#166534',
  draft: '#B45309',
  inactive: '#B45309',
  closed: '#8A8199',
  cancelled: '#A8384A',
  superseded: '#8A8199',
  archived: '#8A8199',
  deleted: '#A8384A',
};

export function StatusBadge({ status }: { status: Enums<'record_status'> }) {
  const ink = INK[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px]" style={{ color: ink }}>
      <span className="h-[7px] w-[7px] rounded-full" style={{ background: ink }} aria-hidden />
      {status}
    </span>
  );
}
