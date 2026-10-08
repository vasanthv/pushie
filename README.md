# Pushie

Get notified when something happens. Pushie is a small social web-push notification service: sign up, subscribe your devices, and let people (or scripts, via an API key) push short messages to you.

Built with Node.js, Express, MongoDB, Vue and the Web Push protocol.

## Requirements

- Node.js 24+
- MongoDB
- An AWS SES account (only needed for verification and password-reset emails)

## Setup

```bash
npm install
npm run gen:vapid        # prints a VAPID key pair
cp .env.example .env     # then fill in the values
```

`npm start` loads `.env` automatically if it exists. Variables already set in the environment take precedence over it.

```bash
npm start                # http://localhost:3000
```

## Configuration

| Variable                                     | Required  | Description                                                                                                                                                                        |
| -------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SECRET`                                     | yes       | Signs sessions and CSRF tokens. The server will not start without it. Also used to verify legacy password hashes, so keep it unchanged until all old accounts have logged in once. |
| `MONGODB_URI`                                | no        | Defaults to `mongodb://localhost:27017/pushie-dev`                                                                                                                                 |
| `PORT`                                       | no        | Defaults to `3000`                                                                                                                                                                 |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`      | yes       | Web push keys from `npm run gen:vapid`                                                                                                                                             |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | for email | SES credentials                                                                                                                                                                    |
| `NO_REPLY_EMAIL`                             | no        | Sender address for emails                                                                                                                                                          |
| `CONTACT_EMAIL`                              | no        | Contact address and VAPID subject                                                                                                                                                  |
| `ANALYTICS_SCRIPT`                           | no        | Analytics snippet injected into pages                                                                                                                                              |

Note: the public URL (`https://pushie.net`) is currently hardcoded in `server/config.js`, the page meta tags and the legal pages. Change these if you host your own instance.

## Development

```bash
npm run api-dev          # runs with CSRF checks disabled, for testing the API with curl
npx eslint .
```

The API is documented at `/api` on a running instance.

## License

[MIT](LICENSE)
