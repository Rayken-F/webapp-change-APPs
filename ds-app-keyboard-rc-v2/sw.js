/* DS RC v2 service worker: intentionally no app-shell caching.
   The RC must always fetch current test files so iOS validation is not polluted by stale cache. */
self.addEventListener("install",function(){self.skipWaiting();});
self.addEventListener("activate",function(event){event.waitUntil(self.clients.claim());});
self.addEventListener("fetch",function(){/* network default */});
