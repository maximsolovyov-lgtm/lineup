import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/auth/AuthProvider';
import { RequireAdmin, RequireAuth } from '@/auth/RequireAuth';
import { LoginPage } from '@/auth/LoginPage';
import { SetPasswordPage } from '@/auth/SetPasswordPage';
import { AppShell } from '@/layout/AppShell';
import { PlacesPage } from '@/features/places/PlacesPage';
import { PlaceFormPage } from '@/features/places/PlaceFormPage';
import { EventsPage } from '@/features/events/EventsPage';
import { EventFormPage } from '@/features/events/EventFormPage';
import { ArtistsPage } from '@/features/artists/ArtistsPage';
import { ArtistFormPage } from '@/features/artists/ArtistFormPage';
import { PeoplePage } from '@/features/people/PeoplePage';
import { PersonFormPage } from '@/features/people/PersonFormPage';
import { LineupsPage } from '@/features/lineups/LineupsPage';
import { LineupFormPage } from '@/features/lineups/LineupFormPage';
import { SetsPage } from '@/features/sets/SetsPage';
import { SetFormPage } from '@/features/sets/SetFormPage';
import { UsersPage } from '@/features/users/UsersPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1 } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/auth/set-password" element={<SetPasswordPage />} />
            <Route element={<RequireAuth />}>
              <Route element={<AppShell />}>
                <Route index element={<Navigate to="/places" replace />} />
                <Route path="/places" element={<PlacesPage />} />
                <Route path="/places/new" element={<PlaceFormPage />} />
                <Route path="/places/:placeId" element={<PlaceFormPage />} />
                <Route path="/events" element={<EventsPage />} />
                <Route path="/events/new" element={<EventFormPage />} />
                <Route path="/events/:eventId" element={<EventFormPage />} />
                <Route path="/artists" element={<ArtistsPage />} />
                <Route path="/artists/new" element={<ArtistFormPage />} />
                <Route path="/artists/:artistId" element={<ArtistFormPage />} />
                <Route path="/people" element={<PeoplePage />} />
                <Route path="/people/new" element={<PersonFormPage />} />
                <Route path="/people/:personId" element={<PersonFormPage />} />
                <Route path="/lineups" element={<LineupsPage />} />
                <Route path="/lineups/new" element={<LineupFormPage />} />
                <Route path="/lineups/:lineupId" element={<LineupFormPage />} />
                <Route path="/sets" element={<SetsPage />} />
                <Route path="/sets/new" element={<SetFormPage />} />
                <Route path="/sets/:setId" element={<SetFormPage />} />
                <Route element={<RequireAdmin />}>
                  <Route path="/users" element={<UsersPage />} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/places" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
