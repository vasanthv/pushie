const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

const config = require("./config");

const verificationEmail = (username, email, code) => {
	const verificartionEmailLink = `${config.URL}api/verify/${code}`;

	const params = {
		Source: config.NO_REPLY_EMAIL,
		Destination: { ToAddresses: [email] },
		Message: {
			Subject: { Charset: "UTF-8", Data: `Please verify your email` },
			Body: {
				Html: {
					Charset: "UTF-8",
					Data: `Hello @${username}<br/><br/>Please click on the link below to verify your email.<br/><a href="${verificartionEmailLink}" target='_blank'>${verificartionEmailLink}</a><br/><br/>Thanks<br/>`,
				},
				Text: {
					Charset: "UTF-8",
					Data: `Hello @${username}\n\nPlease click on the link below to verify your email.\n${verificartionEmailLink}\n\nThanks\n`,
				},
			},
		},
	};
	sendEmail(params);
};

const resetPasswordEmail = (username, email, password) => {
	var params = {
		Source: config.NO_REPLY_EMAIL,
		Destination: { ToAddresses: [email] },
		Message: {
			Subject: { Charset: "UTF-8", Data: `Your password has been resetted.` },
			Body: {
				Html: {
					Charset: "UTF-8",
					Data: `Hello @${username}<br/><br/>Your password to log in to your Pushie account is: <b>${password}</b><br/><br/>Note: Please change your password immediately after logging in.<br/><br/>Thanks<br/>`,
				},
				Text: {
					Charset: "UTF-8",
					Data: `Hello @${username}\n\nYour password to log in to Pushie account is: ${password}\n\nNote: Please change your password immediately after logging in.\n\nThanks\n`,
				},
			},
		},
	};
	sendEmail(params);
};

const accountDeletionEmail = (username, email, deletionDate, graceDays) => {
	const when = deletionDate.toDateString();
	const loginLink = `${config.URL}login`;

	const params = {
		Source: config.NO_REPLY_EMAIL,
		Destination: { ToAddresses: [email] },
		Message: {
			Subject: { Charset: "UTF-8", Data: `Your account will be deleted in ${graceDays} days` },
			Body: {
				Html: {
					Charset: "UTF-8",
					Data: `Hello @${username}<br/><br/>Your Pushie account will be deleted in ${graceDays} days, on <b>${when}</b>.<br/><br/>Until then nothing changes: your account and your API keys keep working as usual.<br/><br/>Changed your mind? Just <a href="${loginLink}" target='_blank'>log in</a> before that date and your account is kept. That is all it takes.<br/><br/>Thanks<br/>`,
				},
				Text: {
					Charset: "UTF-8",
					Data: `Hello @${username}\n\nYour Pushie account will be deleted in ${graceDays} days, on ${when}.\n\nUntil then nothing changes: your account and your API keys keep working as usual.\n\nChanged your mind? Just log in before that date and your account is kept. That is all it takes: ${loginLink}\n\nThanks\n`,
				},
			},
		},
	};
	sendEmail(params);
};

/**
 * Sends one mail through SES. Every caller fires this without awaiting it, so a
 * rejection here would otherwise take the whole process down - misconfigured
 * credentials used to turn any signup into a crash. A mail that cannot be sent
 * is logged and dropped; the request that triggered it still succeeds.
 * @param  {object} params - SendEmailCommand input.
 * @return {Promise<object|null>} The SES response, or null when sending failed.
 */
const sendEmail = async (params) => {
	const client = new SESClient({
		region: "us-west-2",
		credentials: {
			accessKeyId: config.AWS_ACCESS_KEY,
			secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
		},
	});

	try {
		return await client.send(new SendEmailCommand(params));
	} catch (err) {
		console.error("Could not send email", { to: params?.Destination?.ToAddresses, error: err.message });
		return null;
	}
};

module.exports = { verificationEmail, resetPasswordEmail, accountDeletionEmail };
