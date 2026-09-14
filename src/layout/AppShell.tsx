import { NavLink, Outlet } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/auth/AuthProvider';

/**
 * Object tabs: one tab per data entity (DBML admin UI requirement). Adding an
 * entity later means adding a route and one entry here.
 */
const TABS: { to: string; label: string; adminOnly?: boolean }[] = [
  { to: '/places', label: 'Places' },
  { to: '/users', label: 'Users', adminOnly: true },
];

export function AppShell() {
  const { profile, isAdmin, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4">
          <span className="py-3 font-semibold">LineApp Admin</span>
          <nav className="flex gap-1" aria-label="Objects">
            {TABS.filter((t) => !t.adminOnly || isAdmin).map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                className={({ isActive }) =>
                  cn(
                    'border-b-2 px-3 py-3 text-sm font-medium transition-colors',
                    isActive ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {t.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-muted-foreground sm:inline">{profile?.full_name || profile?.email}</span>
            <Badge variant={isAdmin ? 'default' : 'secondary'}>{profile?.role}</Badge>
            <Button variant="ghost" size="icon" title="Sign out" onClick={() => void signOut()}>
              <LogOut />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
