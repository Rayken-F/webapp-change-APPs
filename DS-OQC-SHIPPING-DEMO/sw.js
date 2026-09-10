'use strict';
const CACHE='oqc-shipping-demo-20260910-02';
const BASE=new URL('./',self.location.href).href;
const FILES=['./','index.html','domain.js?v=20260909-demo01','storage.js?v=20260909-demo01','app.js?v=20260910-real-entry01','style.css?v=20260909-demo01'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||!event.request.url.startsWith(BASE))return;
 event.respondWith(fetch(event.request).then(response=>{
  if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(event.request,copy)));}
  return response;
 }).catch(()=>caches.match(event.request).then(c=>c||(event.request.mode==='navigate'?caches.match(BASE):Response.error()))));
});
