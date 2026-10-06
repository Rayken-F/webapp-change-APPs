const CACHE_NAME = "ds-report-beta-dcyl-r1-20261006";

self.addEventListener("install", e => {

e.waitUntil(
caches.open(CACHE_NAME).then(cache => {
return cache.addAll([
"./",
"./index.html",
"./dcyl-return-r1.js?v=20261006-1"
]);
})

);

});
