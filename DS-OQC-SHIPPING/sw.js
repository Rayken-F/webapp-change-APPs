'use strict';
const CACHE='oqc-shipping-production-20260920-05';
const BASE=new URL('./',self.location.href).href;
const PREPARATION=new URL('../ds-app/oqc-bootstrap.js?v=20260920-k9',self.location.href).href;
const FILES=['./','index.html','domain-h2-g1.js?v=20260917-g1-01','rt-gate-g1.js?v=20260917-g1-02','rt-catalog-g12.js?v=20260917-g1-03','history-h1.js?v=20260920-k9','batch-removal-rm1.js?v=20260917-g1-01','../ds-app/oqc-bootstrap.js?v=20260920-k9'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||(!event.request.url.startsWith(BASE)&&event.request.url!==PREPARATION))return;
 event.respondWith(fetch(event.request).then(response=>{
  if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(event.request,copy)));}
  return response;
 }).catch(()=>caches.open(CACHE).then(async c=>(await c.match(event.request))||(event.request.mode==='navigate'?(await c.match(BASE))||Response.error():Response.error()))));
});
