
import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
  id: string;
  username: string;
  role: 'seller' | 'admin';
  shopId?: string;
  shopName?: string;
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => boolean;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Demo users - in a real app this would come from a backend
const demoUsers = [
  { id: '1', username: 'kiambu_seller', password: 'password123', role: 'seller' as const, shopId: 'kiambu', shopName: 'Kiambu Shop' },
  { id: '2', username: 'nakuru_seller', password: 'password123', role: 'seller' as const, shopId: 'nakuru', shopName: 'Nakuru Shop' },
  { id: '3', username: 'admin', password: 'admin123', role: 'admin' as const },
];

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Check if user is already logged in
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  const login = (username: string, password: string): boolean => {
    const foundUser = demoUsers.find(
      u => u.username === username && u.password === password
    );
    
    if (foundUser) {
      const userInfo: User = {
        id: foundUser.id,
        username: foundUser.username,
        role: foundUser.role,
        shopId: foundUser.shopId,
        shopName: foundUser.shopName
      };
      setUser(userInfo);
      localStorage.setItem('currentUser', JSON.stringify(userInfo));
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('currentUser');
  };

  return (
    <AuthContext.Provider value={{
      user,
      login,
      logout,
      isAuthenticated: !!user
    }}>
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
