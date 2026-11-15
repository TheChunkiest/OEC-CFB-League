// OEC Hub phone notifications. Shows the messages the GitHub workflow sends through Firebase Cloud Messaging
// and opens the right page when one is tapped. It doesn't cache anything, so the site always loads fresh.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch (err) { p = { data: { body: e.data ? e.data.text() : '' } }; }
  const d = p.data || {}, n = p.notification || {};
  const title = d.title || n.title || 'OEC Hub';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || n.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: d.tag || undefined,
    data: { link: d.link || (p.fcmOptions && p.fcmOptions.link) || './index.html#home' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data && e.notification.data.link || './index.html#home', self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const same = wins.find(w => w.url.split('#')[0] === url.split('#')[0]);
    if (same) { await same.focus(); return same.navigate ? same.navigate(url) : null; }
    return self.clients.openWindow(url);
  })());
});
