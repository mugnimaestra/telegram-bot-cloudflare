# UMP9 Bot

A Telegram bot for fetching and viewing NH content with PDF generation and Telegraph viewer support. Built with Cloudflare Workers and R2 storage.

## Features

- 🚀 Fast and responsive Telegram bot interface
- 📄 Automatic PDF generation and delivery
- 📱 Telegraph viewer fallback for quick access
- ☁️ Cloudflare R2 storage integration
- 🔄 Automatic retries and error handling
- 💬 Markdown formatted responses
- 🌐 Support for both direct IDs and URLs

## Commands

- `/help` - Show help message and available commands
- `/ping` - Check if bot is alive and get a friendly greeting
- `/nh <id>` - Fetch content and generate PDF/Telegraph viewer
  - Example: `/nh 546408`
  - Example: `/nh https://nhentai.net/g/546408/`

## Technical Details

### API Endpoints

- `POST /endpoint` - Main webhook endpoint for Telegram updates
  - Requires `X-Telegram-Bot-Api-Secret-Token` header for authentication
- `GET /registerWebhook` - Register bot webhook URL
- `GET /unRegisterWebhook` - Unregister bot webhook URL

### Environment Variables

Required environment variables:
- `ENV_BOT_TOKEN` - Telegram Bot API token
- `ENV_BOT_SECRET` - Webhook secret token
- `NH_API_URL` - NH API proxy URL

### R2 Storage Configuration

The bot uses Cloudflare R2 for PDF storage. Required bindings:
- `BUCKET` - R2 bucket binding for PDF storage

### PDF Status Types

- `processing` - PDF is being generated
- `completed` - PDF is ready and available
- `failed` - PDF generation failed
- `unavailable` - R2 storage not configured
- `not_requested` - PDF generation not requested
- `error` - Error during gallery processing

## Development

### Prerequisites

- Node.js and npm
- Wrangler CLI for Cloudflare Workers
- Telegram Bot token from [@BotFather](https://t.me/BotFather)
- Cloudflare account with Workers and R2 enabled

### Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure environment variables in `wrangler.toml`:
   ```toml
   [vars]
   ENV_BOT_TOKEN = "your_bot_token"
   ENV_BOT_SECRET = "your_webhook_secret"
   NH_API_URL = "your_nh_api_url"

   [[r2_buckets]]
   binding = "BUCKET"
   bucket_name = "your_bucket_name"
   ```
4. Deploy to Cloudflare Workers:
   ```bash
   npm run deploy
   ```
5. Register webhook:
   ```
   Visit: https://your-worker-url/registerWebhook
   ```

## Error Handling

The bot includes comprehensive error handling:
- Automatic retries for failed requests
- Telegraph viewer fallback when PDF is unavailable
- Informative error messages for users
- Debug logging for troubleshooting

## Version History

### v1.1.0
- Added PDF generation and delivery
- Implemented Telegraph viewer fallback
- Added R2 storage integration
- Improved error handling and retries
- Enhanced markdown formatting

### v1.0.0
- Initial release
- Basic NH content fetching
- Telegram bot interface

## License

MIT License - See LICENSE file for details 