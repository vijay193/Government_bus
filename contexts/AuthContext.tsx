

import React, { createContext, useState, useEffect, useCallback } from 'react';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (user: User) => void;
  logout: () => void;
}

const SESSION_DURATION = 15 * 60 * 1000; // 15 minutes

export const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  login: () => {},
  logout: () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(() => {
    localStorage.removeItem('session');
    setUser(null);
  }, []);

  useEffect(() => {
    try {
      const storedSession = localStorage.getItem('session');
      if (storedSession) {
        const session = JSON.parse(storedSession);
        if (session.expiry > Date.now()) {
          setUser(session.user);
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
            const session = JSON.parse(storedSession);
            if (session.expiry <= Date.now()) {
                logout();
            }
        }
    }, 60 * 1000); // Check every minute

    return () => clearInterval(interval); // Cleanup on unmount
  }, [logout]);

  const login = useCallback((userData: User) => {
    const session = {
        user: userData,
        expiry: Date.now() + SESSION_DURATION
    };
    localStorage.setItem('session', JSON.stringify(session));
    setUser(userData);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};