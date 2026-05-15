
'use client';

// This file is deprecated in favor of the standardized @/firebase barrel.
// Redirecting exports to maintain compatibility with legacy imports.
import { initializeFirebase } from '@/firebase';

const { auth, firestore: db } = initializeFirebase();

export { auth, db };
