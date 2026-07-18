'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  setAuthData,
  getAccessToken,
  getStoredUser,
  clearAuthData,
  StoredUser,
  StoredTenant,
} from '@/lib/token-storage';

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantSlug: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (accessToken: string, user: StoredUser, tenant: StoredTenant) => void;
  logout: () => void;
  accessToken: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const stored = getStoredUser();
    if (stored) {
      setUser(stored);
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(
    (accessToken: string, storedUser: StoredUser, tenant: StoredTenant) => {
      setAuthData(accessToken, storedUser, tenant);
      setUser(storedUser);
    },
    []
  );

  const logout = useCallback(() => {
    clearAuthData();
    setUser(null);
    router.push('/login');
  }, [router]);

  const accessToken = typeof window !== 'undefined' ? getAccessToken() : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        accessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
