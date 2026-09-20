import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from './AuthProvider';

/**
 * Landing page for invitation and password-reset links. Supabase establishes
 * the session from the link before this renders; the user then chooses a
 * password.
 */
export function SetPasswordPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Supabase reports a bad link in the URL fragment (#error=access_denied&
  // error_code=otp_expired&error_description=...). Read it once so the user
  // sees why the form is locked instead of two silent disabled fields.
  const linkError = useMemo(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const code = hash.get('error_code');
    const description = hash.get('error_description')?.replace(/\+/g, ' ');
    if (!hash.get('error')) return null;
    if (code === 'otp_expired') return 'This link has expired or was already used. Ask an admin to send a new invitation.';
    return description ?? 'This link is not valid. Ask an admin to send a new invitation.';
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    toast.success('Password set. Welcome!');
    navigate('/places', { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Set your password</CardTitle>
          <CardDescription>
            {loading ? 'Checking your link…' : session ? `Signed in as ${session.user.email}` : 'Open this page from your invitation or reset email.'}
          </CardDescription>
          {!loading && !session && (
            <p className="text-sm text-destructive" role="alert">
              {linkError ?? 'No sign-in link was found in this page address, so the form is locked. Use the link from your invitation email; if it opened elsewhere, copy the full address into this browser.'}
            </p>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">New password</Label>
              <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} disabled={!session} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={!session} />
            </div>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy || !session}>{busy ? 'Saving…' : 'Save password'}</Button>
            {!session && !loading && (
              <p className="text-center text-xs text-muted-foreground">Already have a password? <Link to="/login" className="underline">Sign in</Link></p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
