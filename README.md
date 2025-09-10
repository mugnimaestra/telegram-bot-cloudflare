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
- 🤖 Automated code reviews with PR-Agent and Chutes AI
- 📝 AI-powered pull request descriptions and improvements

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