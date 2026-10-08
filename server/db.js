/**
 * A singleton implementation for the database connection and models
 */

const mongoose = require("mongoose");
const config = require("./config");

module.exports = (() => {
	let instance;
	let db = mongoose.connection;
	const Schema = mongoose.Schema;

	mongoose.set("strictQuery", true);

	const connectToDb = () => {
		mongoose.connect(config.MONGODB_URI);
	};

	const createInstance = () => {
		db.on("error", (error) => {
			console.error("Error in MongoDb connection: " + error);
			mongoose.disconnect(); // Trigger disconnect on any error
		});
		db.on("connected", () => console.log("Pushie DB connected"));
		db.on("disconnected", () => {
			console.log("MongoDB disconnected!");
			connectToDb();
		});

		connectToDb();

		console.log("Pushie DB initialized");

		const userSchema = new Schema({
			username: { type: String, index: true, required: true, unique: true, match: /^([a-zA-Z0-9]){1,18}$/ },
			email: { type: String, index: true, unique: true, required: true },
			password: { type: String, required: true },
			emailVerificationCode: { type: String, index: true },
			joinedOn: { type: Date, default: Date.now },
			bio: String,
			lastLoginOn: Date,
			lastUpdatedOn: Date,
			devices: [
				{
					token: { type: String, index: true },
					userAgent: { type: String },
					pushCredentials: Object,
				},
			],
			apiKeys: [{ type: String, index: true }],
			allowedUsers: [{ type: Schema.Types.ObjectId, ref: "Users", index: true }],
			allowedAnyone: { type: Boolean, default: false },
			deletionRequestedOn: { type: Date, expires: config.ACCOUNT_DELETION_GRACE_DAYS * 86400 },
		});

		const pushSchema = new Schema({
			user: { type: Schema.Types.ObjectId, ref: "Users", index: true }, //who is sending
			from: { type: String, index: true }, // username of user who send it
			to: [{ type: String, index: true }], // all valid recipient username
			text: String,
			date: { type: Date, default: Date.now, expires: 86400 },
			tags: [{ type: String, index: true }],
		});

		const Users = mongoose.model("Users", userSchema);
		const Pushes = mongoose.model("Pushes", pushSchema);

		return { Pushes, Users };
	};

	return {
		getInstance: () => {
			if (!instance) {
				instance = createInstance();
			}
			return instance;
		},
	};
})();
