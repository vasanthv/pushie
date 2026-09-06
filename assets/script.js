/* global axios, Vue, linkifyHtml */

let swReg = null;

/**
 * Reads a `<meta name="...">` value rendered by the server.
 * @param  {string} name - Name of the meta tag.
 * @return {string|null} Its content, or null when the tag is absent.
 */
const getMeta = (name) => document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ?? null;

/**
 * Converts a base64url VAPID key into the Uint8Array PushManager expects.
 * @param  {string} base64String - URL-safe base64 key.
 * @return {Uint8Array}
 */
const urlB64ToUint8Array = (base64String) => {
	const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
	const rawData = window.atob(base64);
	return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
};

/**
 * Registers the service worker, versioned by the running build. The query
 * string is what makes the browser re-fetch it after a deploy, and it is also
 * how sw.js names its cache.
 */
const initServiceWorker = async () => {
	if (!("serviceWorker" in navigator)) return;
	try {
		swReg = await navigator.serviceWorker.register(`/sw.js?v=${getMeta("pushie-version") ?? "dev"}`);
		// A push that lands while the page is open should show up in the feed too.
		navigator.serviceWorker.addEventListener("message", (event) => {
			if (event.data?.type === "push-received") App.pullNew();
		});
		App.refreshPushSubscription();
	} catch (err) {
		console.error(err);
	}
};

const defaultState = () => ({
	page: getMeta("pushie-page"),
	username: getMeta("pushie-username"), // logged in user, null when logged out
	profile: getMeta("pushie-profile"), // only set on /@username
	maxPushLength: 160,

	toast: { type: "", message: "", time: 0 },
	isLoading: false,
	isSaving: false,

	newAccount: { username: "", email: "", password: "" },
	authCreds: { username: "", password: "" },

	pushes: [],
	showLoadMore: false,
	pushText: "",

	tab: "account",
	myAccount: {},
	allowedUsers: [],
	allowedAnyone: false,
	newAllowedUser: "",
	apiKeys: [],

	pushPermission: window.Notification ? Notification.permission : "denied",
});

const App = Vue.createApp({
	data() {
		return defaultState();
	},
	computed: {
		charsLeft() {
			return this.maxPushLength - this.pushText.length;
		},
	},
	methods: {
		setToast(message, type = "error") {
			const time = Date.now();
			this.toast = { type, message, time };
			setTimeout(() => {
				if (this.toast.time === time) this.toast.message = "";
			}, 4000);
		},

		/* ---------- auth ---------- */

		signUp() {
			const { username, email, password } = this.newAccount;
			if (!username || !email || !password) return this.setToast("All fields are mandatory");

			this.isSaving = true;
			axios
				.post("/api/signup", this.newAccount)
				.then(this.onAuthenticated)
				.finally(() => (this.isSaving = false));
		},
		logIn() {
			const { username, password } = this.authCreds;
			if (!username || !password) return this.setToast("Please enter your username and password");

			this.isSaving = true;
			axios
				.post("/api/login", this.authCreds)
				.then(this.onAuthenticated)
				.finally(() => (this.isSaving = false));
		},
		forgotPassword() {
			if (!this.authCreds.username) return this.setToast("Enter your username first");

			axios.post("/api/reset", { username: this.authCreds.username }).then((response) => {
				this.setToast(response.data.message, "success");
			});
		},
		onAuthenticated(response) {
			this.username = response.data.username;
			// `state` carries the page the user was sent to /login from.
			const state = new URLSearchParams(window.location.search).get("state");
			window.location.replace(state && state.startsWith("/") ? state : "/");
		},
		logOut() {
			if (!confirm("Log out of Pushie?")) return;
			axios.post("/api/logout").finally(() => window.location.replace("/"));
		},

		/* ---------- account ---------- */

		getMe() {
			axios.get("/api/me").then((response) => {
				this.username = response.data.username;
				this.allowedAnyone = Boolean(response.data.allowedAnyone);
				// The password field is always blank: it is only ever a new value.
				this.myAccount = { ...response.data, password: "" };
			});
		},
		updateAccount() {
			const { username, email, password, bio } = this.myAccount;

			this.isSaving = true;
			axios
				.put("/api/account", { username, email, password, bio })
				.then((response) => {
					this.setToast(response.data.message, "success");
					this.myAccount.password = "";
					// A rename changes every @handle on the page, so start clean.
					if (response.data.username !== this.username) return window.location.reload();
					this.getMe();
				})
				.finally(() => (this.isSaving = false));
		},
		resendVerification() {
			axios.post("/api/resend").then((response) => this.setToast(response.data.message, "success"));
		},

		/* ---------- allowed users ---------- */

		getAllowedUsers() {
			axios.get("/api/users").then((response) => {
				this.allowedUsers = response.data.allowedUsers;
				this.allowedAnyone = Boolean(response.data.allowedAnyone);
			});
		},
		addAllowedUser() {
			const username = this.newAllowedUser.trim().replace(/^@/, "");
			if (!username) return this.setToast("Enter a username");

			this.isSaving = true;
			axios
				.post(`/api/users/add/${encodeURIComponent(username)}`)
				.then((response) => {
					this.setToast(response.data.message, "success");
					this.newAllowedUser = "";
					this.getAllowedUsers();
				})
				.finally(() => (this.isSaving = false));
		},
		removeAllowedUser(username) {
			if (!confirm(`Stop @${username} from pushing to you?`)) return;

			axios.delete(`/api/users/remove/${encodeURIComponent(username)}`).then((response) => {
				this.setToast(response.data.message, "success");
				this.getAllowedUsers();
			});
		},
		updateAllowedAnyone() {
			axios
				.put("/api/account", { allowedAnyone: this.allowedAnyone })
				.then((response) => this.setToast(response.data.message, "success"))
				// The checkbox already moved, so put it back if the server disagreed.
				.catch(() => (this.allowedAnyone = !this.allowedAnyone));
		},

		/* ---------- api keys ---------- */

		getApiKeys() {
			axios.get("/api/keys").then((response) => (this.apiKeys = response.data.apiKeys ?? []));
		},
		createApiKey() {
			this.isSaving = true;
			axios
				.post("/api/key")
				.then((response) => {
					this.setToast(response.data.message, "success");
					this.getApiKeys();
				})
				.finally(() => (this.isSaving = false));
		},
		deleteApiKey(key) {
			if (!confirm("Delete this API key? Anything using it stops working. There is no undo.")) return;

			axios.delete(`/api/key/${encodeURIComponent(key)}`).then((response) => {
				this.setToast(response.data.message, "success");
				this.getApiKeys();
			});
		},

		/* ---------- pushes ---------- */

		/**
		 * Appends the next page of received pushes. The API pages by count, so the
		 * page number is derived from what is already on screen.
		 */
		pull() {
			const page = Math.floor(this.pushes.length / 50) + 1;

			this.isLoading = true;
			axios
				.get("/api/pull", { params: { page } })
				.then((response) => {
					this.pushes.push(...response.data.pushes);
					this.showLoadMore = response.data.pushes.length === 50;
				})
				.finally(() => (this.isLoading = false));
		},
		/**
		 * Re-reads the first page after a push arrives and prepends what is new.
		 * Pushes carry no id, so they are matched on sender, text and timestamp.
		 */
		pullNew() {
			if (this.page !== "home" || !this.username) return;

			axios.get("/api/pull", { params: { page: 1 } }).then((response) => {
				const known = new Set(this.pushes.map((push) => `${push.from}|${push.date}|${push.text}`));
				const fresh = response.data.pushes.filter((push) => !known.has(`${push.from}|${push.date}|${push.text}`));
				this.pushes.unshift(...fresh);
			});
		},
		push(text, recipient) {
			if (!text.trim()) return this.setToast("Write something first");

			this.isSaving = true;
			axios
				.post(`/api/push/${encodeURIComponent(recipient)}`, { text })
				.then((response) => {
					this.setToast(response.data.message, "success");
					this.pushText = "";
				})
				.finally(() => (this.isSaving = false));
		},

		/* ---------- web push ---------- */

		/**
		 * Subscribes this browser to push and stores the subscription against the
		 * session's device row.
		 * @param  {boolean} quiet - Suppress the toasts, for the on-load refresh.
		 * @return {Promise<boolean>} Whether the subscription reached the server.
		 */
		async savePushSubscription(quiet) {
			const { vapidKey } = (await axios.get("/api/vapid", { quiet })).data;
			if (!vapidKey) {
				if (!quiet) this.setToast("Notifications are not configured on this server");
				return false;
			}

			const subscription = await swReg.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlB64ToUint8Array(vapidKey),
			});

			await axios.post("/api/device", { credentials: JSON.parse(JSON.stringify(subscription)) }, { quiet });
			return true;
		},
		/**
		 * Asks for notification permission, then registers the device.
		 */
		async enableNotifications() {
			if (!swReg) return this.setToast("This browser cannot receive notifications");

			this.isSaving = true;
			try {
				this.pushPermission = await Notification.requestPermission();
				if (this.pushPermission !== "granted") return this.setToast("Notifications were blocked");

				if (await this.savePushSubscription(false)) {
					this.setToast("Notifications enabled on this device", "success");
				}
			} catch (err) {
				console.error(err);
				this.setToast("Could not enable notifications. Please try again.");
			} finally {
				this.isSaving = false;
			}
		},
		/**
		 * Re-attaches an already-granted subscription to the current session.
		 * Every log in mints a fresh device token, so without this a browser that
		 * granted permission long ago would sit there receiving nothing. Silent by
		 * design: the user did not ask for this, so a failure must not shout.
		 */
		async refreshPushSubscription() {
			if (!swReg || !this.username || this.pushPermission !== "granted") return;
			try {
				await this.savePushSubscription(true);
			} catch (err) {
				console.error(err);
			}
		},

		/* ---------- rendering helpers ---------- */

		displayDate(datestring) {
			const seconds = Math.floor((Date.now() - new Date(datestring)) / 1000);
			const ago = (value, unit) => `${value} ${unit}${value > 1 ? "s" : ""} ago`;

			if (seconds >= 86400) return ago(Math.floor(seconds / 86400), "day");
			if (seconds >= 3600) return ago(Math.floor(seconds / 3600), "hour");
			if (seconds >= 60) return ago(Math.floor(seconds / 60), "minute");
			return "just now";
		},
		/**
		 * Turns URLs in push text into links. The text arrives HTML-escaped from
		 * the server, so it is safe to hand the result to v-html.
		 */
		linkify(text) {
			if (!text) return "";
			return linkifyHtml(text, { attributes: { rel: "noopener noreferrer" }, target: { url: "_blank" } });
		},
		logError(message, source, lineno, colno) {
			const error = { message, source, lineno, colno, username: this.username, page: this.page };
			axios.post("/api/error", { error }).catch(() => {});
			return true;
		},
	},
	mounted() {
		if (this.page === "home" && this.username) this.pull();

		if (this.page === "settings") {
			this.getMe();
			this.getAllowedUsers();
			this.getApiKeys();
		}
	},
}).mount("#app");

window.onerror = App.logError;

(() => {
	const csrfToken = document.cookie
		.split("; ")
		.find((cookie) => cookie.startsWith("csrf_cookie="))
		?.split("=")[1];
	if (csrfToken) axios.defaults.headers.common["x-csrf-token"] = csrfToken;

	axios.interceptors.response.use(
		(response) => response,
		(error) => {
			// A dead session on a signed-in page is only ever fixed by logging in again.
			if (error.response?.status === 401 && App.username) {
				window.location.replace("/login");
				return new Promise(() => {});
			}
			if (!error.config?.quiet) {
				App.setToast(error.response?.data?.message || "Something went wrong. Please try again");
			}
			throw error;
		}
	);

	initServiceWorker();
})();
