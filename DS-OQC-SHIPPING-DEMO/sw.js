'use strict';
const CACHE='oqc-shipping-demo-20260917-g1-01';
const BASE=new URL('./',self.location.href).href;
const FILES=['./','index.html','domain-h2-g1.js?v=20260917-g1-01','rt-gate-g1.js?v=20260917-g1-01','history-h1.js?v=20260917-g1-01','batch-removal-rm1.js?v=20260917-g1-01','domain.js?v=20260909-demo01','storage.js?v=20260909-demo01','app.js?v=20260910-real-entry01','style.css?v=20260909-demo01'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||!event.request.url.startsWith(BASE))return;
 event.respondWith(fetch(event.request).then(response=>{
  if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(event.request,copy)));}
  return response;
 }).catch(()=>caches.open(CACHE).then(async c=>(await c.match(event.request))||(event.request.mode==='navigate'?(await c.match(BASE))||Response.error():Response.error()))));
});
