/* global axios, Vue, linkifyHtml */

let swReg = null;

const getMeta = (name) => document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ?? null;

const urlB64ToUint8Array = (base64String) => {
	const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
	const rawData = window.atob(base64);
	return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
};

const initServiceWorker = async () => {
	if (!("serviceWorker" in navigator)) return;
	try {
		swReg = await navigator.serviceWorker.register(`/sw.js?v=${getMeta("pushie-version") ?? "dev"}`);
		navigator.serviceWorker.addEventListener("message", (event) => {
			if (event.data?.type === "push-received") App.pullNew();
		});
		App.pushPermission = window.Notification ? Notification.permission : "denied";
		App.refreshPushSubscription();
	} catch (err) {
		console.error(err);
	}
};

const defaultState = () => ({
	page: getMeta("pushie-page"),
	username: getMeta("pushie-username"),
	maxPushLength: 160,

	toast: { type: "", message: "", time: 0 },
	isLoading: false,
	isSaving: false,

	newAccount: { username: "", email: "", password: "" },
	authCreds: { username: "", password: "" },

	pushes: [],
	showLoadMore: false,
	pushText: "",
	composerFocused: false,
	mentionToken: null,
	mentionIndex: 0,

	panel: null,
	myAccount: {},
	allowedUsers: [],
	allowedAnyone: false,
	newAllowedUser: "",
	apiKeys: [],

	pushPermission: null,
});

const App = Vue.createApp({
	data() {
		return defaultState();
	},
	computed: {
		composerOpen() {
			return this.composerFocused || this.pushText.length > 0;
		},
		mentionSuggestions() {
			if (!this.mentionToken) return [];
			const query = this.mentionToken.query.toLowerCase();
			return ["all", ...this.otherAllowedUsers]
				.filter((name) => name.toLowerCase().startsWith(query) && name.toLowerCase() !== query)
				.slice(0, 6);
		},
		otherAllowedUsers() {
			return this.allowedUsers.filter((username) => username !== this.username);
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
			const state = new URLSearchParams(window.location.search).get("state");
			window.location.replace(state && state.startsWith("/") ? state : "/");
		},
		logOut() {
			if (!confirm("Log out of Pushie?")) return;
			axios.post("/api/logout").finally(() => window.location.replace("/"));
		},

		getMe() {
			axios.get("/api/me").then((response) => {
				this.username = response.data.username;
				this.allowedAnyone = Boolean(response.data.allowedAnyone);
				this.myAccount = { ...response.data, password: "" };
			});
		},
		updateAccount() {
			const { username, email, password } = this.myAccount;

			this.isSaving = true;
			axios
				.put("/api/account", { username, email, password, allowedAnyone: this.allowedAnyone })
				.then((response) => {
					this.setToast(response.data.message, "success");
					this.myAccount.password = "";
					if (response.data.username !== this.username) return window.location.reload();
					this.getMe();
				})
				.finally(() => (this.isSaving = false));
		},
		deleteAccount() {
			const warning =
				"Delete your Pushie account?\n\nIt will be deleted in 7 days. Log in again before then and it is kept.";
			if (!confirm(warning)) return;

			this.isSaving = true;
			axios
				.delete("/api/account")
				.then(() => window.location.replace("/login"))
				.finally(() => (this.isSaving = false));
		},
		resendVerification() {
			axios.post("/api/resend").then((response) => this.setToast(response.data.message, "success"));
		},

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

		pull() {
			this.isLoading = true;
			axios
				.get("/api/pull", { params: { skip: this.pushes.length } })
				.then((response) => {
					this.pushes.push(...response.data.pushes);
					this.showLoadMore = response.data.pushes.length === 50;
				})
				.finally(() => (this.isLoading = false));
		},
		pullNew() {
			if (this.page !== "home" || !this.username) return;

			axios.get("/api/pull").then((response) => {
				const known = new Set(this.pushes.map((push) => `${push.from}|${push.date}|${push.text}`));
				const fresh = response.data.pushes.filter((push) => !known.has(`${push.from}|${push.date}|${push.text}`));
				this.pushes.unshift(...fresh);
			});
		},
		push(text) {
			if (!text.trim()) return this.setToast("Write something first");

			this.isSaving = true;
			return axios
				.post("/api/push", { text })
				.then((response) => {
					this.setToast(response.data.message, "success");
					this.pushText = "";
				})
				.finally(() => (this.isSaving = false));
		},
		sendPush() {
			const sending = this.push(this.pushText);
			if (sending) {
				sending.then(() => {
					this.composerFocused = false;
					this.pullNew();
				});
			}
		},

		mention(from) {
			if (!from || from === this.username) return;

			const mention = `@${from}`;
			const mentioned = new RegExp(`(^|\\s)${mention}(\\s|$)`, "i");
			if (!mentioned.test(this.pushText)) {
				this.pushText = this.pushText ? `${mention} ${this.pushText}` : `${mention} `;
			}
			this.composerFocused = true;
			this.$nextTick(() => this.$refs.composer?.focus());
		},

		updateMention() {
			const el = this.$refs.composer;
			if (!el) return;

			const match = el.value.slice(0, el.selectionStart).match(/(^|[^a-zA-Z0-9])@([a-zA-Z0-9]*)$/);
			const previous = this.mentionToken;
			this.mentionToken = match ? { start: el.selectionStart - match[2].length - 1, query: match[2] } : null;
			if (!previous || !this.mentionToken || previous.query !== this.mentionToken.query) this.mentionIndex = 0;
		},
		selectMention(name) {
			const el = this.$refs.composer;
			if (!el || !this.mentionToken) return;

			const { start } = this.mentionToken;
			const before = this.pushText.slice(0, start);
			const after = this.pushText.slice(el.selectionStart);
			this.pushText = `${before}@${name} ${after.replace(/^ /, "")}`;
			this.mentionToken = null;

			const cursor = before.length + name.length + 2;
			this.$nextTick(() => {
				el.focus();
				el.setSelectionRange(cursor, cursor);
			});
		},
		composerKeydown(event) {
			const count = this.mentionSuggestions.length;
			if (count && !event.isComposing) {
				if (event.key === "ArrowDown" || event.key === "ArrowUp") {
					event.preventDefault();
					const step = event.key === "ArrowDown" ? 1 : -1;
					this.mentionIndex = (this.mentionIndex + step + count) % count;
					return;
				}
				if (event.key === "Enter" || event.key === "Tab") {
					event.preventDefault();
					return this.selectMention(this.mentionSuggestions[this.mentionIndex]);
				}
				if (event.key === "Escape") {
					event.preventDefault();
					this.mentionToken = null;
					return;
				}
			}

			if (event.key !== "Enter") return;
			if (event.isComposing || event.shiftKey) return;

			event.preventDefault();
			this.sendPush();
		},

		closeComposer(event) {
			if (!this.composerFocused || this.pushText.trim()) return;
			if (event.target?.closest?.(".composer, .overlay")) return;

			this.composerFocused = false;
		},

		togglePanel(name) {
			this.panel = this.panel === name ? null : name;
		},

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
		async refreshPushSubscription() {
			if (!swReg || !this.username || this.pushPermission !== "granted") return;
			try {
				await this.savePushSubscription(true);
			} catch (err) {
				console.error(err);
			}
		},

		displayDate(datestring) {
			const seconds = Math.floor((Date.now() - new Date(datestring)) / 1000);
			const ago = (value, unit) => `${value} ${unit}${value > 1 ? "s" : ""} ago`;

			if (seconds >= 86400) return ago(Math.floor(seconds / 86400), "day");
			if (seconds >= 3600) return ago(Math.floor(seconds / 3600), "hr");
			if (seconds >= 60) return ago(Math.floor(seconds / 60), "min");
			return "just now";
		},
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
		if (this.page === "home" && this.username) {
			this.pull();
			this.getAllowedUsers();
			document.addEventListener("click", this.closeComposer);
		}

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
