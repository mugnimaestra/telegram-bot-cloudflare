# UMP9 Bot

A Telegram bot for fetching and viewing NH content with PDF generation and Telegraph viewer support. Built with Cloudflare Workers and R2 storage.

## Features

- 🚀 Fast and responsive Telegram bot interface
- 📄 Automatic PDF generation with status tracking
- 🔄 Interactive status check and download buttons
- 📱 Telegraph viewer fallback for quick access
- ☁️ Cloudflare R2 storage integration
- 🔄 Automatic retries and error handling
- 💬 Markdown formatted responses
- 👥 Group chat support
- 🌐 Support for both direct IDs and URLs

## Commands

- `/help` - Show help message and available commands
- `/ping` - Check if bot is alive and get a friendly greeting
- `/nh <id>` - Fetch content and generate PDF/Telegraph viewer
  - Example: `/nh 546408`
  - Example: `/nh https://nhentai.net/g/546408/`

### PDF Features

- Status tracking with interactive buttons
- Direct PDF download when ready
- Status check limit (10 times per gallery)
- Automatic PDF delivery on completion
- Fallback to Telegraph viewer if needed

## Technical Details

### Stack

- Built with TypeScript and Hono framework
- Cloudflare Workers for serverless deployment
- Cloudflare R2 for PDF storage
- KV namespace for data persistence
- Vitest for testing

### API Endpoints

- `POST /endpoint` - Main webhook endpoint for Telegram updates
  - Requires `X-Telegram-Bot-Api-Secret-Token` header for authentication
- `GET /registerWebhook` - Register bot webhook URL
- `GET /unRegisterWebhook` - Unregister bot webhook URL

### Environment Variables

Required environment variables in wrangler.toml:
```toml
[vars]
CF_ACCOUNT_ID = "your_account_id"
R2_BUCKET_NAME = "your_bucket_name"
R2_PUBLIC_URL = "your_r2_public_url"
NH_API_URL = "your_nh_api_url"

[[kv_namespaces]]
binding = "NAMESPACE"
id = "your_kv_namespace_id"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "your_bucket_name"
```

## Development

### Prerequisites

- Node.js and npm/yarn
- Wrangler CLI (`npm install -g wrangler`)
- Telegram Bot token from [@BotFather](https://t.me/BotFather)
- Cloudflare account with Workers, KV, and R2 enabled

### Local Development Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   yarn install
   ```
3. Configure environment variables in `wrangler.toml`
4. Start local development server:
   ```bash
   yarn dev
   ```

### Testing

The project uses Vitest for testing. Available test commands:
```bash
yarn test          # Run tests in watch mode
yarn test:ui      # Run tests with UI
yarn test:coverage # Run tests with coverage
yarn test:run     # Run tests once
```

### Deployment

1. Login to Cloudflare:
   ```bash
   wrangler login
   ```

2. Deploy to Cloudflare Workers:
   ```bash
   yarn deploy
   ```

3. Register webhook (replace with your worker URL):
   ```
   Visit: https://your-worker-url/registerWebhook
   ```

## Error Handling

The bot includes comprehensive error handling:
- Automatic retries for failed requests
- Telegraph viewer fallback when PDF is unavailable
- Informative error messages for users
- Debug logging for troubleshooting
- KV-based status tracking

## Current Features & Implementation

Core Features:
- 🚀 Fast and responsive Telegram bot interface built with Hono framework
- 📄 Advanced PDF generation system with status tracking and interactive buttons
- 📱 Telegraph viewer integration as quick-access fallback
- ☁️ Cloudflare R2 storage for reliable PDF storage
- 🔄 Robust error handling with automatic retries
- 💬 Rich Markdown-formatted responses
- 👥 Full group chat support
- 🌐 Support for both direct IDs and URLs
- 📊 KV namespace integration for persistent data storage
- 🔍 Status check system with rate limiting
- 📲 Direct PDF download functionality
- 🔄 Interactive status check buttons
- 📨 Automatic PDF delivery on completion
- 🛠️ Comprehensive debugging and logging system
- ⚡ Serverless deployment via Cloudflare Workers

## License

MIT License - See LICENSE file for details 