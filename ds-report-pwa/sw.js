const CACHE_NAME = "ds-report-v21";

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
