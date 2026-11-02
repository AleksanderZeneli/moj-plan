const VERSION = 'moj-plan-v9';
const CORE = ['./', './index.html', './styles.css', './app.js', './manifest.webmanifest', './icon.svg'];
self.addEventListener('install', event => event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  // Only public app-shell files may be cached. Never cache API calls or user data.
  const target = new URL(event.request.url);
  if (!CORE.some(path => target.pathname === new URL(path, self.registration.scope).pathname)) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(VERSION).then(cache => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match(event.request)));
});
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { data = {}; }
  const title = String(data.title || 'Mój Plan').slice(0, 100);
  const body = String(data.body || 'Masz nowe przypomnienie').slice(0, 250);
  const url = new URL('./#labs', self.registration.scope).href;
  event.waitUntil(self.registration.showNotification(title, {
    body, icon: new URL('./icon.svg', self.registration.scope).href,
    badge: new URL('./icon.svg', self.registration.scope).href,
    tag: String(data.tag || 'moj-plan-reminder').slice(0, 100),
    data: { url },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL('./#labs', self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await clients.matchAll({type:'window',includeUncontrolled:true});
    const existing = windows.find(client => new URL(client.url).pathname === new URL(url).pathname);
    if (existing) { await existing.focus(); await existing.navigate(url); }
    else await clients.openWindow(url);
  })());
});
