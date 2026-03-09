const CACHE = "ds-report-v1"

const urls = [

"/",
"/index.html",
"/style.css",
"/app.js",
"/api.js"

]

self.addEventListener("install",e=>{

e.waitUntil(

caches.open(CACHE)
.then(cache=>cache.addAll(urls))

)

})

self.addEventListener("fetch",e=>{

e.respondWith(

caches.match(e.request)
.then(r=> r || fetch(e.request))

)

})