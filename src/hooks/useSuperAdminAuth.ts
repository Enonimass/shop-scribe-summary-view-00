import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SuperAdminSession {
  userId: string;
  email: string;
}

export function useSuperAdminAuth() {
  const [session, setSession] = useState<SuperAdminSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const check = async (uid: string | null, email: string | null) => {
      if (!uid) {
        setSession(null);
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('user_id', uid)
        .eq('role', 'super_admin')
        .maybeSingle();
      if (data) {
        setSession({ userId: uid, email: email || '' });
      } else {
        setSession(null);
      }
      setLoading(false);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      check(s?.user?.id ?? null, s?.user?.email ?? null);
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      check(s?.user?.id ?? null, s?.user?.email ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  return { session, loading, logout };
}