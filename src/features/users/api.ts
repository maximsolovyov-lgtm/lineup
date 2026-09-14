import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { apiFetch } from '@/lib/api';
import type { Enums, Tables } from '@/types/database';

export type Profile = Tables<'app_user_profile'>;

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('app_user_profile').select('*').order('created_at');
      if (error) throw error;
      return data;
    },
  });
}

function useInvalidateProfiles() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['profiles'] });
    void qc.invalidateQueries({ queryKey: ['profile-names'] });
  };
}

export interface InviteInput {
  email: string;
  full_name?: string;
  role: Enums<'app_role'>;
}

/** Goes through the Pages Function: creating auth users needs the service-role key. */
export function useInviteUser() {
  const invalidate = useInvalidateProfiles();
  return useMutation({
    mutationFn: (input: InviteInput) =>
      apiFetch<Profile>('/api/admin/users/invite', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: invalidate,
  });
}

/** Role changes are a plain RLS-guarded update: only admins pass the policy. */
export function useSetRole() {
  const invalidate = useInvalidateProfiles();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: Enums<'app_role'> }) => {
      const { error } = await supabase.from('app_user_profile').update({ role }).eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Status changes go through the Function so the auth user is banned/unbanned too. */
export function useSetStatus() {
  const invalidate = useInvalidateProfiles();
  return useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: 'active' | 'inactive' }) =>
      apiFetch<Profile>(`/api/admin/users/${userId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: invalidate,
  });
}
