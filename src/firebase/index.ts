'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore'
import { getDatabase } from 'firebase/database'

const SESSION_KEY = 'eh_login_ts';
const SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function getLoginTimestamp(): number | null {
  if (typeof window === 'undefined') return null;
  const v = localStorage.getItem(SESSION_KEY);
  return v ? parseInt(v, 10) : null;
}

export function setLoginTimestamp(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SESSION_KEY, Date.now().toString());
}

export function clearLoginTimestamp(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_KEY);
}

export function isSessionExpired(): boolean {
  const ts = getLoginTimestamp();
  if (!ts) return false; // no timestamp = first time with this feature, don't expire
  return Date.now() - ts > SESSION_MAX_MS;
}

// IMPORTANT: DO NOT MODIFY THIS FUNCTION
export function initializeFirebase() {
  if (!getApps().length) {
    // Important! initializeApp() is called without any arguments because Firebase App Hosting
    // integrates with the initializeApp() function to provide the environment variables needed to
    // populate the FirebaseOptions in production. It is critical that we attempt to call initializeApp()
    // without arguments.
    let firebaseApp;
    try {
      // Attempt to initialize via Firebase App Hosting environment variables
      firebaseApp = initializeApp();
    } catch (e) {
      // Only warn in production because it's normal to use the firebaseConfig to initialize
      // during development
      if (process.env.NODE_ENV === "production") {
        console.warn('Automatic initialization failed. Falling back to firebase config object.', e);
      }
      firebaseApp = initializeApp(firebaseConfig);
    }

    return getSdks(firebaseApp);
  }

  // If already initialized, return the SDKs with the already initialized App
  return getSdks(getApp());
}

export function getSdks(firebaseApp: FirebaseApp) {
  const auth = getAuth(firebaseApp);
  // Ensure session persists across browser restarts
  setPersistence(auth, browserLocalPersistence).catch(() => {});
  return {
    firebaseApp,
    auth,
    firestore: getFirestore(firebaseApp),
    database: getDatabase(firebaseApp)
  };
}

export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
export * from './non-blocking-login';
export * from './errors';
export * from './error-emitter';
