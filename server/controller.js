const randomString = require("randomstring");

const uuid = require("uuid").v4;

const utils = require("./utils");
const config = require("./config");
const sendEmail = require("./email");

const { Users, Pushes } = require("./db").getInstance();

const signUp = async (req, res, next) => {
	try {
		const username = utils.getValidUsername(req.body.username);
		await utils.isNewUsername(username);
		const email = utils.getValidEmail(req.body.email);
		await utils.isNewEmail(email);
		const password = await utils.hashPassword(utils.getValidPassword(req.body.password));

		const date = new Date();

		const emailVerificationCode = uuid();
		const token = uuid();
		const userAgent = req.get("user-agent");

		const user = new Users({
			username,
			email,
			password,
			emailVerificationCode,
			joinedOn: date,
			devices: [{ token, userAgent }],
		});
		user.allowedUsers = [user._id];
		await user.save();

		req.session.token = token;

		res.json({ message: "Account created. Please verify your email.", username });

		sendEmail.verificationEmail(username, email, emailVerificationCode);
	} catch (error) {
		next(error);
	}
};

const logIn = async (req, res, next) => {
	try {
		const username = utils.getValidUsername(req.body.username);
		const password = utils.getValidPassword(req.body.password);

		const user = await Users.findOne({ username: { $regex: new RegExp(`^${username}$`, "i") } }).exec();
		const { valid, needsUpgrade } = await utils.verifyPassword(password, user?.password);

		if (!user || !valid) return utils.httpError(400, "Invalid user credentials");

		// Move accounts still on the legacy sha256 hash over to scrypt
		if (needsUpgrade) await Users.updateOne({ _id: user._id }, { password: await utils.hashPassword(password) });

		const token = uuid();
		const userAgent = req.get("user-agent");

		await Users.updateOne(
			{ _id: user._id },
			{ $push: { devices: { token, userAgent } }, $unset: { deletionRequestedOn: 1 }, lastLoginOn: new Date() }
		);

		req.session.token = token;
		res.json({ message: "Logged in", username: user.username });
	} catch (error) {
		next(error);
	}
};

const verifyEmail = async (req, res, next) => {
	try {
		const code = req.params.code;

		const user = await Users.findOne({ emailVerificationCode: code }).exec();
		if (!user) return res.status(400).send("Invalid email verification code");

		await Users.updateOne({ _id: user._id }, { $unset: { emailVerificationCode: 1 }, lastUpdatedAt: new Date() });

		res.send("Email verified");
	} catch (error) {
		next(error);
	}
};

const resetPassword = async (req, res, next) => {
	try {
		const username = utils.getValidUsername(req.body.username);

		const user = await Users.findOne({ username }).exec();
		if (!user) return utils.httpError(400, "Invalid username");

		const passwordString = randomString.generate(8);
		const password = await utils.hashPassword(utils.getValidPassword(passwordString));

		await Users.updateOne({ _id: user._id }, { password, lastUpdatedOn: new Date() });
		await sendEmail.resetPasswordEmail(user.username, user.email, passwordString);

		res.json({ message: "Password resetted" });
	} catch (error) {
		next(error);
	}
};

const me = async (req, res, next) => {
	try {
		const { username, email, joinedOn, allowedAnyone, emailVerificationCode } = req.user;

		res.json({ username, email, joinedOn, allowedAnyone, isEmailVerified: !emailVerificationCode });
	} catch (error) {
		next(error);
	}
};

const resendEmailVerification = async (req, res, next) => {
	try {
		const { username, email, emailVerificationCode } = req.user;
		if (!emailVerificationCode) return utils.httpError(400, "Email has beed already verified");

		sendEmail.verificationEmail(username, email, emailVerificationCode);

		res.json({ message: "Re-sent verification email." });
	} catch (error) {
		next(error);
	}
};

const updateAccount = async (req, res, next) => {
	try {
		const currentUsername = req.user.username;

		const username =
			req.body.username && req.body.username.toLowerCase() !== currentUsername
				? utils.getValidUsername(req.body.username)
				: null;
		if (username) await utils.isNewUsername(username, req.user._id);

		const email =
			req.body.email && req.body.email !== req.user.email ? await utils.getValidEmail(req.body.email) : null;
		if (email) await utils.isNewEmail(email, req.user._id);

		const password = req.body.password ? await utils.hashPassword(utils.getValidPassword(req.body.password)) : null;

		const updateFields = {};
		if (username) updateFields["username"] = username;
		if (password) updateFields["password"] = password;

		if (email && email !== req.user.email) {
			const emailVerificationCode = uuid();
			updateFields["email"] = email;
			updateFields["emailVerificationCode"] = emailVerificationCode;
			await sendEmail.verificationEmail(username ?? currentUsername, email, emailVerificationCode);
		}
		if (typeof req.body.allowedAnyone === "boolean") updateFields["allowedAnyone"] = req.body.allowedAnyone;

		await Users.updateOne({ _id: req.user._id }, { ...updateFields, lastUpdatedOn: new Date() });

		// Pushes reference users by username, not by id, so a rename has to carry
		// across the pushes still inside the 24h window or they drop off both the
		// sender's and the recipient's feed.
		if (username) {
			await Pushes.updateMany({ from: currentUsername }, { $set: { from: username } });
			await Pushes.updateMany(
				{ to: currentUsername },
				{ $set: { "to.$[old]": username } },
				{ arrayFilters: [{ old: currentUsername }] }
			);
		}

		res.json({
			message: `Account updated.${updateFields["emailVerificationCode"] ? " Please verify your email." : ""}`,
			username: username ?? currentUsername,
		});
	} catch (error) {
		next(error);
	}
};

const deleteAccount = async (req, res, next) => {
	try {
		const { _id, username, email } = req.user;

		const deletionRequestedOn = new Date();
		const deletionDate = utils.getAccountDeletionDate(deletionRequestedOn);

		await Users.updateOne({ _id }, { deletionRequestedOn, lastUpdatedOn: deletionRequestedOn });

		req.session.destroy();

		res.json({ message: "Account scheduled for deletion", deletionDate });

		sendEmail.accountDeletionEmail(username, email, deletionDate, config.ACCOUNT_DELETION_GRACE_DAYS);
	} catch (error) {
		next(error);
	}
};

const getApiKeys = async (req, res, next) => {
	try {
		const { apiKeys } = req.user;

		res.json({ apiKeys });
	} catch (error) {
		next(error);
	}
};
const newApiKey = async (req, res, next) => {
	try {
		const apiKey = uuid().replaceAll("-", "");

		await Users.updateOne({ _id: req.user._id }, { $push: { apiKeys: apiKey }, lastUpdatedOn: new Date() });

		res.json({ message: "API key created", apiKey });
	} catch (error) {
		next(error);
	}
};

const deleteApiKey = async (req, res, next) => {
	try {
		const apiKey = req.params.key;

		await Users.updateOne({ _id: req.user._id }, { $pull: { apiKeys: apiKey }, lastUpdatedOn: new Date() });

		res.json({ message: "API Key deleted" });
	} catch (error) {
		next(error);
	}
};

const savePushCredentials = async (req, res, next) => {
	try {
		const credentials = req.body.credentials;

		// Test if the credentials are valid
		const isValidPushCredentials = await utils.sendWebPush(credentials, config.TEST_PUSH_PAYLOAD);
		if (!isValidPushCredentials) return utils.httpError(400, "Invalid push credentials");

		const token = req.token;
		if (!token) return utils.httpError(401, "Unauthorized");

		const user = await Users.findOneAndUpdate(
			{ "devices.token": token },
			{ $set: { "devices.$.pushCredentials": credentials }, lastUpdatedOn: new Date() },
			{ new: true }
		).exec();
		if (!user) return utils.httpError(401, "Unauthorized");

		const device = user.devices.find((d) => d.token === token);

		res.json({ message: "Push credentials saved", device });
	} catch (error) {
		next(error);
	}
};

const getAllowedUsers = async (req, res, next) => {
	try {
		const users = await Users.find({ _id: { $in: req.user.allowedUsers } })
			.select("username")
			.exec();

		res.json({ allowedUsers: users.map((user) => user.username), allowedAnyone: req.user.allowedAnyone });
	} catch (error) {
		next(error);
	}
};

const addAllowedUser = async (req, res, next) => {
	try {
		const username = utils.getValidUsername(req.params.username);

		const user = await utils.getUserByUsername(username);
		if (!user) return utils.httpError(404, "User not found");

		const isAlreadyAdded = req.user.allowedUsers.some((id) => id.equals(user._id));
		if (isAlreadyAdded) return res.status(208).json({ message: "User already added", username: user.username });

		await Users.updateOne({ _id: req.user._id }, { $addToSet: { allowedUsers: user._id }, lastUpdatedOn: new Date() });

		res.json({ message: "User added", username: user.username });
	} catch (error) {
		next(error);
	}
};

const removeAllowedUser = async (req, res, next) => {
	try {
		const username = utils.getValidUsername(req.params.username);
		if (username === req.user.username.toLowerCase()) return utils.httpError(400, "Cannot remove your own username");

		const user = await utils.getUserByUsername(username);
		if (!user) return utils.httpError(404, "User not found");

		const isAdded = req.user.allowedUsers.some((id) => id.equals(user._id));
		if (!isAdded) return utils.httpError(400, "User is not in your allowed users");

		await Users.updateOne({ _id: req.user._id }, { $pull: { allowedUsers: user._id }, lastUpdatedOn: new Date() });

		res.json({ message: "User removed", username: user.username });
	} catch (error) {
		next(error);
	}
};

const push = async (req, res, next) => {
	try {
		const body = utils.getValidPushBody(req.body.text);

		// Legacy: POST /push/:username is only valid for the sender's own username; otherwise it behaves like POST /push.
		const sender = req.user.username.toLowerCase();
		if (req.params.username && utils.getValidUsername(req.params.username) !== sender) {
			return utils.httpError(404, "Not found");
		}

		const mentions = utils.getMentions(body);
		const recipients = [...new Set([sender, ...mentions.filter((name) => name !== "all")])];

		const users = await utils.getUsersByUsernames(recipients);

		// @all: everyone who has explicitly added the sender to their allowed users
		if (mentions.includes("all")) {
			const explicit = await Users.find({ allowedUsers: req.user._id }).exec();
			const known = new Set(users.map((user) => String(user._id)));
			users.push(...explicit.filter((user) => !known.has(String(user._id))));
		}

		const allowedUsers = users.filter((user) => user._id.equals(req.user._id) || utils.canPushToUser(user, req.user));

		const from = req.user.username;
		const to = allowedUsers.map((user) => user.username);
		const date = new Date();

		const savedPush = await new Pushes({ user: req.user._id, from, to, text: body, date }).save();

		const payload = utils.getWebPushPayload(req.user, body);

		await Promise.all(
			allowedUsers.map((user) =>
				utils.sendPushNotificationToSubscribers(
					user.devices.filter((device) => device.pushCredentials),
					payload,
					(device) =>
						Users.updateOne(
							{ _id: user._id, "devices.token": device.token },
							{ $unset: { "devices.$.pushCredentials": "" } }
						).exec()
				)
			)
		);

		res.json({
			message: "Push sent",
			to,
			_id: savedPush._id,
			from: savedPush.from,
			text: savedPush.text,
			date: savedPush.date,
		});
	} catch (error) {
		next(error);
	}
};

const pull = async (req, res, next) => {
	try {
		const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);

		const pushes = await Pushes.find({ to: req.user.username.toLowerCase() })
			.select("_id from text date")
			.sort({ date: -1 })
			.skip(skip)
			.limit(config.PAGE_LIMIT)
			.exec();

		res.json({ pushes });
	} catch (error) {
		next(error);
	}
};

const logOut = async (req, res, next) => {
	try {
		await Users.updateOne({ _id: req.user._id }, { $pull: { devices: { token: req.token } } });
		req.session.destroy();
		res.json({ message: "Logged out" });
	} catch (error) {
		next(error);
	}
};

module.exports = {
	signUp,
	logIn,
	verifyEmail,
	resendEmailVerification,
	resetPassword,
	updateAccount,
	deleteAccount,
	me,
	getApiKeys,
	newApiKey,
	deleteApiKey,
	savePushCredentials,
	getAllowedUsers,
	addAllowedUser,
	removeAllowedUser,
	push,
	pull,
	logOut,
};
