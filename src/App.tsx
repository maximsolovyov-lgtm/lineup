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
