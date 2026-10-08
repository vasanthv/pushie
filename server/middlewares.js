const mongoStore = require("connect-mongo");
const session = require("express-session");
const router = require("express").Router();
const cookieParser = require("cookie-parser");
const morgan = require("morgan");

const config = require("./config");
const csrf = require("./csrf");
const utils = require("./utils");

router.use(morgan("dev")); // for dev logging

// Attach cookie middleware
router.use(cookieParser());

router.use(
	session({
		secret: config.SECRET,
		store: mongoStore.create({ mongoUrl: config.MONGODB_URI }),
		cookie: { maxAge: 1000 * 60 * 60 * 24 * 30 },
		resave: false,
		saveUninitialized: false,
		rolling: true,
	})
);

// Issues CSRF token cookies for safe methods and validates tokens for state-changing requests.
router.use((req, res, next) => {
	if (config.DISABLE_CSRF || req.headers["x-api-key"] || req.headers["X-API-KEY"]) return next();
	const CSRF_COOKIE = config.CSRF_COOKIE;

	// Only protect state-changing requests
	if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
		// Ensure token exists for the client
		let token = req.cookies[CSRF_COOKIE];
		if (!token) {
			token = csrf.createCsrfToken();
			res.cookie(CSRF_COOKIE, token, {
				httpOnly: false, // must be readable by JS
				sameSite: "lax",
				secure: config.NODE_ENV === "production",
				maxAge: config.CSRF_TOKEN_EXPIRY * 1000,
			});
		}
		req.csrfToken = token;
		return next();
	}

	const cookieToken = req.cookies[CSRF_COOKIE];
	const requestToken = req.headers["x-csrf-token"] || req.body?.csrfToken;

	if (!cookieToken || !requestToken || cookieToken !== requestToken || !csrf.verifyCsrfToken(requestToken)) {
		return res.status(403).json({ message: "Forbidden. Please try again" });
	}

	next();
});

router.use(utils.attachUsertoRequest);

module.exports = router;
