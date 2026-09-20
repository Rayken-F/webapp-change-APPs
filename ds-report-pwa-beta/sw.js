const CACHE_NAME = "ds-report-beta-ht2-20260920";

self.addEventListener("install", e => {

e.waitUntil(
caches.open(CACHE_NAME).then(cache => {
return cache.addAll([
"./",
"./index.html"
]);
})

);

});
