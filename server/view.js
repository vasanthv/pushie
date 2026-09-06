const router = require("express").Router();

const utils = require("./utils");
const config = require("./config");

// Pages a logged in user has no business seeing, and pages a logged out one cannot.
const authPages = ["/signup", "/login"];
const userPages = ["/settings"];

// Handle web view requests
router.get("/", (req, res) => res.render("home", utils.getViewProps(req)));

router.get(Object.keys(config.VIEW_CONFIG), (req, res) => {
	if (req.user && authPages.includes(req.path)) return res.redirect("/");
	// Carry the intended page so the login can hand the user back to it.
	if (!req.user && userPages.includes(req.path)) {
		return res.redirect(`/login?state=${encodeURIComponent(req.path)}`);
	}
	res.render(req.path.substring(1), utils.getViewProps(req, `${config.VIEW_CONFIG[req.path]} - Pushie`));
});

const notFound = (req, res) => res.status(404).render("404", utils.getViewProps(req, "Page not found - Pushie"));

/**
 * Renders the page of a registered user at `/@username`.
 */
router.get("/@:username", async (req, res) => {
	const username = `${req.params.username}`.toLowerCase();
	if (!utils.isValidUsername(username)) return notFound(req, res);

	const user = await utils.getUserByUsername(username);
	if (!user) return res.status(404).render("404", utils.getViewProps(req, "User not found - Pushie"));

	res.render("user", {
		...utils.getViewProps(req, `@${user.username} - Pushie`),
		profile: user.username,
		bio: user.bio,
		canPush: utils.canPushToUser(user, req.user),
	});
});

router.get("/*", notFound);

module.exports = router;
