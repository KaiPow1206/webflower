const CACHE_NAME = "flower-library-v10";
const STATIC_ASSETS = ["./", "./index.html", "./style.css", "./main.js", "./devtools-guard.js"];

const API_HOST = "script.google.com";
const IMAGE_HOSTS = ["drive.google.com", "lh3.googleusercontent.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

function isImageRequest(url) {
  return IMAGE_HOSTS.some((host) => url.hostname.includes(host));
}

function isApiRequest(url) {
  return url.hostname.includes(API_HOST);
}

function isStaticAsset(url) {
  return STATIC_ASSETS.some((asset) => {
    const normalized = asset.replace("./", "");
    return url.pathname.endsWith(normalized) || (normalized === "" && url.pathname.endsWith("/"));
  });
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await caches.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    networkPromise.catch(() => {});
    return cached;
  }

  const response = await networkPromise;
  if (response) return response;
  throw new Error("Offline and no cached response.");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (isApiRequest(url)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isImageRequest(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate" || isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
