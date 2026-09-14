import { Badge } from '@/components/ui/badge';
import type { Enums } from '@/types/database';

const VARIANT: Record<Enums<'record_status'>, 'success' | 'secondary' | 'warning' | 'destructive' | 'outline'> = {
  active: 'success',
  draft: 'secondary',
  inactive: 'warning',
  closed: 'warning',
  superseded: 'outline',
  archived: 'outline',
  deleted: 'destructive',
};

export function StatusBadge({ status }: { status: Enums<'record_status'> }) {
  return <Badge variant={VARIANT[status]}>{status}</Badge>;
}
