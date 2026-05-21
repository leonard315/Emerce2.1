// Firebase Cloud Messaging Service Worker
// Handles background push notifications when the app is closed

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDCN9y5Uy5Wks_WQscBWZMlBSpshxf4uoc",
  authDomain: "emerce-ac815.firebaseapp.com",
  projectId: "emerce-ac815",
  messagingSenderId: "274469504137",
  appId: "1:274469504137:web:de10b34aa916da01d3f258",
});

const messaging = firebase.messaging();

// Handle background messages (app is closed or in background)
messaging.onBackgroundMessage((payload) => {
  console.log('[FCM SW] Background message received:', payload);

  const { title, body, icon, data } = payload.notification || {};
  const notificationTitle = title || '🚨 Emergency Alert';
  const notificationOptions = {
    body: body || 'A new emergency has been reported.',
    icon: icon || '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    vibrate: [200, 100, 200, 100, 200],
    requireInteraction: true,
    data: data || {},
    actions: [
      { action: 'open', title: 'Open Dashboard' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/dashboard';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/dashboard') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
