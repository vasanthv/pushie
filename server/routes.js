const router = require("express").Router();
const bodyParser = require("body-parser");
const morgan = require("morgan");

const model = require("./controller");
const utils = require("./utils");
const config = require("./config");

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: false }));
router.use(morgan("dev")); // for dev logging

router.get("/verify/:code", model.verifyEmail);
router.get("/vapid", (req, res) => res.json({ vapidKey: config.PUSH_OPTIONS.vapidDetails.publicKey }));

// Logging UI errors
router.post("/error", (req, res) => {
	console.error({ browserError: req.body });
	res.send();
});

router.post("/signup", utils.rateLimit({ windowMs: 30, max: 2, skipFailedRequests: true }), model.signUp);
router.post("/login", utils.rateLimit({ max: 5 }), model.logIn);
router.post("/reset", utils.rateLimit({ max: 5 }), model.resetPassword);
router.post("/resend", utils.rateLimit({ max: 1 }), model.resendEmailVerification);

router.use(["/push", "/pull"], utils.attachUsertoRequestFromAPIKey);

// Auth is applied per route (not with router.use) so unknown paths fall through to the 404 handler.
const auth = utils.isUserAuthed;

router.get("/me", auth, model.me);
router.put("/account", auth, model.updateAccount);
router.delete("/account", auth, model.deleteAccount);

router.post("/device", auth, utils.rateLimit({ max: 25 }), model.savePushCredentials);

router.get("/users", auth, model.getAllowedUsers);
router.post("/users/add/:username", auth, utils.rateLimit({ max: 25 }), model.addAllowedUser);
router.delete("/users/remove/:username", auth, model.removeAllowedUser);

router.get("/keys", auth, model.getApiKeys);
router.post("/key", auth, model.newApiKey);
router.delete("/key/:key", auth, model.deleteApiKey);

router.get("/pull", auth, model.pull);
// `/push/:username` is the legacy form, only valid for the sender's own username.
router.post(
	["/push", "/push/:username"],
	auth,
	utils.rateLimit({ max: 25, keyGenerator: (req) => req.user._id }),
	model.push
);

router.post("/logout", auth, model.logOut);

/**
 * API endpoints common error handling middleware
 */
router.use(["/:404", "/"], (req, res) => {
	res.status(404).json({ message: "ROUTE_NOT_FOUND" });
});

// Handle the known errors
router.use((err, req, res, next) => {
	if (err.httpErrorCode) {
		res.status(err.httpErrorCode).json({ message: err.message || "Something went wrong" });
	} else if (err.type === "entity.parse.failed") {
		res.status(400).json({ message: "Invalid JSON" });
	} else {
		next(err);
	}
});

// Handle the unknown errors. Express only treats 4-argument functions as error handlers, so `next` must stay.
// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
	console.error(err);
	res.status(500).json({ message: "Something went wrong" });
});

module.exports = router;
