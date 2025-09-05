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
- 📱 Cooking video recipe extraction with AI
- 🤖 Intelligent analysis using Chutes AI visual models
- 🍳 Complete recipe documentation from cooking videos
- 📋 Extracted ingredients, steps, and cooking techniques

## Commands

- `/help` - Show help message and available commands
- `/ping` - Check if bot is alive and get a friendly greeting
- `/nh <id>` - Fetch content and generate PDF/Telegraph viewer
  - Example: `/nh 546408`
  - Example: `/nh https://nhentai.net/g/546408/`
- `/recipe` - Start cooking video analysis mode
  - Example: `/recipe` then send a cooking video

### PDF Features

- Status tracking with interactive buttons
- Direct PDF download when ready
- Status check limit (10 times per gallery)
- Automatic PDF delivery on completion
- Fallback to Telegraph viewer if needed

## Cooking Video Recipe Extraction

The bot can analyze cooking videos and extract complete recipes using advanced AI visual models. Send any cooking video and the bot will:

- 🤖 Use Chutes AI's Kimi-VL-A3B-Thinking visual language model
- 📋 Extract comprehensive recipe information from video demonstrations
- 📖 Provide formatted recipes with ingredients, steps, and techniques
- ⏱️ Include timing and equipment details

### Setup

#### Chutes API Token

1. Sign up for Chutes AI API (if not already done)
2. Get your API token from the Chutes dashboard
3. Add the token to your `wrangler.toml`:

```toml
[vars]
CHUTES_API_TOKEN = "your-actual-chutes-api-token-here"
```

**Note:** The bot requires a valid Chutes API token to analyze cooking videos. Without it, video analysis will fail with an authentication error.

### How to Send Cooking Videos

You can use the cooking video feature in multiple ways:

- **Direct video upload**: Simply send a cooking video file to the bot
- **Using /recipe command**: Send `/recipe` command, then upload your cooking video
- **Forward videos**: Forward a cooking video from another chat or channel

The bot accepts standard video formats (MP4, AVI, MOV, etc.) with a maximum size of **20MB**.

### What Gets Extracted

The AI analyzes the entire cooking video to extract:

- 🍳 **Recipe title** and metadata (servings, difficulty level)
- ⏱️ **Timing information** (prep time, cook time, total time)
- 📝 **Complete ingredient list** with amounts and preparation notes
- 🔧 **Equipment/tools** shown in the demo
- 📖 **Step-by-step instructions** with durations and tips
- 🎯 **Cooking techniques** demonstrated
- 💡 **General tips and additional notes**

### Usage Examples

#### Example 1: Direct Video Upload

```
User: [sends 15MB MP4 cooking video of "Spaghetti Carbonara"]
Bot: 🎬 Analyzing cooking video...
Bot: 🤖 AI is analyzing the cooking steps and ingredients...
Bot: 🍳 Spaghetti Carbonara

👥 4 servings • ⏱️ Prep: 15 minutes • 🔥 Cook: 10 minutes • ⏰ Total: 25 minutes • 📊 Easy

📝 Ingredients:
• 200g spaghetti
• 2 tbsp olive oil (extra virgin)
• 150g pancetta (diced)
• 2 garlic cloves (minced)
• 4 large eggs
• 50g Parmigiano-Reggiano (grated)
• 100g Pecorino Romano (grated)
• Black pepper (freshly ground)
• Salt to taste

🔧 Equipment:
• Large pot for boiling water
• Frying pan or skillet
• Mixing bowl
• Tongs for pasta
• Wooden spoon
• Cheese grater

📖 Instructions:

Step 1 [5 minutes]
Bring a large pot of salted water to boil. Cook spaghetti according to package directions until al dente. Reserve 1 cup pasta cooking water before draining.

💡 Save some pasta water for the sauce - it's crucial!

Step 2 [2 minutes]
While pasta cooks, heat olive oil in a large skillet over medium heat. Add diced pancetta and cook until crispy and golden brown.

Step 3 [3 minutes]
Lower heat to medium-low. Add minced garlic and cook for 1 minute until fragrant. Remove from heat if garlic starts to brown.

...
```

#### Example 2: Using /recipe Command

```
User: /recipe
Bot: 🎬 Please send a cooking video to analyze. You can:
• Send a video directly
• Use /recipe command then send a video
• Forward a cooking video from another chat

User: [uploads video]
...same analysis process as above...
```

### Troubleshooting

#### Common Issues and Solutions

**"Video is too large" Error**
- Solution: Compress or trim your video to under 20MB
- Alternative: Use a video editor to reduce quality or duration

**"Failed to analyze video" with no specific error**
- Check your internet connection
- Ensure the video contains clear cooking content with visible ingredients and steps
- Try a shorter, higher quality video

**"Configuration error: AI API token missing"**
- Add `CHUTES_API_TOKEN = "your-token"` to `wrangler.toml` vars section
- Make sure your Chutes API account is active and has sufficient credits

**"No recipe information found"**
- Ensure the video clearly shows cooking preparation
- Videos with narration work better than silent cooking demos
- Try videos that show ingredient measurements and step-by-step process

**"Analysis timed out"**
- Cook videos longer than 5 minutes may timeout (90 seconds analysis limit)
- Consider splitting long videos into shorter segments

**"Video format not supported"**
- Use common formats: MP4, AVI, MOV, WMV
- Avoid exotic codecs or encrypted videos
- Test with a different video format

**API Rate Limits**
- Chutes API has rate limits for video analysis
- If you get rate-limited errors, wait a few minutes before retrying

If issues persist, check the bot logs or contact support for assistance.

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
# Required for cooking video analysis
CHUTES_API_TOKEN = "your_chutes_api_token"

[[kv_namespaces]]
binding = "NAMESPACE"
id = "your_kv_namespace_id"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "your_bucket_name"
```

Note: The `CHUTES_API_TOKEN` is required to use the cooking video recipe extraction feature. Obtain this token from your Chutes AI account.

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
- 🍳 AI-powered cooking video recipe extraction
- 📱 Advanced visual analysis with Kimi-VL-A3B-Thinking model
- 🤖 Intelligent recipe parsing and formatted presentation

## License

MIT License - See LICENSE file for details 