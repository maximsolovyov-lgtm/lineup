import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from './AuthProvider';

function FullPage({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center p-6 text-center">{children}</div>;
}

/** Gate for every app route: signed in, has a profile, and the profile is active. */
export function RequireAuth() {
  const { session, profile, profileError, loading, signOut } = useAuth();
  const location = useLocation();

  if (loading) return <FullPage><p className="text-muted-foreground">Loading…</p></FullPage>;
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;

  // The lookup failed, rather than succeeding and finding nothing. Most
  // often the migrations have not been applied to this project yet.
  if (profileError) {
    return (
      <FullPage>
        <div className="max-w-md space-y-3">
          <p className="font-medium">Could not load your profile.</p>
          <p className="rounded-md bg-muted px-3 py-2 text-left font-mono text-xs">{profileError}</p>
          <p className="text-sm text-muted-foreground">
            If this mentions a missing relation, the database migrations in
            <code className="mx-1">supabase/migrations</code>
            have not been applied to this project yet.
          </p>
          <Button variant="outline" onClick={() => void signOut()}>Sign out</Button>
        </div>
      </FullPage>
    );
  }

  if (!profile) {
    return (
      <FullPage>
        <div className="max-w-md space-y-3">
          <p className="font-medium">Your account has no application profile.</p>
          <p className="text-sm text-muted-foreground">
            Your sign-in worked, but no row in <code>app_user_profile</code> matches it. This
            happens when the account was created before the migrations were applied, so the
            trigger that creates profiles did not exist yet. An administrator can add it from
            the Users tab, or via SQL.
          </p>
          <Button variant="outline" onClick={() => void signOut()}>Sign out</Button>
        </div>
      </FullPage>
    );
  }

  if (profile.status !== 'active') {
    return (
      <FullPage>
        <div className="space-y-3">
          <p className="font-medium">This account is {profile.status}.</p>
          <p className="text-sm text-muted-foreground">Contact an administrator to reactivate it.</p>
          <Button variant="outline" onClick={() => void signOut()}>Sign out</Button>
        </div>
      </FullPage>
    );
  }

  return <Outlet />;
}

/** Admin-only routes. Operators are bounced to the Places tab. */
export function RequireAdmin() {
  const { isAdmin } = useAuth();
  return isAdmin ? <Outlet /> : <Navigate to="/places" replace />;
}
