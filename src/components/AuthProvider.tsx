import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { getStored, clearSession, isTokenValid } from '@/lib/session';

interface UserProfile {
  id: string;
  username: string;
  role: 'seller' | 'admin' | 'logistics' | 'accountant';
  display_name: string;
  shop_id?: string;
  shop_name?: string;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  profile: UserProfile | null;
  logout: () => void;
  isAuthenticated: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Idle timeout: log out after this many ms of no user interaction.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const idleTimer = useRef<number | null>(null);

  const hydrate = () => {
    const token = getStored('sessionToken');
    const storedUser = getStored('currentUser');
    if (!token || !isTokenValid(token) || !storedUser) {
      clearSession();
      setProfile(null);
      return;
    }
    try {
      setProfile(JSON.parse(storedUser));
    } catch {
      clearSession();
      setProfile(null);
    }
  };

  useEffect(() => {
    hydrate();
    setLoading(false);

    // Re-validate when another tab logs in/out or when the tab becomes visible.
    const onStorage = (e: StorageEvent) => {
      if (e.key && !['sessionToken', 'currentUser', 'sessionPersist'].includes(e.key)) return;
      hydrate();
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') hydrate(); };
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Idle auto-logout.
  useEffect(() => {
    if (!profile) return;
    const reset = () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => {
        clearSession();
        setProfile(null);
      }, IDLE_TIMEOUT_MS);
    };
    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    };
  }, [profile]);

  // Re-check token expiry every minute.
  useEffect(() => {
    const t = window.setInterval(() => {
      const token = getStored('sessionToken');
      if (!isTokenValid(token)) {
        clearSession();
        setProfile(null);
      }
    }, 60_000);
    return () => window.clearInterval(t);
  }, []);

  const logout = () => {
    clearSession();
    setProfile(null);
  };

  const value: AuthContextType = {
    profile,
    logout,
    isAuthenticated: !!profile && isTokenValid(getStored('sessionToken')),
    loading,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};