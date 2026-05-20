'use client';

import { useEffect, useRef, useCallback } from 'react';

export function usePushNotifications() {
  const permissionRef = useRef<NotificationPermission>('default');

  // Request permission on first call
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    if (Notification.permission === 'granted') { permissionRef.current = 'granted'; return true; }
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    permissionRef.current = result;
    return result === 'granted';
  }, []);

  // Show a push notification
  const showNotification = useCallback((title: string, options?: NotificationOptions) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    try {
      // Use service worker if available for background notifications
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(reg => {
          reg.showNotification(title, {
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-96x96.png',
            vibrate: [200, 100, 200],
            ...options,
          });
        });
      } else {
        new Notification(title, {
          icon: '/icons/icon-192x192.png',
          ...options,
        });
      }
    } catch (e) {
      console.warn('Push notification failed:', e);
    }
  }, []);

  // Auto-request permission on mount
  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

  return { requestPermission, showNotification, permission: permissionRef.current };
}
