"use strict";

const CACHE="ds-app-shell-non-image-rc-promotion-20260831-r3";

const STATIC=[
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./shell-ux.css",
  "./shell-ux.js",
  "./production-enhancements.css",
  "./production-enhancements.js",
  "../ds-app-grinding-recovery-rc/rc-line-nav-v8.css",
  "../ds-app-grinding-recovery-rc/rc-shell-stability-v9.css",
  "../ds-app-grinding-recovery-rc/rc-nav-visibility-guard-v12.js",
  "../ds-app-grinding-recovery-rc/rc-shell-stability-v9.js",
  "../ds-app-grinding-recovery-rc/rc-quickbar-keeper-v6.js",
  "../ds-app-grinding-recovery-rc/grinding-ui-safe-rc.js",
  "../ds-app-grinding-recovery-rc/operator-session-rc-v5.js",
  "../ds-app-grinding-recovery-rc/home-production-focus-rc-v5.js",
  "./config.js",
  "./manifest.json",
  "./portal-gate.js",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install",event=>event.waitUntil(
  caches.open(CACHE)
    .then(cache=>cache.addAll(STATIC))
    .then(()=>self.skipWaiting())
));

self.addEventListener("activate",event=>event.waitUntil(
  caches.keys()
    .then(keys=>Promise.all(
      keys
        .filter(key=>key!==CACHE)
        .map(key=>caches.delete(key))
    ))
    .then(()=>self.clients.claim())
));

self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET") return;

  const url=new URL(event.request.url);
  if(url.origin!==location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(response=>{
        const copy=response.clone();
        caches.open(CACHE)
          .then(cache=>cache.put(event.request,copy));
        return response;
      })
      .catch(()=>caches.match(event.request))
  );
});
