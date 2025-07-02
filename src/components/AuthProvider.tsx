
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
  changePassword: (userId: string, newPassword: string) => boolean;
  getAllUsers: () => any[];
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Demo users - in a real app this would come from a backend
const defaultUsers = [
  { id: '1', username: 'kiambu_shop', password: 'password123', role: 'seller' as const, shopId: 'kiambu', shopName: 'Kiambu Shop' },
  { id: '2', username: 'ikinu_shop', password: 'password123', role: 'seller' as const, shopId: 'ikinu', shopName: 'Ikinu Shop' },
  { id: '3', username: 'kwa_maiko_shop', password: 'password123', role: 'seller' as const, shopId: 'kwa-maiko', shopName: 'Kwa-Maiko Shop' },
  { id: '4', username: 'githunguri_shop', password: 'password123', role: 'seller' as const, shopId: 'githunguri', shopName: 'Githunguri Shop' },
  { id: '5', username: 'manyatta_shop', password: 'password123', role: 'seller' as const, shopId: 'manyatta', shopName: 'Manyatta Shop' },
  { id: '6', username: 'kibugu_shop', password: 'password123', role: 'seller' as const, shopId: 'kibugu', shopName: 'Kibugu Shop' },
  { id: '7', username: 'admin', password: 'admin123', role: 'admin' as const },
];

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState(() => {
    const savedUsers = localStorage.getItem('systemUsers');
    return savedUsers ? JSON.parse(savedUsers) : defaultUsers;
  });

  useEffect(() => {
    // Check if user is already logged in
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  useEffect(() => {
    // Save users to localStorage whenever they change
    localStorage.setItem('systemUsers', JSON.stringify(users));
  }, [users]);

  const login = (username: string, password: string): boolean => {
    const foundUser = users.find(
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

  const changePassword = (userId: string, newPassword: string): boolean => {
    setUsers(prevUsers => {
      const updatedUsers = prevUsers.map(u => 
        u.id === userId ? { ...u, password: newPassword } : u
      );
      return updatedUsers;
    });
    return true;
  };

  const getAllUsers = () => {
    return users;
  };

  return (
    <AuthContext.Provider value={{
      user,
      login,
      logout,
      isAuthenticated: !!user,
      changePassword,
      getAllUsers
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
