/* ============================================================================
   Firebase Cloud Messaging Background Service Worker
============================================================================ */

// Import Firebase App and Messaging Compat SDKs
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

// Initialize Firebase with static project credentials
firebase.initializeApp({
  apiKey: 'AIzaSyAy1c1YMUuowBfiXdNHnUl0oTeN9kZGaUc',
  authDomain: 'electronicshop-3bf16.firebaseapp.com',
  projectId: 'electronicshop-3bf16',
  storageBucket: 'electronicshop-3bf16.firebasestorage.app',
  messagingSenderId: '545483910961',
  appId: '1:545483910961:web:94bfa0f9cc631343668a10',
});

// Initialize Messaging instance
const messaging = firebase.messaging();

// Handle background notification payloads when tab is closed/in background
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);

  const notification = payload.notification || {};
  const notificationTitle = notification.title || 'ElectronicShop';
  
  const notificationOptions = {
    body: notification.body || 'You have a new notification from ElectronicShop.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: { 
      link: payload.fcmOptions?.link || payload.data?.link || '/' 
    },
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle user clicking on the push notification banner
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification clicked:', event);
  
  event.notification.close();

  const targetLink = event.notification.data?.link || '/';

  // Focus on an existing open tab or open a new one
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === targetLink && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetLink);
      }
    })
  );
});