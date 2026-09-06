const mongoose = require("mongoose");
const Schema = mongoose.Schema;

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
});

const pushSchema = new Schema({
	user: { type: Schema.Types.ObjectId, ref: "Users", index: true }, //who is sending
	from: { type: String, index: true }, // username of user who send it
	to: [{ type: String, index: true }], // all valid recipient username
	text: String,
	date: { type: Date, default: Date.now, expires: 86400 },
	tags: [{ type: String, index: true }],
});

module.exports = {
	userSchema,
	pushSchema,
};
