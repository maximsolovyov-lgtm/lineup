import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/StatusBadge';
import { useAuth } from '@/auth/AuthProvider';
import type { Enums } from '@/types/database';
import { APP_ROLES } from '@/types/enums';
import { InviteUserDialog } from './InviteUserDialog';
import { useProfiles, useSetRole, useSetStatus } from './api';

export function UsersPage() {
  const { profile: me } = useAuth();
  const profiles = useProfiles();
  const setRole = useSetRole();
  const setStatus = useSetStatus();

  async function onRole(userId: string, role: Enums<'app_role'>) {
    try {
      await setRole.mutateAsync({ userId, role });
      toast.success('Role updated');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function onToggleStatus(userId: string, current: Enums<'record_status'>) {
    const status = current === 'active' ? 'inactive' : 'active';
    try {
      await setStatus.mutateAsync({ userId, status });
      toast.success(status === 'active' ? 'User reactivated' : 'User deactivated');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="mr-auto text-[27px] font-semibold tracking-[-0.5px]">Users</h1>
        <InviteUserDialog />
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.isLoading && (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {profiles.isError && (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-destructive">{(profiles.error as Error).message}</TableCell></TableRow>
            )}
            {profiles.data?.map((p) => {
              const isMe = p.user_id === me?.user_id;
              return (
                <TableRow key={p.user_id}>
                  <TableCell className="font-medium">{p.email}{isMe && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}</TableCell>
                  <TableCell>{p.full_name}</TableCell>
                  <TableCell>
                    <Select value={p.role} disabled={isMe || setRole.isPending} onValueChange={(v) => void onRole(p.user_id, v as Enums<'app_role'>)}>
                      <SelectTrigger className="w-32" aria-label={`Role for ${p.email}`}><SelectValue /></SelectTrigger>
                      <SelectContent>{APP_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><StatusBadge status={p.status} /></TableCell>
                  <TableCell className="text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant={p.status === 'active' ? 'outline' : 'secondary'}
                      size="sm"
                      disabled={isMe || setStatus.isPending}
                      title={isMe ? 'You cannot change your own status' : undefined}
                      onClick={() => void onToggleStatus(p.user_id, p.status)}
                    >
                      {p.status === 'active' ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
