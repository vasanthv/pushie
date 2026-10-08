/**
 * Pushie Service worker
 *
 * Registered as `/sw.js?v=<app version>`. The version travels in the query
 * string so a deploy changes the worker's URL - that is what makes the browser
 * fetch it again - and it also names the cache, so old caches are dropped.
 */

const version = new URL(self.location).searchParams.get("v") ?? "dev";
const currentCacheName = `pushie-v-${version}`;

// Static assets only. Pages and API responses are never cached: a stale page
// would show a logged out header to a logged in user.
const filesToCache = [
	"/manifest.json",
	"/styles.css",
	"/vue.global.prod.js",
	"/axios.min.js",
	"/linkify.min.js",
	"/linkify-html.min.js",
	"/script.js",
	"/favicon.svg",
];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches
			.open(currentCacheName)
			.then((cache) => cache.addAll(filesToCache))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((names) =>
				Promise.all(names.filter((name) => name !== currentCacheName).map((name) => caches.delete(name)))
			)
			.then(() => self.clients.claim())
	);
});

self.addEventListener("fetch", (event) => {
	if (event.request.method !== "GET") return;

	const url = new URL(event.request.url);
	if (url.origin !== self.location.origin) return;
	if (!filesToCache.includes(url.pathname)) return;

	// Cache first, but keep the copy fresh for the next load.
	event.respondWith(
		caches.match(event.request).then((cached) => {
			const fetched = fetch(event.request)
				.then((response) => {
					if (response.ok) {
						const copy = response.clone();
						caches.open(currentCacheName).then((cache) => cache.put(event.request, copy));
					}
					return response;
				})
				.catch(() => cached);

			return cached || fetched;
		})
	);
});

self.addEventListener("push", (event) => {
	const rawPayload = event.data && event.data.text();
	if (!rawPayload) return;

	let payload;
	try {
		payload = JSON.parse(rawPayload);
	} catch {
		// Not JSON - the server also sends a plain test payload when validating
		// a new subscription, and that one has nothing to show.
		return;
	}
	if (!payload.title) return;

	const { title, body, url } = payload;

	event.waitUntil(
		Promise.all([
			self.registration.showNotification(title, { body, icon: "/icon-192x192.png", data: { url } }),
			self.clients.matchAll({ includeUncontrolled: true, type: "window" }).then((clients) => {
				clients.forEach((client) => client.postMessage({ type: "push-received", title, body, url }));
			}),
		])
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();

	const urlToOpen = event.notification.data?.url ?? "/";

	event.waitUntil(
		self.clients.matchAll({ includeUncontrolled: true, type: "window" }).then((windowClients) => {
			// Any tab already on the site is better than opening another one.
			const origin = new URL(urlToOpen, self.location.origin).origin;
			const existing = windowClients.find((client) => new URL(client.url).origin === origin);

			return existing ? existing.focus() : self.clients.openWindow(urlToOpen);
		})
	);
});
