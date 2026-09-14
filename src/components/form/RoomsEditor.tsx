import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export interface RoomFormValue {
  name: string;
  is_headliner_room: boolean;
  capacity: string;
  notes: string;
}

export type RoomErrors = Partial<Record<keyof RoomFormValue, { message?: string }>>[] | undefined;

interface RoomsEditorProps {
  value: RoomFormValue[];
  onChange: (rooms: RoomFormValue[]) => void;
  errors?: RoomErrors;
  disabled?: boolean;
}

/**
 * Structured editor for place.typical_rooms_json. Emits exactly the shape the
 * database CHECK constraint accepts: name, is_headliner_room, capacity?, notes?.
 */
export function RoomsEditor({ value, onChange, errors, disabled }: RoomsEditorProps) {
  function update(i: number, patch: Partial<RoomFormValue>) {
    onChange(value.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <div className="space-y-2">
      {value.length === 0 && <p className="text-sm text-muted-foreground">No rooms recorded.</p>}
      {value.map((room, i) => {
        const err = errors?.[i];
        return (
          <div key={i} className="grid grid-cols-[1fr_auto_6rem_1fr_auto] items-start gap-2 rounded-md border p-2">
            <div>
              <Input
                aria-label={`Room ${i + 1} name`}
                placeholder="Room name"
                value={room.name}
                onChange={(e) => update(i, { name: e.target.value })}
                aria-invalid={!!err?.name}
                disabled={disabled}
              />
              {err?.name?.message && <p className="mt-1 text-xs text-destructive">{err.name.message}</p>}
            </div>
            <div className="flex h-9 items-center gap-2 px-1">
              <Switch
                id={`room-${i}-headliner`}
                checked={room.is_headliner_room}
                onCheckedChange={(v) => update(i, { is_headliner_room: v })}
                disabled={disabled}
              />
              <Label htmlFor={`room-${i}-headliner`} className="whitespace-nowrap text-xs">Headliner</Label>
            </div>
            <div>
              <Input
                aria-label={`Room ${i + 1} capacity`}
                placeholder="Cap."
                inputMode="numeric"
                value={room.capacity}
                onChange={(e) => update(i, { capacity: e.target.value })}
                aria-invalid={!!err?.capacity}
                disabled={disabled}
              />
              {err?.capacity?.message && <p className="mt-1 text-xs text-destructive">{err.capacity.message}</p>}
            </div>
            <Input
              aria-label={`Room ${i + 1} notes`}
              placeholder="Notes"
              value={room.notes}
              onChange={(e) => update(i, { notes: e.target.value })}
              disabled={disabled}
            />
            <Button type="button" variant="ghost" size="icon" title="Remove room" disabled={disabled}
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}>
              <Trash2 />
            </Button>
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" disabled={disabled}
        onClick={() => onChange([...value, { name: '', is_headliner_room: value.length === 0, capacity: '', notes: '' }])}>
        <Plus /> Add room
      </Button>
    </div>
  );
}
