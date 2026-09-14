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
import { SpacesPage } from '@/features/spaces/SpacesPage';
import { SpaceFormPage } from '@/features/spaces/SpaceFormPage';
import { EventsPage } from '@/features/events/EventsPage';
import { EventFormPage } from '@/features/events/EventFormPage';
import { OccurrencesPage } from '@/features/occurrences/OccurrencesPage';
import { OccurrenceFormPage } from '@/features/occurrences/OccurrenceFormPage';
import { ArtistsPage } from '@/features/artists/ArtistsPage';
import { ArtistFormPage } from '@/features/artists/ArtistFormPage';
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
                <Route path="/spaces" element={<SpacesPage />} />
                <Route path="/spaces/new" element={<SpaceFormPage />} />
                <Route path="/spaces/:spaceId" element={<SpaceFormPage />} />
                <Route path="/events" element={<EventsPage />} />
                <Route path="/events/new" element={<EventFormPage />} />
                <Route path="/events/:eventId" element={<EventFormPage />} />
                <Route path="/occurrences" element={<OccurrencesPage />} />
                <Route path="/occurrences/new" element={<OccurrenceFormPage />} />
                <Route path="/occurrences/:occurrenceId" element={<OccurrenceFormPage />} />
                <Route path="/artists" element={<ArtistsPage />} />
                <Route path="/artists/new" element={<ArtistFormPage />} />
                <Route path="/artists/:artistId" element={<ArtistFormPage />} />
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
