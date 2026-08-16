"use strict";
const CACHE="ds-app-shell-v1-4-3-20260817";
const STATIC=[
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./config.js",
  "./manifest.json",
  "./portal-gate.js",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];
self.addEventListener("install",event=>event.waitUntil(
  caches.open(CACHE).then(c=>c.addAll(STATIC)).then(()=>self.skipWaiting())
));
self.addEventListener("activate",event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())
));
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET") return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin) return;
  event.respondWith(fetch(event.request).then(res=>{
    const copy=res.clone();
    caches.open(CACHE).then(c=>c.put(event.request,copy));
    return res;
  }).catch(()=>caches.match(event.request)));
});
