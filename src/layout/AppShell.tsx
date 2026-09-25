import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { CalendarDays, CalendarClock, Disc3, ListMusic, Clock, LogOut, MapPin, Menu, User, UserPlus, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/auth/AuthProvider';

/**
 * Layout from design/Main.dc.html: a dark 236px sidebar on the left with the
 * navigation in two groups — master data, then administration — and the
 * signed-in user at the bottom; the page fills the rest. One entry per data
 * entity (DBML admin UI requirement); adding an entity means a route and one
 * line here.
 *
 * On a phone the same sidebar becomes a drawer behind a top bar: stacking it
 * above the page meant scrolling past seven links to reach the content.
 */
const GROUPS: { label: string; items: { to: string; label: string; icon: LucideIcon; adminOnly?: boolean }[]; note?: string }[] = [
  {
    label: 'Master data',
    items: [
      { to: '/places', label: 'Places', icon: MapPin },
      { to: '/events', label: 'Events', icon: CalendarDays },
      { to: '/artists', label: 'Artists', icon: Disc3 },
      { to: '/people', label: 'People', icon: User },
    ],
  },
  {
    label: 'Schedule',
    items: [
      { to: '/occurrences', label: 'Occurrences', icon: CalendarClock },
      { to: '/lineups', label: 'Line-ups', icon: ListMusic },
      { to: '/sets', label: 'Sets', icon: Clock },
    ],
  },
  {
    label: 'Administration',
    items: [{ to: '/users', label: 'Users', icon: UserPlus, adminOnly: true }],
    note: 'Visible to the admin role only',
  },
];

function initials(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name || email || '?').trim();
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';
}

export function AppShell() {
  const { profile, isAdmin, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // A tap on a link navigates and closes; Escape closes without navigating.
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      {/* Phone: a bar with the drawer button and the account. */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/10 bg-sidebar px-4 py-3 text-sidebar-foreground md:hidden">
        <button
          type="button"
          aria-label="Open the menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="-ml-1 rounded-lg p-2 text-sidebar-link transition-colors hover:bg-white/10 hover:text-sidebar-foreground"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <div className="font-display text-lg font-bold tracking-[-0.3px]">LineApp</div>
        <span className="flex-1" />
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white" title={profile?.email ?? undefined}>
          {initials(profile?.full_name, profile?.email)}
        </div>
        <button
          type="button"
          title="Sign out"
          onClick={() => void signOut()}
          className="rounded-md p-1.5 text-sidebar-muted transition-colors hover:bg-white/10 hover:text-sidebar-foreground"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          <span className="sr-only">Sign out</span>
        </button>
      </header>

      {open && <button type="button" aria-label="Close the menu" className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setOpen(false)} />}

      <nav
        aria-label="Sections"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[80vw] max-w-[300px] shrink-0 flex-col gap-[26px] overflow-y-auto bg-sidebar px-4 py-6 text-sidebar-foreground transition-transform duration-200',
          'md:sticky md:top-0 md:z-auto md:h-screen md:w-[236px] md:max-w-none md:translate-x-0',
          open ? 'translate-x-0 shadow-2xl' : '-translate-x-full',
        )}
      >
        <div className="flex items-start gap-2">
          <div className="flex flex-col gap-0.5 pl-2">
            <div className="font-display text-xl font-bold tracking-[-0.4px]">LineApp</div>
            <div className="text-[11px] uppercase tracking-[1.4px] text-sidebar-muted">Admin</div>
          </div>
          <span className="flex-1" />
          <button
            type="button"
            aria-label="Close the menu"
            onClick={() => setOpen(false)}
            className="rounded-lg p-1.5 text-sidebar-muted transition-colors hover:bg-white/10 hover:text-sidebar-foreground md:hidden"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {GROUPS.map((g) => {
          const items = g.items.filter((t) => !t.adminOnly || isAdmin);
          if (items.length === 0) return null;
          return (
            <div key={g.label} className="flex flex-col gap-[3px]">
              <div className="px-2 pb-2 text-[10px] uppercase tracking-[1.2px] text-sidebar-dim">{g.label}</div>
              {items.map((t) => (
                <NavLink
                  key={t.to}
                  to={t.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 rounded-lg px-2.5 py-[9px] text-sm transition-colors',
                      isActive ? 'bg-primary font-medium text-white' : 'text-sidebar-link hover:bg-white/5 hover:text-sidebar-foreground',
                    )
                  }
                >
                  <t.icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                  {t.label}
                </NavLink>
              ))}
              {g.note && <div className="px-2.5 pt-1.5 text-[11px] leading-relaxed text-sidebar-dim">{g.note}</div>}
            </div>
          );
        })}

        <div className="flex-1" />

        <div className="flex items-center gap-2.5 rounded-[10px] bg-[#262031]/50 p-2.5">
          <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
            {initials(profile?.full_name, profile?.email)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-sidebar-foreground">{profile?.full_name || profile?.email}</div>
            <div className="text-[11px] text-sidebar-muted">{profile?.role}</div>
          </div>
          <button
            type="button"
            title="Sign out"
            onClick={() => void signOut()}
            className="rounded-md p-1.5 text-sidebar-muted transition-colors hover:bg-white/10 hover:text-sidebar-foreground"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            <span className="sr-only">Sign out</span>
          </button>
        </div>
      </nav>

      <main className="min-w-0 flex-1 px-4 py-5 sm:px-5 sm:py-6 md:px-[30px] md:py-[26px]">
        <Outlet />
      </main>
    </div>
  );
}
