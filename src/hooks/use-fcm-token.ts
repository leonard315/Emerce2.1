'use client';

import { useEffect, useRef } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';

// ── VAPID Key ─────────────────────────────────────────────────────────────────
// Get this from Firebase Console → Project Settings → Cloud Messaging → Web Push certificates
// Click "Generate key pair" and paste the key here
const VAPID_KEY = process.env.NEXT_PUBLIC_FCM_VAPID_KEY || '';

export function useFCMToken(userId: string | undefined) {
  const db = useFirestore();
  const tokenSavedRef = useRef(false);

  useEffect(() => {
    if (!userId || !db || tokenSavedRef.current) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (!VAPID_KEY) {
      console.info('[FCM] VAPID key not configured — background notifications disabled');
      return;
    }

    const registerFCM = async () => {
      try {
        // Request notification permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        // Register service worker
        const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');

        // Dynamically import Firebase Messaging to avoid SSR issues
        const { getMessaging, getToken } = await import('firebase/messaging');
        const { initializeApp, getApps } = await import('firebase/app');
        const { firebaseConfig } = await import('@/firebase/config');

        // Get or reuse Firebase app
        const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
        const messaging = getMessaging(app);

        // Get FCM token
        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swReg,
        });

        if (token) {
          // Save token to Firestore so server can send notifications
          await setDoc(doc(db, 'fcm_tokens', userId), {
            token,
            userId,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
          tokenSavedRef.current = true;
          console.info('[FCM] Token registered for background notifications');
        }
      } catch (e) {
        console.warn('[FCM] Token registration failed:', e);
      }
    };

    registerFCM();
  }, [userId, db]);
}
