const CACHE="ds-shell-rc3-20260819-1";
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(["./","./index.html","./rc-v3.css","./rc-v3.js","./manifest.json"]))));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener("fetch",event=>{if(event.request.method!=="GET")return;event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));});
