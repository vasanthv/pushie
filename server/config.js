const { version } = require("../package.json");

module.exports = {
	NODE_ENV: process.env.NODE_ENV,
	VERSION: version,
	PORT: process.env.PORT || 3000,
	PAGE_LIMIT: 50,
	URL: process.env.NODE_ENV === "production" ? "https://pushie.net/" : "http://localhost:3000/",
	MONGODB_URI: process.env.MONGODB_URI || "mongodb://localhost:27017/pushie-dev",
	DISABLE_CSRF: process.env.DISABLE_CSRF,
	CSRF_COOKIE: "csrf_cookie",
	CSRF_TOKEN_EXPIRY: 60 * 30, // 30 mins
	SECRET: process.env.SECRET,
	AWS_ACCESS_KEY: process.env.AWS_ACCESS_KEY_ID,
	AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
	NO_REPLY_EMAIL: process.env.NO_REPLY_EMAIL ?? "Pushie <noreply@email.pushie.net>",
	INVALID_HANDLES: ["administrator", "admin", "bot", "pushie", "all", "everyone"],
	MAX_USERNAME_LENGTH: 18,
	MAX_PUSH_LENGTH: 160,
	ACCOUNT_DELETION_GRACE_DAYS: 7,
	CONTACT_EMAIL: process.env.CONTACT_EMAIL ?? "hello@pushie.net",
	ANALYTICS_SCRIPT: process.env.ANALYTICS_SCRIPT,
	TEST_PUSH_PAYLOAD: "test-push",
	// Every page served by server/view.js, mapped to its <title>. The key is the
	// route; the view rendered is the key without its leading slash.
	VIEW_CONFIG: {
		"/login": "Log in",
		"/signup": "Sign up",
		"/settings": "Settings",
		"/terms": "Terms of service",
		"/privacy": "Privacy policy",
	},
	PUSH_OPTIONS: {
		vapidDetails: {
			subject: `mailto:${process.env.CONTACT_EMAIL ?? "hello@pushie.net"}`,
			publicKey: process.env.VAPID_PUBLIC_KEY,
			privateKey: process.env.VAPID_PRIVATE_KEY,
		},
	},
};
