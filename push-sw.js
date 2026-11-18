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
  const u = new URL(url), hash = u.hash || '#home', ext = u.origin !== self.location.origin;
  e.waitUntil((async () => {
    if (ext) return self.clients.openWindow(url);   // e.g. YouTube
    // The site is already open (any page of it): bring it forward and tell it which page to show. Changing only
    // the #part doesn't always reload on iPhones, so the page itself switches over when it gets this message.
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const w = wins.find(c => c.url.startsWith(self.registration.scope)) || wins[0];
    if (w) {
      try { await w.focus(); } catch (err) { }
      w.postMessage({ type: 'oec-open', hash });
      return;
    }
    return self.clients.openWindow(url);   // not open: start it on that page
  })());
});
