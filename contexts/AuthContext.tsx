


import React, { createContext, useState, useEffect, useCallback } from 'react';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (sessionData: { user: User, token: string }) => void;
  logout: () => void;
}

const SESSION_DURATION = 15 * 60 * 1000; // 15 minutes

export const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  login: () => {},
  logout: () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(() => {
    localStorage.removeItem('session');
    setUser(null);
    setToken(null);
  }, []);

  useEffect(() => {
    try {
      const storedSession = localStorage.getItem('session');
      if (storedSession) {
        const session = JSON.parse(storedSession);
        if (session.expiry > Date.now()) {
          setUser(session.user);
          setToken(session.token);
        } else {
          // Session expired
          logout();
        }
      }
    } catch (error) {
      console.error("Failed to parse session from localStorage", error);
    } finally {
      setIsLoading(false);
    }

    // Set up an interval to check for session expiry
    const interval = setInterval(() => {
        const storedSession = localStorage.getItem('session');
        if (storedSession) {
            try {
                const session = JSON.parse(storedSession);
                if (session.expiry <= Date.now()) {
                    logout();
                }
            } catch {
                logout();
            }
        }
    }, 60 * 1000); // Check every minute

    return () => clearInterval(interval); // Cleanup on unmount
  }, [logout]);

  const login = useCallback((sessionData: { user: User, token: string }) => {
    const session = {
        user: sessionData.user,
        token: sessionData.token,
        expiry: Date.now() + SESSION_DURATION
    };
    localStorage.setItem('session', JSON.stringify(session));
    setUser(sessionData.user);
    setToken(sessionData.token);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated: !!user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};