'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { getApiUrl } from '@/utils/apiUrl';

export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string | null;
  is_admin: boolean;
  is_active: boolean;
  role?: string;
  storage_quota_bytes?: number;
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
  register: (username: string, email: string, password: string, fullName?: string, inviteCode?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
  fetchAllUsers: () => Promise<void>;
  switchAccount: (userId: number) => boolean;
  hasSavedSession: (userId: number) => boolean;
}

const SAVED_SESSIONS_KEY = 'memorypics_saved_sessions';

const saveUserSession = (token: string, user: User) => {
  if (typeof window === 'undefined' || !user?.id) return;
  try {
    const raw = localStorage.getItem(SAVED_SESSIONS_KEY);
    const sessions: Record<string, { token: string; user: User }> = raw ? JSON.parse(raw) : {};
    sessions[String(user.id)] = { token, user };
    localStorage.setItem(SAVED_SESSIONS_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.error('Error saving user session:', e);
  }
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const router = useRouter();
  const API_URL = getApiUrl();
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
        const parsed = JSON.parse(savedUser);
        setToken(savedToken);
        setUser(parsed);
        if (typeof document !== 'undefined') {
          document.cookie = `memorypics_token=${savedToken}; path=/; SameSite=Lax; max-age=604800`;
        }
        saveUserSession(savedToken, parsed);
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
        saveUserSession(authToken, profile);
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
      saveUserSession(data.access_token, data.user);
      fetchAllUsers();
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || 'Connection failed' };
    }
  };

  const register = async (username: string, email: string, password: string, fullName?: string, inviteCode?: string) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          email: email.trim(),
          password,
          full_name: fullName?.trim() || null,
          invite_code: inviteCode?.trim() || null,
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
      saveUserSession(data.access_token, data.user);
      fetchAllUsers();
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || 'Connection failed' };
    }
  };

  const hasSavedSession = (userId: number): boolean => {
    if (typeof window === 'undefined') return false;
    try {
      const raw = localStorage.getItem(SAVED_SESSIONS_KEY);
      if (!raw) return false;
      const sessions = JSON.parse(raw);
      return Boolean(sessions[String(userId)]?.token);
    } catch {
      return false;
    }
  };

  const switchAccount = (userId: number): boolean => {
    if (typeof window === 'undefined') return false;
    try {
      const raw = localStorage.getItem(SAVED_SESSIONS_KEY);
      if (!raw) return false;
      const sessions = JSON.parse(raw);
      const targetSession = sessions[String(userId)];
      if (!targetSession || !targetSession.token || !targetSession.user) {
        return false;
      }
      localStorage.setItem('memorypics_token', targetSession.token);
      localStorage.setItem('memorypics_user', JSON.stringify(targetSession.user));
      document.cookie = `memorypics_token=${targetSession.token}; path=/; SameSite=Lax; max-age=604800`;
      setToken(targetSession.token);
      setUser(targetSession.user);
      // Force page reload so all data hooks and permissions refresh instantly
      window.location.reload();
      return true;
    } catch (e) {
      console.error('Failed to switch account:', e);
      return false;
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
        switchAccount,
        hasSavedSession,
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
