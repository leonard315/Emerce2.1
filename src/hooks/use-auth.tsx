
'use client';

import { createContext, useContext, ReactNode, useMemo, useEffect, useState } from 'react';
import { useUser, useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { UserProfile } from '@/lib/types';
import { doc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useAuth as useFirebaseAuth } from '@/firebase';
import { isSessionExpired, clearLoginTimestamp, getLoginTimestamp, setLoginTimestamp } from '@/firebase';

interface AuthContextType {
  user: any;
  profile: UserProfile | null;
  loading: boolean;
  sessionWarning: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  sessionWarning: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user, isUserLoading: userLoading } = useUser();
  const db = useFirestore();
  const auth = useFirebaseAuth();
  const [sessionWarning, setSessionWarning] = useState(false);

  // ── Session expiry check ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    if (isSessionExpired()) {
      clearLoginTimestamp();
      signOut(auth).catch(() => {});
      return;
    } else if (!getLoginTimestamp()) {
      setLoginTimestamp();
    }

    const SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1000;
    const WARNING_BEFORE_MS = 10 * 60 * 1000; // 10 minutes

    const interval = setInterval(() => {
      const ts = getLoginTimestamp();
      if (!ts) return;
      const remaining = SESSION_MAX_MS - (Date.now() - ts);
      if (remaining <= WARNING_BEFORE_MS && remaining > 0) {
        setSessionWarning(true);
      } else if (remaining <= 0) {
        clearLoginTimestamp();
        signOut(auth).catch(() => {});
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, [user, auth]);

  // useMemoFirebase ensures the ref is stable and satisfies useDoc's memoization requirement
  const profileRef = useMemoFirebase(() => {
    if (!user || !db) return null;
    return doc(db, 'users', user.uid);
  }, [db, user?.uid]);

  const { data: profile, isLoading: profileLoading } = useDoc<UserProfile>(profileRef);
  const loading = userLoading || (!!user && profileLoading);

  return (
    <AuthContext.Provider value={{ user, profile: profile || null, loading, sessionWarning }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
