'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string | null;
  is_admin: boolean;
  is_active: boolean;
}

export interface UserSummary {
  id: number;
  username: string;
  full_name: string | null;
  email: string;
  is_admin: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  allUsers: UserSummary[];
  login: (usernameOrEmail: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (username: string, email: string, password: string, fullName?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
  fetchAllUsers: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [allUsers, setAllUsers] = useState<UserSummary[]>([]);

  // Setup global fetch interceptor to automatically attach Bearer token to all outgoing requests
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const originalFetch = window.fetch;
      window.fetch = async (...args: Parameters<typeof window.fetch>) => {
        let [resource, config] = args;
        const currentToken = localStorage.getItem('memorypics_token');
        if (currentToken) {
          config = config || {};
          const headers = new Headers(config.headers || {});
          if (!headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${currentToken}`);
          }
          config.headers = headers;
        }
        return originalFetch(resource, config);
      };
    }
  }, []);

  // Load session from localStorage on mount (NO silent auto-login)
  useEffect(() => {
    const savedToken = localStorage.getItem('memorypics_token');
    const savedUser = localStorage.getItem('memorypics_user');

    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
        if (typeof document !== 'undefined') {
          document.cookie = `memorypics_token=${savedToken}; path=/; SameSite=Lax; max-age=604800`;
        }
        validateToken(savedToken);
      } catch (e) {
        localStorage.removeItem('memorypics_token');
        localStorage.removeItem('memorypics_user');
        if (typeof document !== 'undefined') {
          document.cookie = 'memorypics_token=; path=/; max-age=0';
        }
        setUser(null);
        setToken(null);
      }
    } else {
      if (typeof document !== 'undefined') {
        document.cookie = 'memorypics_token=; path=/; max-age=0';
      }
      setUser(null);
      setToken(null);
    }
    fetchAllUsers();
    setIsLoading(false);
  }, []);

  const validateToken = async (authToken: string) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const profile = await res.json();
        setUser(profile);
        localStorage.setItem('memorypics_user', JSON.stringify(profile));
      } else {
        // Token expired or invalid
        logout();
      }
    } catch (e) {
      console.error('Session validation error:', e);
    }
  };

  const fetchAllUsers = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/users`);
      if (res.ok) {
        const users = await res.json();
        setAllUsers(users);
      }
    } catch (e) {
      // Backend not yet ready or offline
    }
  };

  const login = async (usernameOrEmail: string, password: string) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username_or_email: usernameOrEmail.trim(), password }),
      });

      if (!res.ok) {
        const err = await res.json();
        return { success: false, error: err.detail || 'Invalid username or password' };
      }

      const data = await res.json();
      setToken(data.access_token);
      setUser(data.user);
      localStorage.setItem('memorypics_token', data.access_token);
      localStorage.setItem('memorypics_user', JSON.stringify(data.user));
      if (typeof document !== 'undefined') {
        document.cookie = `memorypics_token=${data.access_token}; path=/; SameSite=Lax; max-age=604800`;
      }
      fetchAllUsers();
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || 'Connection failed' };
    }
  };

  const register = async (username: string, email: string, password: string, fullName?: string) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          email: email.trim(),
          password,
          full_name: fullName?.trim() || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        return { success: false, error: err.detail || 'Registration failed' };
      }

      const data = await res.json();
      setToken(data.access_token);
      setUser(data.user);
      localStorage.setItem('memorypics_token', data.access_token);
      localStorage.setItem('memorypics_user', JSON.stringify(data.user));
      if (typeof document !== 'undefined') {
        document.cookie = `memorypics_token=${data.access_token}; path=/; SameSite=Lax; max-age=604800`;
      }
      fetchAllUsers();
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || 'Connection failed' };
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('memorypics_token');
    localStorage.removeItem('memorypics_user');
    if (typeof document !== 'undefined') {
      document.cookie = 'memorypics_token=; path=/; max-age=0';
    }
    router.push('/login');
  };

  const refreshProfile = async () => {
    if (token) {
      await validateToken(token);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: Boolean(user && token),
        isLoading,
        allUsers,
        login,
        register,
        logout,
        refreshProfile,
        fetchAllUsers,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
