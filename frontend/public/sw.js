const CACHE_NAME = "finzentra-shell-v2"

const SHELL_ASSETS = [
  "./",

  "./manifest.webmanifest",

  "./favicon.svg",

  "./icons/icon-192.png",

  "./icons/icon-512.png",

  "./icons/icon-maskable-512.png",

  "./icons/apple-touch-icon.png",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      await cache.addAll(SHELL_ASSETS)

      const shell = await cache.match("./")
      if (!shell) throw new Error("Finzentra app shell was not cached.")

      const html = await shell.text()
      const assets = [
        ...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))["']/g),
      ].map((match) => new URL(match[1], self.registration.scope).href)
      await cache.addAll(assets)
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches

      .keys()

      .then((keys) =>
        Promise.all(
          keys

            .filter(
              (key) => key.startsWith("finzentra-shell-") && key !== CACHE_NAME,
            )

            .map((key) => caches.delete(key)),
        ),
      )

      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const request = event.request

  const url = new URL(request.url)

  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !url.pathname.startsWith(new URL(self.registration.scope).pathname)
  ) {
    return
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)

        .then((response) => {
          if (response.ok) {
            const copy = response.clone()

            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => cache.put("./", copy)),
            )
          }

          return response
        })

        .catch(async () => {
          const cached = await caches.match("./")

          return cached ?? Response.error()
        }),
    )

    return
  }

  const isStaticAsset =
    ["script", "style", "image", "font"].includes(request.destination) ||
    url.pathname.endsWith(".webmanifest") ||
    url.pathname.endsWith(".svg")
  if (!isStaticAsset) return

  event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request)

      if (cached) return cached

      const response = await fetch(request)

      if (response.ok) {
        event.waitUntil(cache.put(request, response.clone()))
      }

      return response
    }))
})
