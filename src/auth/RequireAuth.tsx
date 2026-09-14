import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from './AuthProvider';

function FullPage({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center p-6 text-center">{children}</div>;
}

/** Gate for every app route: signed in, has a profile, and the profile is active. */
export function RequireAuth() {
  const { session, profile, loading, signOut } = useAuth();
  const location = useLocation();

  if (loading) return <FullPage><p className="text-muted-foreground">Loading…</p></FullPage>;
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;

  if (!profile) {
    return (
      <FullPage>
        <div className="space-y-3">
          <p className="font-medium">Your account has no application profile.</p>
          <p className="text-sm text-muted-foreground">Ask an administrator to invite you from the Users tab.</p>
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
