
'use client';

import { createContext, useContext, ReactNode, useMemo, useEffect } from 'react';
import { useUser, useDoc, useFirestore } from '@/firebase';
import { UserProfile } from '@/lib/types';
import { doc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useAuth as useFirebaseAuth } from '@/firebase';
import { isSessionExpired, clearLoginTimestamp, getLoginTimestamp, setLoginTimestamp } from '@/firebase';

interface AuthContextType {
  user: any;
  profile: UserProfile | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, profile: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user, isUserLoading: userLoading } = useUser();
  const db = useFirestore();
  const auth = useFirebaseAuth();

  // ── Session expiry check ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    if (isSessionExpired()) {
      // Session older than 7 days — sign out
      clearLoginTimestamp();
      signOut(auth).catch(() => {});
    } else if (!getLoginTimestamp()) {
      // User was already logged in before this feature — stamp them now
      setLoginTimestamp();
    }
  }, [user, auth]);

  const profileRef = useMemo(() => {
    if (!user || !db) return null;
    return doc(db, 'users', user.uid);
  }, [db, user]);

  const { data: profile, isLoading: profileLoading } = useDoc<UserProfile>(profileRef);

  const loading = userLoading || (!!user && profileLoading);

  return (
    <AuthContext.Provider value={{ user, profile: profile || null, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
