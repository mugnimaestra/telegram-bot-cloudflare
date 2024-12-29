# Telegram Bot on Cloudflare Workers

A simple and modern Telegram bot implementation running on Cloudflare Workers, built with TypeScript and Hono framework.

## Project Structure

```
├── src/
│   ├── api/
│   │   └── server.ts      # API endpoints for URL fetching
│   ├── bot/
│   │   └── index.ts       # Main bot logic and command handling
│   └── types/
│       ├── env.d.ts       # Environment type definitions
│       └── telegram.ts    # Telegram API type definitions
├── wrangler.toml          # Cloudflare Workers configuration
└── package.json          # Project dependencies
```

## Features

- **Modern Stack:**
  - TypeScript for type safety
  - Hono framework for routing and middleware
  - Cloudflare Workers for serverless deployment

- **Bot Commands:**
  - `/start`, `/help` - Show available commands
  - `/ping` - Test bot connection
  - `/fetch <url>` - Fetch URL content with anti-bot bypass

- **API Endpoints:**
  - `POST /api/fetch_url` - Fetch URL content with customized headers

## Prerequisites

- Node.js 16 or higher
- npm or yarn
- A Telegram Bot Token (get from [@BotFather](https://t.me/botfather))
- Cloudflare account with Workers enabled

## Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/mugnimaestra/telegram-bot-cloudflare.git
   cd telegram-bot-cloudflare
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a KV namespace in Cloudflare Dashboard:
   - Go to Workers & Pages > KV
   - Create a new namespace
   - Copy the namespace ID

4. Configure environment variables:
   - Create `.dev.vars` for local development:
     ```
     ENV_BOT_TOKEN="your_bot_token_here"
     ENV_BOT_SECRET="your_secret_here"
     ```
   - Add the same variables in Cloudflare Dashboard for production

5. Update `wrangler.toml`:
   ```toml
   [[kv_namespaces]]
   binding = "NAMESPACE"
   id = "your_namespace_id"
   ```

6. Deploy to Cloudflare Workers:
   ```bash
   npm run deploy
   ```

7. Register the webhook:
   - Visit `https://your-worker.workers.dev/registerWebhook`
   - You should see "Ok" if successful

## Local Development

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Use a tool like [ngrok](https://ngrok.com/) to expose your local server:
   ```bash
   ngrok http 8787
   ```

3. Register the webhook with your ngrok URL:
   - Visit `https://your-ngrok-url/registerWebhook`

## API Documentation

### POST /api/fetch_url
Fetches content from a URL with anti-bot headers.

Request:
```json
{
  "url": "https://example.com"
}
```

Response:
```json
{
  "status": "success",
  "message": "Successfully fetched: Page Title",
  "content": "Page content..."
}
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License. 