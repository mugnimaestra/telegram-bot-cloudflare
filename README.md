# Telegram Bot on Cloudflare Workers

A simple Telegram bot implementation running on Cloudflare Workers.

## Setup

1. Get your bot token from [@BotFather](https://t.me/botfather)
2. Sign up for [Cloudflare Workers](https://workers.cloudflare.com/)
3. Install dependencies:
   ```bash
   npm install
   ```
4. Configure your environment variables in Cloudflare Dashboard:
   - `ENV_BOT_TOKEN`: Your Telegram bot token
   - `ENV_BOT_SECRET`: A random secret string for webhook security

5. Create a KV namespace in Cloudflare Dashboard and update `wrangler.toml` with the namespace ID

6. Deploy the worker:
   ```bash
   npm run deploy
   ```

7. Register the webhook:
   - Visit `https://your-worker.workers.dev/registerWebhook`
   - You should see "Ok" if successful

## Development

Run locally:
```bash
npm run dev
```

## Features

- Telegram bot webhook handling
- Basic command handling:
  - `/start`, `/help` - Show available commands
  - `/ping` - Test bot connection
  - `/fetch` - Fetch URL with anti-bot bypass
- Modern web framework using Hono
- TypeScript support
- Easy deployment to Cloudflare Workers

## License

This project is licensed under the MIT License. 