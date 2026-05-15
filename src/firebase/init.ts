'use client';

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import { getDatabase, Database } from 'firebase/database';
import { firebaseConfig } from './config';

/**
 * Initializes Firebase services on the client side.
 * Returns the initialized FirebaseApp, Firestore, Database (optional), and Auth instances.
 */
export function initializeFirebase() {
  const firebaseApp: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  const firestore: Firestore = getFirestore(firebaseApp);
  const auth: Auth = getAuth(firebaseApp);
  
  // Realtime Database is optional and depends on the databaseURL being present in the config
  let database: Database | null = null;
  const configWithDb = firebaseConfig as typeof firebaseConfig & { databaseURL?: string };
  if (configWithDb.databaseURL && configWithDb.databaseURL !== '') {
    try {
      database = getDatabase(firebaseApp);
    } catch (error) {
      console.warn('Firebase Realtime Database failed to initialize:', error);
    }
  }

  return { firebaseApp, firestore, database, auth };
}
