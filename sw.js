/**
 * Service Worker — steady99 오프라인 모드
 * 모든 앱 에셋을 캐시하여 인터넷 없이 동작하도록 지원
 */

var CACHE_NAME = "steady99-v7";

var ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./js/quotes.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

// Google Fonts URL (캐시 대상)
var FONT_ORIGIN = "https://fonts.googleapis.com";
var FONT_STATIC_ORIGIN = "https://fonts.gstatic.com";

// ── install: 핵심 에셋 프리캐시 ──
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

// ── activate: 이전 캐시 정리 ──
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keyList) {
      return Promise.all(
        keyList.map(function (key) {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// ── fetch: 캐시 우선, 네트워크 폴백 (+ 폰트 런타임 캐시) ──
self.addEventListener("fetch", function (event) {
  var url = event.request.url;

  // Google Fonts: 네트워크 우선, 캐시 폴백 (런타임 캐시)
  if (url.indexOf(FONT_ORIGIN) !== -1 || url.indexOf(FONT_STATIC_ORIGIN) !== -1) {
    event.respondWith(
      fetch(event.request).then(function (response) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, clone);
        });
        return response;
      }).catch(function () {
        return caches.match(event.request);
      })
    );
    return;
  }

  // 나머지 에셋: 캐시 우선, 네트워크 폴백
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) {
        return cached;
      }
      return fetch(event.request).then(function (response) {
        // 유효한 응답만 캐시
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, clone);
        });
        return response;
      });
    })
  );
});
