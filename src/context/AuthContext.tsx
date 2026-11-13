import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onIdTokenChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleAuthProvider, isConfigured } from '../lib/firebase.ts';

export interface DbUser {
  id: number;
  uid: string;
  email: string;
  displayName?: string | null;
  photoURL?: string | null;
  role: string;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  idToken: string | null;
  dbUser: DbUser | null;
  loading: boolean;
  isSsoConfigured: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  idToken: null,
  dbUser: null,
  loading: true,
  isSsoConfigured: true,
  signInWithGoogle: async () => {},
  signOutUser: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    const unsubscribe = onIdTokenChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const token = await currentUser.getIdToken();
          setIdToken(token);

          // Synchronize user to Cloud SQL PostgreSQL database
          const response = await fetch('/api/auth/sync', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          });

          if (response.ok) {
            const data = await response.json();
            setDbUser(data.user);
          }
        } catch (error) {
          console.error('Failed to sync user with Cloud SQL:', error);
        }
      } else {
        setIdToken(null);
        setDbUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    // If running in an unconfigured or cloned repository without own credentials
    if (!isConfigured) {
      const demoToken = 'demo-token-local-engineer';
      setIdToken(demoToken);
      setDbUser({
        id: 999,
        uid: 'demo-local-engineer',
        email: 'demo.engineer@enterprise.internal',
        displayName: 'Demo Engineer (Local)',
        photoURL: null,
        role: 'engineer',
        createdAt: new Date().toISOString(),
      });
      return;
    }

    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (error) {
      console.error('Sign-in error:', error);
      throw error;
    }
  };

  const signOutUser = async () => {
    if (!isConfigured) {
      setUser(null);
      setIdToken(null);
      setDbUser(null);
      return;
    }

    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign-out error:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        idToken,
        dbUser,
        loading,
        isSsoConfigured: isConfigured,
        signInWithGoogle,
        signOutUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
