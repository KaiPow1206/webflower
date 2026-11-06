// Tăng CACHE_VERSION sau mỗi lần deploy giao diện mới.
const CACHE_VERSION = "v15";
const STATIC_CACHE = `flower-static-${CACHE_VERSION}`;
const API_CACHE = `flower-api-${CACHE_VERSION}`;
const IMAGE_CACHE = "flower-images-v1";
const CACHE_NAMES = [STATIC_CACHE, API_CACHE, IMAGE_CACHE];

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./main.js",
  "./devtools-guard.js",
  "./celebration-config.js",
];

const API_HOSTS = ["script.google.com"];
const API_HOST_SUFFIXES = [".workers.dev"];
const IMAGE_HOSTS = ["drive.google.com", "lh3.googleusercontent.com"];
const NAVIGATION_TIMEOUT_MS = 3500;
const STATIC_TIMEOUT_MS = 3000;
const MAX_IMAGE_ENTRIES = 400;

let hadPreviousCaches = false;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const existingKeys = await caches.keys();
      hadPreviousCaches = existingKeys.some(
        (key) => key.startsWith("flower") && !CACHE_NAMES.includes(key)
      );

      const cache = await caches.open(STATIC_CACHE);
      await Promise.all(
        STATIC_ASSETS.map(async (asset) => {
          try {
            // "reload" bỏ qua HTTP cache để bản cài mới không dùng lại file cũ.
            await cache.add(new Request(asset, { cache: "reload" }));
          } catch {
            // Một asset lỗi không được chặn toàn bộ quá trình cài đặt.
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("flower") && !CACHE_NAMES.includes(key))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();

      // Có bản cũ: tải lại các tab đang mở để giao diện mới được áp dụng ngay.
      if (!hadPreviousCaches) return;

      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      await Promise.all(
        clients.map((client) => {
          try {
            const target = new URL(client.url);
            target.hash = "";
            return client.navigate(target.href).catch(() => null);
          } catch {
            return Promise.resolve(null);
          }
        })
      );
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isApiRequest(url) {
  return (
    API_HOSTS.includes(url.hostname) ||
    API_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix))
  );
}

function isImageRequest(request, url) {
  return (
    request.destination === "image" ||
    IMAGE_HOSTS.some((host) => url.hostname.includes(host))
  );
}

function isStaticAsset(url) {
  return (
    url.origin === self.location.origin &&
    /\.(?:css|js|mjs|json|html?|webmanifest|ico|png|jpe?g|webp|gif|svg|woff2?|ttf)$/i.test(
      url.pathname
    )
  );
}

function canCacheResponse(response) {
  return (
    Boolean(response) &&
    response.status !== 206 &&
    (response.ok || response.type === "opaque")
  );
}

async function putInCache(cacheName, request, response) {
  if (!canCacheResponse(response)) return;

  let copy;
  try {
    // Clone ngay trước khi response được trả về cho trang.
    copy = response.clone();
  } catch {
    return;
  }

  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, copy);
  } catch {
    // Bỏ qua lỗi quota hoặc response không thể cache.
  }
}

async function getCached(cacheName, request, fallback = null) {
  try {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallback) return cache.match(fallback);
  } catch {
    // Rơi xuống network nếu cache không đọc được.
  }
  return null;
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const overflow = keys.length - maxEntries;
  if (overflow <= 0) return;

  await Promise.all(keys.slice(0, overflow).map((key) => cache.delete(key)));
}

async function networkFirst(event, request, options = {}) {
  const {
    cacheName = STATIC_CACHE,
    timeoutMs = 0,
    fallback = null,
    noStore = false,
  } = options;

  const networkPromise = fetch(request, {
    cache: noStore ? "no-store" : "no-cache",
  }).then(async (response) => {
    await putInCache(cacheName, request, response);
    return response;
  });

  // Giữ service worker sống để kịp cập nhật cache kể cả khi đã trả bản cache.
  event.waitUntil(networkPromise.catch(() => null));

  if (timeoutMs > 0) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error("network-timeout")),
        timeoutMs
      );
    });

    try {
      return await Promise.race([networkPromise, timeoutPromise]);
    } catch (error) {
      const cached = await getCached(cacheName, request, fallback);
      if (cached) return cached;

      const response = await networkPromise.catch(() => null);
      if (response) return response;
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  try {
    return await networkPromise;
  } catch (error) {
    const cached = await getCached(cacheName, request, fallback);
    if (cached) return cached;
    throw error;
  }
}

async function staleWhileRevalidateImage(event, request) {
  const networkPromise = fetch(request).catch(() => null);

  event.waitUntil(
    (async () => {
      const response = await networkPromise;
      if (!response) return;

      await putInCache(IMAGE_CACHE, request, response);

      try {
        await trimCache(IMAGE_CACHE, MAX_IMAGE_ENTRIES);
      } catch {
        // Không để lỗi dọn cache ảnh ảnh hưởng tới request.
      }
    })()
  );

  const cached = await getCached(IMAGE_CACHE, request);
  if (cached) return cached;

  const response = await networkPromise;
  if (response) return response;
  throw new Error("Offline and no cached image.");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (isApiRequest(url)) {
    event.respondWith(
      networkFirst(event, request, {
        cacheName: API_CACHE,
        noStore: true,
      })
    );
    return;
  }

  if (isImageRequest(request, url)) {
    event.respondWith(staleWhileRevalidateImage(event, request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      networkFirst(event, request, {
        cacheName: STATIC_CACHE,
        timeoutMs: NAVIGATION_TIMEOUT_MS,
        fallback: "./index.html",
      })
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      networkFirst(event, request, {
        cacheName: STATIC_CACHE,
        timeoutMs: STATIC_TIMEOUT_MS,
      })
    );
  }
});
