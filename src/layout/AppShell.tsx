import { NavLink, Outlet } from 'react-router-dom';
import { CalendarDays, Disc3, ListMusic, Clock, LogOut, MapPin, User, UserPlus, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/auth/AuthProvider';

/**
 * Layout from design/Main.dc.html: a dark 236px sidebar on the left with the
 * navigation in two groups — master data, then administration — and the
 * signed-in user at the bottom; the page fills the rest. One entry per data
 * entity (DBML admin UI requirement); adding an entity means a route and one
 * line here.
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

  return (
    <div className="flex min-h-screen bg-background md:flex-row flex-col">
      <nav
        aria-label="Sections"
        className="flex shrink-0 flex-col gap-[26px] bg-sidebar px-4 py-6 text-sidebar-foreground md:sticky md:top-0 md:h-screen md:w-[236px]"
      >
        <div className="flex flex-col gap-0.5 pl-2">
          <div className="font-display text-xl font-bold tracking-[-0.4px]">LineApp</div>
          <div className="text-[11px] uppercase tracking-[1.4px] text-sidebar-muted">Admin</div>
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

        <div className="hidden flex-1 md:block" />

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

      <main className="min-w-0 flex-1 px-5 py-6 md:px-[30px] md:py-[26px]">
        <Outlet />
      </main>
    </div>
  );
}
