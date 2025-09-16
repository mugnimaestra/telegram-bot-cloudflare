# UMP9 Bot

A Telegram bot for fetching and viewing NH content with PDF generation, Telegraph viewer support, and AI-powered cooking video analysis. Built with Cloudflare Workers and R2 storage.

## Features

- 🚀 Fast and responsive Telegram bot interface
- 📄 Automatic PDF generation with status tracking and interactive buttons
- 🔄 Real-time PDF generation progress updates
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
- 🎬 Asynchronous video processing with job tracking
- 📊 Webhook-based job completion notifications
- 🔄 Advanced webhook management system
- 📨 Dead letter queue for failed webhook deliveries
- 🔍 Webhook status monitoring and manual retry capabilities
- 📈 Gemini API usage statistics tracking
- 🤖 Automated code reviews with PR-Agent and Chutes AI
- 📝 AI-powered pull request descriptions and improvements
- 🔒 Security features with webhook authentication

## Commands

### Basic Commands
- `/help` - Show help message and available commands
- `/ping` - Check if bot is alive and get a friendly greeting
- `/usage` - Check Gemini API usage statistics

### NH Content Commands
- `/nh <id>` - Fetch content and generate PDF/Telegraph viewer
  - Example: `/nh 546408`
  - Example: `/nh https://nhentai.net/g/546408/`
- `/read <id_or_url>` - Fetch content and generate Telegraph viewer only
  - Example: `/read 546408`
  - Example: `/read https://nhentai.net/g/546408/`
- `/getpdf <id_or_url>` - Fetch content and generate PDF only with real-time progress
  - Example: `/getpdf 546408`
  - Example: `/getpdf https://nhentai.net/g/546408/`

### Cooking Video Analysis Commands
- `/recipe` - Start cooking video analysis mode
  - Example: `/recipe` then send a cooking video
- `/status <job_id>` - Check video analysis job status
  - Example: `/status abc12345`
  - View progress and completion status
  - Get job details and estimated time remaining
  - Includes webhook delivery information

### Webhook Management Commands
- `/webhook_status <job_id>` - Check webhook delivery status
  - Example: `/webhook_status abc12345`
  - View webhook delivery attempts and timestamps
  - See error details for failed deliveries
  - Monitor retry attempts and scheduling
- `/retry_webhook <job_id>` - Manually retry failed webhook delivery
  - Example: `/retry_webhook abc12345`
  - Trigger immediate retry for failed webhooks
  - Reset retry counters and attempt delivery
  - Available for failed webhooks with remaining attempts

### Dead Letter Queue Commands
- `/dead_letter_queue [page]` - List dead letter queue entries
  - Example: `/dead_letter_queue`
  - Example: `/dead_letter_queue 2`
  - View failed webhook deliveries
  - Paginated list with detailed error information
- `/retry_dead_letter <entry_id>` - Retry specific dead letter entry
  - Example: `/retry_dead_letter dead_12345`
  - Manually retry failed webhook deliveries
  - Clear error status and redeliver
- `/clear_dead_letter` - Clear dead letter queue
  - Example: `/clear_dead_letter`
  - Remove all entries from dead letter queue
  - Use with caution - irreversible operation

## PDF Features

- Status tracking with interactive buttons
- Direct PDF download when ready
- Status check limit (10 times per gallery)
- Automatic PDF delivery on completion
- Fallback to Telegraph viewer if needed
- Real-time progress updates during generation
- Error handling with informative messages

## Cooking Video Recipe Extraction

The bot can analyze cooking videos and extract complete recipes using advanced AI visual models. Send any cooking video and the bot will:

- 🤖 Use Chutes AI's Kimi-VL-A3B-Thinking visual language model
- 📋 Extract comprehensive recipe information from video demonstrations
- 📖 Provide formatted recipes with ingredients, steps, and techniques
- ⏱️ Include timing and equipment details
- 🎬 Process videos asynchronously with job tracking
- 📊 Send completion notifications via webhooks

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

The bot accepts standard video formats (MP4, AVI, MOV, etc.) with a maximum size determined by the video analyzer service.

### What Gets Extracted

The AI analyzes the entire cooking video to extract:

- 🍳 **Recipe title** and metadata (servings, difficulty level)
- ⏱️ **Timing information** (prep time, cook time, total time)
- 📝 **Complete ingredient list** with amounts and preparation notes
- 🔧 **Equipment/tools** shown in the demo
- 📖 **Step-by-step instructions** with durations and tips
- 🎯 **Cooking techniques** demonstrated
- 💡 **General tips and additional notes**

### Asynchronous Processing

Cooking video analysis is processed asynchronously:

1. **Job Creation**: When you send a video, the bot creates a job and returns a job ID
2. **Background Processing**: The video is analyzed in the background by the AI service
3. **Webhook Notification**: Upon completion, the service sends a webhook to the bot
4. **Result Delivery**: The bot sends the extracted recipe to your chat

You can check the status of your job using the `/status <job_id>` command.

### Usage Examples

#### Example 1: Direct Video Upload

```
User: [sends 15MB MP4 cooking video of "Spaghetti Carbonara"]
Bot: 🎬 Analyzing cooking video...
Bot: 🤖 AI is analyzing the cooking steps and ingredients...
Bot: 📋 Job created successfully!
Bot: Job ID: abc12345
Bot: Use /status abc12345 to check progress

[After processing completes]
Bot: ✅ Recipe extraction complete!

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
```

#### Example 2: Using /recipe Command

```
User: /recipe
Bot: 🎬 *Send me a cooking video\!*

I'll analyze it and extract:
• Complete ingredients list
• Step\-by\-step instructions
• Cooking times and temperatures
• Tips and techniques

⚠️ *Important:* Video size will be validated by the analyzer service
_Processing is done asynchronously - you'll get a job ID to track progress_

User: [uploads video]
Bot: 🎬 Analyzing cooking video...
Bot: 🤖 AI is analyzing the cooking steps and ingredients...
Bot: 📋 Job created successfully!
Bot: Job ID: def67890
Bot: Use /status def67890 to check progress
```

### Troubleshooting

#### Common Issues and Solutions

**"Video is too large" Error**
- Solution: Compress or trim your video to meet size requirements
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
- Long videos may timeout due to processing limits
- Consider splitting long videos into shorter segments

**"Video format not supported"**
- Use common formats: MP4, AVI, MOV, WMV
- Avoid exotic codecs or encrypted videos
- Test with a different video format

**API Rate Limits**
- Chutes API has rate limits for video analysis
- If you get rate-limited errors, wait a few minutes before retrying

**Job Status Issues**
- Use `/status <job_id>` to check job progress
- If job is not found, it may have expired or already been processed
- Jobs are typically kept for 24 hours before cleanup

If issues persist, check the bot logs or contact support for assistance.

## Video Analysis Webhook System

The bot implements a sophisticated webhook system for handling asynchronous video analysis job completion:

### Webhook Architecture

- **Job Submission**: Videos are submitted to the analysis service with a callback URL
- **Async Processing**: The service processes videos in the background
- **Webhook Delivery**: Upon completion, the service sends results via webhook
- **Result Handling**: The bot processes the webhook and delivers results to users

### Webhook Security

- **Secret Authentication**: All webhooks require a `X-Webhook-Secret` header
- **Environment Configuration**: Secret is configured via `WEBHOOK_SECRET` environment variable
- **Payload Validation**: All webhook payloads are validated against expected schema
- **Error Handling**: Detailed error responses for invalid or malformed webhooks

### Retry Mechanism

- **Automatic Retries**: Failed webhook deliveries are retried with exponential backoff
- **Retry Limits**: Maximum of 3 retry attempts (configurable)
- **Dead Letter Queue**: Failed deliveries are moved to dead letter queue after retries
- **Manual Retry**: Dead letter entries can be manually retried via commands

### Webhook Endpoints

- `POST /webhook/video-analysis` - Receives job completion notifications
- Requires `X-Webhook-Secret` header for authentication
- Validates payload structure and processes job results
- Supports both success and failure notifications

### Webhook Management Commands

The bot provides comprehensive webhook management:

- **Status Monitoring**: Check webhook delivery status with `/webhook_status`
- **Manual Retry**: Retry failed webhooks with `/retry_webhook`
- **Dead Letter Queue**: View failed deliveries with `/dead_letter_queue`
- **Queue Management**: Retry individual entries or clear the entire queue

## Advanced Webhook Management

The bot includes advanced webhook management capabilities for monitoring and controlling the delivery of video analysis results:

### Webhook Status Tracking

Each webhook delivery is tracked with detailed information:

- **Delivery Attempts**: Number of delivery attempts made
- **Timestamps**: When each attempt was made
- **Error Details**: Specific error messages for failed deliveries
- **Retry Schedule**: When the next retry will occur
- **Status Codes**: HTTP status codes from delivery attempts

### Dead Letter Queue

Failed webhook deliveries that exceed retry limits are moved to a dead letter queue:

- **Entry Persistence**: Dead letter entries are stored for 7 days
- **Detailed Error Information**: Complete error context and payload
- **Manual Recovery**: Individual entries can be retried manually
- **Bulk Operations**: Support for clearing the entire queue

### Monitoring and Debugging

- **Detailed Logging**: Comprehensive logging for webhook processing
- **Error Context**: Rich error information for debugging
- **Payload Inspection**: Ability to inspect webhook payloads
- **Delivery Metrics**: Statistics on successful and failed deliveries

## Telegraph Integration Details

The bot integrates with Telegraph for providing quick-access content viewing:

### Telegraph Account Management

- **Automatic Account Creation**: Bot creates Telegraph accounts automatically
- **Account Reuse**: Existing accounts are reused for efficiency
- **Error Handling**: Graceful fallback if Telegraph is unavailable

### Page Creation

- **Gallery Pages**: Creates multi-page galleries for content
- **Content Formatting**: Proper formatting of images and text
- **Page Limits**: Handles Telegraph's page size limits gracefully
- **URL Generation**: Generates shareable Telegraph URLs

### Fallback Strategy

- **Primary Fallback**: Telegraph viewer when PDF generation fails
- **Error Handling**: Informative messages when Telegraph is unavailable
- **User Experience**: Seamless transition between PDF and Telegraph views

## PR-Agent Integration with Chutes AI

This repository includes automated code review capabilities using PR-Agent (Qodo) integrated with Chutes AI as the OpenAI-compatible endpoint.

### Features

- 🤖 **Automated Code Reviews**: AI-powered analysis of pull requests
- 📝 **PR Description Generation**: Automatic generation of comprehensive PR descriptions
- 🔍 **Code Quality Analysis**: TypeScript and Cloudflare Workers specific feedback
- 🚀 **Performance Optimization**: Suggestions for improving code performance
- 🛡️ **Security Analysis**: Automated security vulnerability detection
- 📊 **Test Coverage Analysis**: Feedback on test coverage and quality

### Quick Setup

Get started in 5 minutes with our automated setup:

```bash
# Install dependencies
yarn install

# Run the automated setup script
yarn pr-agent:setup

# Test the integration
yarn pr-agent:test
```

For detailed setup instructions, see [SETUP_CHUTES_AI.md](SETUP_CHUTES_AI.md).

### How It Works

1. **On Pull Request Creation**: The GitHub Actions workflow automatically triggers
2. **Code Analysis**: PR-Agent analyzes the code changes using Chutes AI
3. **Review Comments**: AI-generated comments are posted on the pull request
4. **PR Description**: Optional automatic generation of PR descriptions

### Configuration

The integration is configured through:
- [`.github/workflows/pr-agent.yml`](.github/workflows/pr-agent.yml) - GitHub Actions workflow
- [`.pr_agent.toml`](.pr_agent.toml) - PR-Agent configuration
- Environment variables and GitHub secrets

### Testing the Integration

1. Create a new branch: `git checkout -b test-pr-agent`
2. Make a small change to any TypeScript file
3. Commit and push your changes
4. Create a pull request using the [PR template](.github/pull_request_template.md)
5. Check the Actions tab for workflow execution
6. Review AI-generated comments on your PR

### Troubleshooting

If you encounter issues with the PR-Agent integration:

1. Check the [troubleshooting guide](.github/ISSUE_TEMPLATE/pr_agent_integration_issue.md)
2. Run the test script: `yarn pr-agent:test`
3. Verify GitHub secrets are correctly set
4. Check the workflow logs in the Actions tab

### Advanced Configuration

For advanced users, you can customize:
- AI model parameters in [`.pr_agent.toml`](.pr_agent.toml)
- Review criteria and focus areas
- Workflow triggers and conditions
- Notification preferences

See the [full documentation](PR_AGENT_CHUTES_AI_SETUP.md) for more details.

## Userbot Configuration

The bot supports userbot functionality that allows it to operate as either a Telegram Bot or a Telegram User account. This provides flexibility for different use cases and access levels.

### Authentication Modes

The userbot supports two authentication modes:

#### Bot Mode (Recommended)
- **Authentication**: Uses Bot Token from @BotFather
- **Setup**: Simple, no interactive login required
- **Capabilities**: Standard bot functionality with API limitations
- **Use Case**: General bot operations, automated responses

#### User Mode
- **Authentication**: Uses Phone Number + Password (with optional 2FA)
- **Setup**: Requires phone verification during initial setup
- **Capabilities**: Full user access to Telegram features
- **Use Case**: Operations requiring user-level permissions, accessing user-only features

### Secure Setup Script

To securely configure userbot secrets without exposing sensitive data in your codebase, use the provided setup script:

```bash
# Run the interactive setup script
node scripts/setup-userbot-secrets.js
```

The script will:
1. Guide you through selecting an authentication mode
2. Prompt for required credentials interactively
3. Set secrets securely using Wrangler CLI
4. Validate configuration before applying

**Security Benefits:**
- Secrets are stored in Cloudflare Workers environment, not in code
- No sensitive data is committed to the repository
- Interactive input prevents accidental exposure
- Configuration validation ensures proper setup

### Manual Secret Management

If you prefer to set secrets manually, use the Wrangler CLI:

```bash
# Common secrets (required for both modes)
wrangler secret put TELEGRAM_API_ID
wrangler secret put TELEGRAM_API_HASH
wrangler secret put USERBOT_ENABLED
wrangler secret put USERBOT_AUTH_MODE

# Bot mode secrets
wrangler secret put TELEGRAM_BOT_TOKEN

# User mode secrets
wrangler secret put TELEGRAM_PHONE_NUMBER
wrangler secret put TELEGRAM_PASSWORD  # Optional, for 2FA
```

### Getting Telegram API Credentials

1. Visit [https://my.telegram.org](https://my.telegram.org)
2. Login with your phone number
3. Go to "API development tools"
4. Create a new application to get API_ID and API_HASH
5. For bot mode: Create a bot using [@BotFather](https://t.me/BotFather)

### Environment Variables

The following environment variables are used for userbot configuration:

| Variable | Required | Mode | Description |
|----------|----------|------|-------------|
| `USERBOT_ENABLED` | Yes | Both | Enable/disable userbot functionality |
| `USERBOT_AUTH_MODE` | Yes | Both | Authentication mode: "bot" or "user" |
| `TELEGRAM_API_ID` | Yes | Both | Telegram API ID number |
| `TELEGRAM_API_HASH` | Yes | Both | Telegram API hash string |
| `TELEGRAM_BOT_TOKEN` | Bot only | Bot | Bot token from @BotFather |
| `TELEGRAM_PHONE_NUMBER` | User only | User | Phone number with country code |
| `TELEGRAM_PASSWORD` | No | User | 2FA password (if enabled) |

### Session Management

The userbot automatically manages session persistence:
- Sessions are stored in Cloudflare KV namespace
- Sessions are automatically loaded on worker startup
- Sessions expire after 30 days (configurable)
- Failed sessions are automatically cleared and recreated

### Troubleshooting

#### Common Issues

**"Missing or invalid required environment variables"**
- Run the setup script to ensure all required secrets are set
- Verify Wrangler CLI is authenticated: `wrangler whoami`
- Check that secrets are properly set: `wrangler secret list`

**"Authentication failed"**
- Verify API credentials are correct
- For user mode: ensure phone number format includes country code
- For bot mode: verify bot token is valid and not expired

**"Session loading failed"**
- Sessions may be corrupted or expired
- The bot will automatically clear invalid sessions and create new ones
- Check KV namespace is properly configured

#### Commands for Userbot Management

The bot provides several commands for managing userbot functionality:

- `/userbot_start` - Start the userbot client
- `/userbot_stop` - Stop the userbot client
- `/userbot_status` - Check userbot connection status
- `/userbot_info` - Get userbot user information
- `/userbot_send <peer> <message>` - Send message using userbot
- `/userbot_help` - Display userbot help information

## Security Features

The bot implements multiple security features to ensure safe operation:

### Bot Security

- **Token Authentication**: All bot operations require valid Telegram bot token
- **Webhook Verification**: Telegram webhooks verified with secret token
- **Command Validation**: All commands are validated before processing
- **Rate Limiting**: Protection against spam and abuse

### Webhook Security

- **Secret Authentication**: Video analysis webhooks require secret token
- **Payload Validation**: All webhook payloads are strictly validated
- **Size Limits**: Protection against large payload attacks
- **Schema Validation**: Ensures webhook data matches expected structure

### Data Protection

- **No Data Storage**: User data is not permanently stored
- **Temporary Processing**: Data is only held during processing
- **Secure Transfers**: All communications use HTTPS
- **Access Control**: Limited access to sensitive operations

## Technical Details

### Stack

- Built with TypeScript and Hono framework
- Cloudflare Workers for serverless deployment
- Cloudflare R2 for PDF storage
- KV namespace for data persistence
- Vitest for testing

### Architecture

- **Serverless Design**: Fully serverless architecture using Cloudflare Workers
- **Asynchronous Processing**: Background processing for long-running tasks
- **Event-Driven**: Webhook-based event handling for job completion
- **Error Resilience**: Comprehensive error handling and retry mechanisms
- **Scalable**: Automatically scales with Cloudflare's global network

### API Endpoints

- `POST /endpoint` - Main webhook endpoint for Telegram updates
  - Requires `X-Telegram-Bot-Api-Secret-Token` header for authentication
- `POST /webhook/video-analysis` - Video analysis job completion webhook
  - Requires `X-Webhook-Secret` header for authentication
- `GET /registerWebhook` - Register bot webhook URL
- `GET /unRegisterWebhook` - Unregister bot webhook URL

### Environment Variables

Required environment variables in wrangler.toml:
```toml
[vars]
# Cloudflare Configuration
CF_ACCOUNT_ID = "your_account_id"
R2_BUCKET_NAME = "your_bucket_name"
R2_PUBLIC_URL = "your_r2_public_url"

# API Configuration
NH_API_URL = "your_nh_api_url"
VIDEO_ANALYSIS_SERVICE_URL = "your_video_analysis_service_url"

# Bot Configuration
ENV_BOT_TOKEN = "your_telegram_bot_token"
ENV_BOT_SECRET = "your_webhook_secret"
WEBHOOK_SECRET = "your_webhook_verification_secret"

# AI Service Configuration
CHUTES_API_TOKEN = "your_chutes_api_token"
GEMINI_API_KEY = "your_gemini_api_key"

# Application Configuration
NODE_ENV = "production"

[[kv_namespaces]]
binding = "NAMESPACE"
id = "your_kv_namespace_id"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "your_bucket_name"
```

### Advanced wrangler.toml Configuration

For production deployments, consider these additional configurations:

```toml
# Production-specific configuration
[env.production]
vars = { NODE_ENV = "production" }

# Development-specific configuration
[env.development]
vars = { NODE_ENV = "development" }

# Observability and logging
[observability.logs]
enabled = true

# Build configuration
[build]
command = "" # No custom build command needed if just using esbuild defaults
```

### Package Dependencies

Key dependencies from package.json:
- **Hono**: Fast web framework for Cloudflare Workers
- **Vitest**: Testing framework with Cloudflare Workers support
- **ESLint & Prettier**: Code quality and formatting tools
- **Cloudflare Workers Types**: TypeScript definitions for Workers
- **Telegram API Types**: Type definitions for Telegram Bot API

### Error Handling Strategy

The bot implements comprehensive error handling:

- **Automatic Retries**: Failed requests are retried with exponential backoff
- **Graceful Degradation**: Fallback to Telegraph when PDF generation fails
- **Informative Messages**: Clear error messages for users
- **Debug Logging**: Detailed logging for troubleshooting
- **KV-based Tracking**: Persistent status tracking for long-running operations

## Development

### Prerequisites

- Node.js and npm/yarn
- Wrangler CLI (`npm install -g wrangler`)
- Telegram Bot token from [@BotFather](https://t.me/BotFather)
- Cloudflare account with Workers, KV, and R2 enabled
- Chutes AI API token for video analysis

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

This project uses Vitest as its testing framework with specialized utilities and practices optimized for serverless environments and agentic processes.

#### Test Commands

```bash
# Development and debugging
yarn test              # Run tests in watch mode (for development)
yarn test:ui          # Run tests with interactive UI
yarn test:coverage    # Run tests with coverage report

# Production and CI/CD
yarn test:run         # Run tests once and exit (CRITICAL for automation)
```

#### Test Organization and Structure

The project follows a co-located testing pattern for better maintainability:

```
src/
├── utils/
│   ├── video/
│   │   ├── analyzeVideo.ts           # Source code
│   │   └── analyzeVideo.test.ts      # Test file
│   ├── nh/
│   │   ├── fetchNHData.ts            # Source code
│   │   └── fetchNHData.test.ts       # Test file
│   └── test/                         # Shared testing utilities
│       ├── mockR2Bucket.ts           # R2 bucket mocking
│       └── nock.ts                   # Enhanced HTTP mocking
```

**Key Features:**
- **Co-located tests**: Test files live alongside their source files
- **Shared utilities**: Common testing tools centralized for reuse
- **Environment-aware**: Specialized mocks for Cloudflare Workers components
- **Integration-focused**: Tests verify both unit behavior and system integration

#### Testing Utilities

##### R2 Bucket Mocking
```typescript
import { mockR2Bucket } from "@/utils/test/mockR2Bucket";

// Mock all R2 operations (get, put, delete, list, etc.)
mockR2Bucket.put.mockResolvedValueOnce({
  etag: "test-etag",
  key: "test-key",
});
```

##### Enhanced HTTP Mocking
```typescript
import nock from "@/utils/test/nock";

// Automatic CORS handling and debug logging
const scope = nock("https://api.example.com")
  .post("/analyze")
  .matchHeader("content-type", "application/json")
  .reply(200, { success: true });
```

**Features:**
- **Automatic CORS**: Pre-configured for cross-origin requests
- **Debug logging**: Built-in request/response logging
- **No-match tracking**: Detailed logging for unexpected requests
- **Easy cleanup**: Centralized cleanup utilities

#### Coverage Reporting

The project provides comprehensive coverage reporting:

```bash
yarn test:coverage
```

**Output Formats:**
- **Text**: Console summary for quick checks
- **JSON**: Machine-readable for CI/CD integration
- **HTML**: Interactive report at `coverage/index.html`

**Coverage Targets:**
- Maintain >80% coverage for critical business logic
- Focus on error handling and edge cases
- Exclude configuration files and type definitions

#### CI/CD Integration

**Critical for Agentic Processes:**
```bash
# ❌ NEVER use this in CI/CD - runs indefinitely in watch mode
yarn test

# ✅ ALWAYS use this in CI/CD and automation
yarn test:run
```

**Why this matters:**
- The default `yarn test` command runs in watch mode, monitoring file changes and never exiting
- Agentic processes (CI/CD pipelines, automation scripts, AI assistants) will hang waiting for termination
- The `--run` flag ensures tests run exactly once and exit with proper status codes
- Essential for any automated workflow that needs to continue after tests complete

**Example CI/CD Configuration:**
```yaml
# GitHub Actions example
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: yarn install
      - run: yarn test:run           # Single execution for CI
      - run: yarn test:coverage      # Generate coverage
      - uses: codecov/codecov-action@v3
```

#### Performance Testing

**Optimization Strategies:**
1. **Mock external dependencies** to eliminate network latency
2. **Use fake timers** for time-dependent operations
3. **Proper cleanup** to prevent test pollution
4. **Parallel execution** leveraging Vitest's built-in parallelization

**Example Performance-Optimized Test:**
```typescript
describe("VideoAnalysis", () => {
  beforeEach(() => {
    _nock.cleanAll();           // Clean HTTP mocks
    vi.clearAllMocks();         // Clear mock history
    vi.useFakeTimers();         // Mock timers
  });

  afterEach(() => {
    _nock.cleanAll();           // Ensure cleanup
    vi.useRealTimers();         // Restore real timers
  });

  it("should handle timeouts efficiently", async () => {
    const promise = analyzeVideo(videoData);
    vi.advanceTimersByTime(30000); // Fast-forward 30 seconds
    
    await expect(promise).rejects.toThrow("Timeout");
  });
});
```

#### Debugging Tests

**Common Debugging Approaches:**

1. **Run specific tests:**
```bash
yarn test:run --grep "should handle timeouts"
yarn test:run videoAnalysis.test.ts
```

2. **Enable verbose logging:**
```typescript
// Tests include built-in debug logging
// Mock logger to capture debug output
vi.mock("@/utils/logger", () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    // ...
  },
}));
```

3. **VS Code Debug Configuration:**
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Current Test File",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/vitest/vitest.mjs",
      "args": ["run", "${relativeFile}"],
      "console": "integratedTerminal"
    }
  ]
}
```

#### Best Practices for Maintainable Tests

**Test Structure:**
1. **Arrange-Act-Assert**: Clear separation of setup, execution, verification
2. **Descriptive names**: Use `should` or `it` to describe expected behavior
3. **Test independence**: Each test should work in isolation
4. **Minimal mocking**: Mock only what's necessary

**Example Maintainable Test:**
```typescript
describe("VideoAnalysisService", () => {
  const mockRequest = {
    videoUrl: "https://test.r2.dev/videos/test.mp4",
    userId: 123,
  };

  beforeEach(() => {
    _nock.cleanAll();
    vi.clearAllMocks();
  });

  it("should successfully analyze video", async () => {
    // Arrange - Setup
    const mockRecipe = { title: "Test Recipe", /* ... */ };
    const scope = nock("https://api.example.com")
      .post("/analyze")
      .reply(200, { success: true, recipe: mockRecipe });

    // Act - Execute
    const result = await callVideoAnalysisService("https://api.example.com", mockRequest);

    // Assert - Verify
    expect(result.success).toBe(true);
    expect(result.recipe).toEqual(mockRecipe);
  });
});
```

#### Common Pitfalls to Avoid

**1. Watch Mode in Automation**
```bash
# ❌ Causes automation to hang indefinitely
yarn test

# ✅ Proper for CI/CD and scripts
yarn test:run
```

**2. Inadequate Mock Cleanup**
```typescript
// ❌ Incomplete cleanup - causes test pollution
beforeEach(() => {
  vi.clearAllMocks();
  // Missing HTTP mock cleanup
});

// ✅ Comprehensive cleanup
beforeEach(() => {
  _nock.cleanAll();     // HTTP mocks
  vi.clearAllMocks();   // Mock history
  vi.resetAllMocks();   // Mock implementations
});
```

**3. Missing Error Scenario Testing**
```typescript
// ❌ Only testing happy path
it("should return recipe", async () => {
  const scope = nock(api).post("/analyze").reply(200, recipe);
  const result = await analyze(request);
  expect(result.success).toBe(true);
});

// ✅ Comprehensive error testing
it("should handle network failures", async () => {
  const scope = nock(api).post("/analyze").replyWithError("Network error");
  const result = await analyze(request);
  
  expect(result.success).toBe(false);
  expect(result.error).toContain("Network error");
});
```

**4. Improper Async Handling**
```typescript
// ❌ Missing proper async handling
it("should timeout", () => {
  const promise = analyze(request);
  expect(promise).rejects.toThrow(); // Not awaited properly
});

// ✅ Proper async test with fake timers
it("should handle timeouts", async () => {
  vi.useFakeTimers();
  const promise = analyze(request);
  vi.advanceTimersByTime(30000);
  
  await expect(promise).rejects.toThrow("Timeout");
  vi.useRealTimers();
});
```

**5. Over-mocking Dependencies**
```typescript
// ❌ Mocking too much functionality
vi.mock("@/utils/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    // Over-engineered mock
  },
}));

// ✅ Minimal, focused mocking
vi.mock("@/utils/logger", () => ({
  logger: {
    error: vi.fn(), // Only mock what the test needs
  },
}));
```

**6. Ignoring Environment Constraints**
```typescript
// ❌ Assuming local file system behavior
it("should save file", () => {
  expect(fs.existsSync).toBe(true); // Fails in serverless
});

// ✅ Environment-aware testing
it("should store in R2 bucket", () => {
  mockR2Bucket.put.mockResolvedValueOnce({ etag: "test-etag" });
  
  uploadVideo(videoData);
  expect(mockR2Bucket.put).toHaveBeenCalledWith(
    "test-key",
    expect.any(Object),
    { httpMetadata: { contentType: "video/mp4" } }
  );
});
```

#### Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [Nock HTTP Mocking](https://github.com/nock/nock)
- [Cloudflare Workers Testing Guide](https://developers.cloudflare.com/workers/wrangler/testing/)
- [Test Coverage Best Practices](https://kentcdodds.com/blog/how-to-know-what-to-test)

## Documentation Links

The project includes comprehensive documentation:

### Core Documentation
- [AGENTS.md](AGENTS.md) - Agent guidelines and instructions
- [CLAUDE.md](CLAUDE.md) - Claude AI integration details
- [SETUP_CHUTES_AI.md](SETUP_CHUTES_AI.md) - Chutes AI setup guide
- [PR_AGENT_CHUTES_AI_SETUP.md](PR_AGENT_CHUTES_AI_SETUP.md) - PR-Agent integration setup
- [RECIPE_COMMAND_README.md](RECIPE_COMMAND_README.md) - Recipe command documentation

### GitHub Integration
- [`.github/workflows/pr-agent.yml`](.github/workflows/pr-agent.yml) - PR-Agent GitHub Actions workflow
- [`.github/pull_request_template.md`](.github/pull_request_template.md) - Pull request template
- [`.github/ISSUE_TEMPLATE/pr_agent_integration_issue.md`](.github/ISSUE_TEMPLATE/pr_agent_integration_issue.md) - PR-Agent issue template

### Configuration Files
- [`.pr_agent.toml`](.pr_agent.toml) - PR-Agent configuration
- [`wrangler.toml`](wrangler.toml) - Cloudflare Workers configuration
- [`package.json`](package.json) - Project dependencies and scripts

## Deployment

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

4. Set up environment variables:
   ```bash
   wrangler secret put ENV_BOT_TOKEN
   wrangler secret put ENV_BOT_SECRET
   wrangler secret put WEBHOOK_SECRET
   wrangler secret put CHUTES_API_TOKEN
   wrangler secret put GEMINI_API_KEY
   ```

## Error Handling

The bot includes comprehensive error handling:
- Automatic retries for failed requests
- Telegraph viewer fallback when PDF is unavailable
- Informative error messages for users
- Debug logging for troubleshooting
- KV-based status tracking
- Webhook retry mechanisms
- Dead letter queue for failed deliveries
- Graceful degradation when services are unavailable

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
- 🎬 Asynchronous video processing with job tracking
- 📊 Webhook-based job completion notifications
- 🔄 Advanced webhook management system
- 📨 Dead letter queue for failed webhook deliveries
- 🔍 Webhook status monitoring and manual retry capabilities
- 📈 Gemini API usage statistics tracking
- 🤖 Automated code reviews with PR-Agent and Chutes AI
- 🔒 Security features with webhook authentication

## License

MIT License - See LICENSE file for details