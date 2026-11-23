var APP = "nabra-app-v1", EXT = "nabra-ext-v1";
var SHELL = ["./", "index.html", "style.css", "app.js", "favicon.svg", "manifest.webmanifest", "icon-192.png", "icon-512.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(APP).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== APP && k !== EXT; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req).then(function (r) {
        if (r.ok) { var cp = r.clone(); caches.open(APP).then(function (c) { c.put(req, cp); }); }
        return r;
      }).catch(function () {
        return caches.match(req).then(function (m) { return m || caches.match("index.html"); });
      })
    );
    return;
  }

  if (/(^|\.)(jsdelivr\.net|unpkg\.com|googleapis\.com|gstatic\.com)$/.test(url.hostname)) {
    e.respondWith(caches.open(EXT).then(function (c) {
      return c.match(req.url).then(function (hit) {
        if (hit) return hit;
        return fetch(req.url, { mode: "cors" }).then(function (r) {
          if (r.ok) c.put(req.url, r.clone());
          return r;
        }).catch(function () { return fetch(req); });
      });
    }));
  }
});
