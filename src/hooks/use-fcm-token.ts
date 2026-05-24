'use client';

import { useEffect, useRef } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';

const VAPID_KEY = 'BMoxTo9-D116Mf6Wurn1n-IegMviE56DLQV5WyfIU8UbttGp4ZfjKEgKyEk2AFiKLCSZp4pvnvG_b0IAMvGeMpl';

export function useFCMToken(userId: string | undefined) {
  const db = useFirestore();
  const tokenSavedRef = useRef(false);

  useEffect(() => {
    if (!userId || !db || tokenSavedRef.current) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    const registerFCM = async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        // Register the FCM service worker
        const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        await navigator.serviceWorker.ready;

        const { getMessaging, getToken, onMessage } = await import('firebase/messaging');
        const { getApps, getApp, initializeApp } = await import('firebase/app');
        const { firebaseConfig } = await import('@/firebase/config');

        const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
        const messaging = getMessaging(app);

        // Get FCM token
        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swReg,
        });

        if (token) {
          // Save token to Firestore
          await setDoc(doc(db, 'fcm_tokens', userId), {
            token,
            userId,
            updatedAt: new Date().toISOString(),
          }, { merge: true });

          tokenSavedRef.current = true;
          console.info('[FCM] Background notifications enabled');
        }

        // Handle foreground messages (app is open)
        onMessage(messaging, (payload) => {
          const { title, body } = payload.notification || {};
          if (title && 'Notification' in window && Notification.permission === 'granted') {
            new Notification(title || '🚨 Emergency Alert', {
              body: body || 'A new emergency has been reported.',
              icon: '/icons/icon-192x192.png',
              badge: '/icons/icon-96x96.png',
            });
          }
        });

      } catch (e) {
        console.warn('[FCM] Registration failed:', e);
      }
    };

    registerFCM();
  }, [userId, db]);
}
