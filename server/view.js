const router = require("express").Router();

const utils = require("./utils");
const config = require("./config");

// Pages a logged in user has no business seeing, and pages a logged out one cannot.
const authPages = ["/signup", "/login"];
const userPages = ["/settings"];

// The root serves the pitch to visitors and the feed to signed in users.
router.get("/", (req, res) => res.render(req.user ? "home" : "intro", utils.getViewProps(req)));

router.get("/about", (req, res) => res.render("intro", utils.getViewProps(req, "About - Pushie")));

router.get("/api", (req, res) => res.render("api", utils.getViewProps(req, "API - Pushie")));

router.get(Object.keys(config.VIEW_CONFIG), (req, res) => {
	if (req.user && authPages.includes(req.path)) return res.redirect("/");
	// Carry the intended page so the login can hand the user back to it.
	if (!req.user && userPages.includes(req.path)) {
		return res.redirect(`/login?state=${encodeURIComponent(req.path)}`);
	}
	res.render(req.path.substring(1), utils.getViewProps(req, `${config.VIEW_CONFIG[req.path]} - Pushie`));
});

const notFound = (req, res) => res.status(404).render("404", utils.getViewProps(req, "Page not found - Pushie"));

router.get("/*", notFound);

module.exports = router;
