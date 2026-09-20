import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Field } from '@/components/form/Field';
import type { Enums } from '@/types/database';
import { APP_ROLES } from '@/types/enums';
import { useInviteUser } from './api';

export function InviteUserDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Enums<'app_role'>>('operator');
  const invite = useInviteUser();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await invite.mutateAsync({ email: email.trim(), full_name: fullName.trim() || undefined, role });
      toast.success(`Invitation sent to ${email.trim()}`);
      setOpen(false);
      setEmail('');
      setFullName('');
      setRole('operator');
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button>Invite user</Button></DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Invite a user</DialogTitle>
            <DialogDescription>They receive an email with a link to set their password.</DialogDescription>
          </DialogHeader>
          <Field label="Email" htmlFor="invite-email" required>
            <Input id="invite-email" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Full name" htmlFor="invite-name">
            <Input id="invite-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field label="Role" htmlFor="invite-role" required hint="Operators manage places. Admins also manage users.">
            <Select value={role} onValueChange={(v) => setRole(v as Enums<'app_role'>)}>
              <SelectTrigger id="invite-role"><SelectValue /></SelectTrigger>
              <SelectContent>{APP_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={invite.isPending}>{invite.isPending ? 'Sending…' : 'Send invitation'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
