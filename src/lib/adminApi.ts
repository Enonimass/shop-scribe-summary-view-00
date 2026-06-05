import { supabase } from '@/integrations/supabase/client';

export function getSessionToken(): string | null {
  return localStorage.getItem('sessionToken');
}

export async function adminAction<T = any>(action: string, payload: Record<string, any> = {}): Promise<T> {
  const token = getSessionToken();
  if (!token) throw new Error('Not authenticated');
  const { data, error } = await supabase.functions.invoke('admin-action', {
    body: { action, ...payload },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error) throw new Error(error.message || 'Request failed');
  if (data?.error) throw new Error(data.error);
  return data as T;
}
