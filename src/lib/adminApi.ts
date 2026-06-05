import { supabase } from '@/integrations/supabase/client';
import { clearSession, getStored } from './session';

export function getSessionToken(): string | null {
  return getStored('sessionToken');
}

export async function adminAction<T = any>(action: string, payload: Record<string, any> = {}): Promise<T> {
  const token = getSessionToken();
  if (!token) {
    clearSession();
    if (typeof window !== 'undefined') window.location.href = '/auth';
    throw new Error('Not authenticated');
  }
  const { data, error } = await supabase.functions.invoke('admin-action', {
    body: { action, ...payload },
    headers: { Authorization: `Bearer ${token}` },
  });
  const msg = error?.message || data?.error;
  if (msg && /unauthorized|invalid token|expired/i.test(msg)) {
    clearSession();
    if (typeof window !== 'undefined') window.location.href = '/auth';
    throw new Error('Session expired. Please sign in again.');
  }
  if (error) throw new Error(error.message || 'Request failed');
  if (data?.error) throw new Error(data.error);
  return data as T;
}
