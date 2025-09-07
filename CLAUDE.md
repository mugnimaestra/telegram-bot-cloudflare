# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Telegram bot built on Cloudflare Workers (serverless edge computing) that fetches NH content and generates PDFs with Telegraph viewer support, plus AI-powered cooking video recipe extraction.

**Stack**: TypeScript, Hono framework, Cloudflare Workers, R2 storage, KV namespace, Google Gemini AI, Chutes AI

## Development Commands

```bash
# Local development with state persistence
yarn dev

# Run tests in watch mode
yarn test

# Run tests once (recommended for agentic processes)
yarn test:run

# Generate test coverage report
yarn test:coverage

# Deploy to Cloudflare Workers
yarn deploy

# TypeScript compilation check
yarn build

# Lint TypeScript code
yarn lint

# Fix linting issues automatically
yarn lint:fix

# Format code with Prettier
yarn format

# Check code formatting
yarn format:check
```

## High-Level Architecture

### Core Components

1. **Entry Point**: `src/bot/index.ts` - Hono app handling Telegram webhooks
2. **Storage**: 
   - R2 bucket for PDF storage
   - KV namespace for state management
3. **Key Modules**:
   - `src/utils/nh/` - NH content fetching and processing
   - `src/utils/pdf/` - PDF generation with WASM-based image conversion
   - `src/utils/telegraph/` - Telegraph page creation
   - `src/utils/telegram/` - Telegram API utilities
   - `src/utils/video/` - Video analysis and recipe extraction using AI models

### Bot Commands

- `/nh <id>` - Fetch content and generate PDF/Telegraph
- `/read <id_or_url>` - Telegraph viewer only  
- `/getpdf <id_or_url>` - PDF generation only
- `/recipe` - Start cooking video analysis mode
- `/help`, `/start` - Show help message
- `/ping` - Health check
- Video uploads - Direct video analysis for recipe extraction (up to 20MB)


### Key Implementation Details

1. **Webhook Architecture**: Uses secret token authentication at `POST /endpoint`
2. **Async Processing**: Long-running tasks use `executionCtx.waitUntil()`
3. **Error Handling**: Comprehensive error handling with Telegraph fallback when PDF fails
4. **Progress Tracking**: Real-time updates during PDF generation
5. **WASM Support**: WebAssembly modules for WEBP to PNG conversion
6. **Rate Limiting**: Status checks limited to 10 per gallery
7. **AI Integration**: 
   - Google Gemini AI for advanced video analysis
   - Chutes AI visual models for cooking video recipe extraction
   - Webhook-based async processing for long video analysis tasks
   - Retry mechanisms and delivery status tracking
8. **Video Processing**: R2 storage for video files with intelligent size handling

### Environment Configuration

Managed via `wrangler.toml`:
- Bot credentials (`ENV_BOT_TOKEN`, `ENV_BOT_SECRET`)
- R2 bucket and KV namespace bindings
- API endpoints configuration (`NH_API_URL`, `VIDEO_ANALYSIS_SERVICE_URL`)
- AI service tokens (`CHUTES_API_TOKEN`, Google Gemini integration)
- Node.js compatibility mode enabled

### Testing Strategy

This project employs a comprehensive testing strategy using Vitest with specialized considerations for agentic processes and serverless environments.

#### Test Organization and Structure

The project follows a consistent test organization pattern:

```
src/
├── utils/
│   ├── video/
│   │   ├── analyzeVideo.ts
│   │   └── analyzeVideo.test.ts  # Co-located test file
│   ├── nh/
│   │   ├── fetchNHData.ts
│   │   └── fetchNHData.test.ts   # Co-located test file
│   └── test/                     # Shared testing utilities
│       ├── mockR2Bucket.ts       # R2 bucket mocking utilities
│       └── nock.ts              # Enhanced HTTP mocking with logging
```

**Key Principles:**
- **Co-located tests**: Test files are placed alongside their source files with `.test.ts` suffix
- **Shared utilities**: Common testing utilities are centralized in `src/utils/test/`
- **Environment-specific mocking**: Specialized mocks for Cloudflare Workers (R2, KV, etc.)
- **Integration testing**: Tests verify both unit functionality and integration patterns

#### Testing Utilities Available

The project provides several specialized testing utilities:

##### [`mockR2Bucket`](src/utils/test/mockR2Bucket.ts:1)
```typescript
import { mockR2Bucket } from "@/utils/test/mockR2Bucket";

// Provides a complete mock of Cloudflare R2Bucket interface
// Mocks all R2 operations: head, get, put, delete, list, etc.
```

**Usage Example:**
```typescript
import { mockR2Bucket } from "@/utils/test/mockR2Bucket";

// Mock R2 operations in your tests
mockR2Bucket.get.mockResolvedValueOnce({
  body: "test content",
  size: 12,
  etag: "test-etag",
});
```

##### Enhanced [`nock`](src/utils/test/nock.ts:1) Utilities
```typescript
import nock from "@/utils/test/nock";
import { cleanAll } from "@/utils/test/nock";
```

**Features:**
- **Automatic CORS handling**: Pre-configured CORS headers for all mock responses
- **Diagnostic logging**: Built-in logging for intercepted requests and responses
- **No-match debugging**: Detailed logging when requests don't match expected mocks
- **Clean management**: Centralized cleanup with `cleanAll()`

**Usage Example:**
```typescript
import nock from "@/utils/test/nock";

// Create a scoped mock with automatic CORS
const scope = nock("https://api.example.com")
  .get("/users")
  .reply(200, { users: [] });

// Mock with specific headers and body validation
const scope = nock("https://api.example.com")
  .post("/analyze", {
    video_url: "https://test.r2.dev/videos/test.mp4"
  })
  .matchHeader("content-type", "application/json")
  .matchHeader("user-agent", "TelegramBot/1.0")
  .reply(200, { success: true });
```

#### Coverage Reporting and Interpretation

The project uses V8 coverage provider with multiple output formats:

**Configuration:** ([`vitest.config.ts:21-33`](vitest.config.ts:21))
```typescript
coverage: {
  provider: "v8",
  reporter: ["text", "json", "html"],
  exclude: [
    "node_modules/**",
    "dist/**",
    ".wrangler/**",
    "coverage/**",
    "**/*.d.ts",
    "**/*.test.ts",
    "**/*.config.ts",
  ],
}
```

**Coverage Reports:**
- **Text**: Console output for quick checks
- **JSON**: Machine-readable for CI/CD integration
- **HTML**: Detailed interactive report in `coverage/index.html`

**Interpretation Guidelines:**
- **Target**: Maintain >80% coverage for critical paths
- **Focus Areas**: Prioritize coverage for business logic and error handling
- **Exclusions**: Configuration files, type definitions, and test files are excluded
- **Branch Coverage**: Pay attention to conditional logic and error paths

#### CI/CD Integration Considerations

**Critical for Agentic Processes:**
```bash
# ❌ Avoid this in agentic processes - runs in watch mode and never exits
yarn test

# ✅ Use this instead - runs tests once and exits cleanly
yarn test:run

# ✅ Or add --run flag directly to any vitest command
vitest --run
```

**Why this matters:**
- The default `yarn test` command runs vitest in watch mode, which monitors file changes and never exits
- Agentic processes can get stuck waiting for the test process to terminate
- The `--run` flag ensures tests run exactly once and exit with the appropriate status code
- This is critical for automation scripts, CI/CD pipelines, and any process that needs to continue after tests complete

**CI/CD Pipeline Recommendations:**
```yaml
# Example GitHub Actions workflow
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: yarn install
      - run: yarn test:run          # Always use --run for CI
      - run: yarn test:coverage     # Generate coverage report
      - uses: codecov/codecov-action@v3  # Upload coverage
```

#### Performance Testing Recommendations

**Test Performance Optimization:**
1. **Mock External Dependencies**: Use nock for HTTP requests to avoid network latency
2. **Isolate Tests**: Use `beforeEach` and `afterEach` to prevent test pollution
3. **Parallel Execution**: Vitest runs tests in parallel by default - structure tests accordingly
4. **Memory Management**: Clean up mocks and stubs after each test

```typescript
// Performance-optimized test structure
describe("VideoAnalysisService", () => {
  beforeEach(() => {
    _nock.cleanAll();          // Clean HTTP mocks
    vi.clearAllMocks();        // Clear all mock calls
    vi.useFakeTimers();        // Mock timers for async operations
  });

  afterEach(() => {
    _nock.cleanAll();          // Ensure cleanup
    vi.useRealTimers();        // Restore real timers
  });

  it("should handle timeouts gracefully", async () => {
    // Timer-based test without actual delays
    const promise = callVideoAnalysisService(serviceUrl, request);
    vi.advanceTimersByTime(30000); // Fast-forward 30 seconds
    
    await expect(promise).rejects.toThrow("Timeout");
  });
});
```

#### Debugging Tests in Agentic Environments

**Common Debugging Techniques:**

1. **Verbose Logging**: Enable debug output for test utilities
```typescript
// The nock utility includes built-in debug logging
// Enable debug logging in your test setup
import { logger } from "@/utils/logger";

// Mock logger to capture debug output
vi.mock("@/utils/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));
```

2. **Isolate Failing Tests**: Run specific tests with pattern matching
```bash
# Run specific test file
yarn test:run videoAnalysis.test.ts

# Run tests matching a pattern
yarn test:run --grep "should handle timeouts"
```

3. **Inspect Mock Calls**: Use vitest's mock inspection utilities
```typescript
// Inspect mock calls and arguments
expect(mockedLogger.error).toHaveBeenCalledWith(
  "Failed to call video analysis service",
  expect.objectContaining({
    error: expect.stringContaining("Network error"),
    serviceUrl: expect.any(String),
  })
);
```

4. **Breakpoint Debugging**: Use Node.js debugging with VS Code
```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Current Test File",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/vitest/vitest.mjs",
      "args": ["run", "${relativeFile}"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

#### Best Practices for Writing Maintainable Tests

**Test Structure Guidelines:**
1. **Arrange-Act-Assert Pattern**: Clear separation of setup, execution, and verification
2. **Descriptive Test Names**: Use `should` or `it` to describe expected behavior
3. **Test Independence**: Each test should be runnable in isolation
4. **Minimal Mocking**: Mock only what's necessary for the test

**Example Maintainable Test:**
```typescript
describe("callVideoAnalysisService", () => {
  const serviceUrl = "https://test-video-service.com";
  const mockRequest: VideoAnalysisRequest = {
    videoUrl: "https://test.r2.dev/videos/test.mp4",
    userId: 123,
    chatId: 456,
  };

  beforeEach(() => {
    _nock.cleanAll();
    vi.clearAllMocks();
  });

  afterEach(() => {
    _nock.cleanAll();
  });

  it("should successfully call video analysis service", async () => {
    // Arrange - Setup mocks and test data
    const mockRecipe = { title: "Test Recipe", /* ... */ };
    const scope = nock(serviceUrl)
      .post("/analyze")
      .matchHeader("content-type", "application/json")
      .reply(200, { success: true, recipe: mockRecipe });

    // Act - Execute the function being tested
    const result = await callVideoAnalysisService(serviceUrl, mockRequest);

    // Assert - Verify the results
    expect(result.success).toBe(true);
    expect(result.recipe).toEqual(mockRecipe);
  });
});
```

**Error Testing Best Practices:**
- Test both success and failure paths
- Verify error messages are appropriate
- Test edge cases and boundary conditions
- Ensure proper cleanup after error scenarios

#### Common Pitfalls to Avoid When Testing in Agentic Processes

**1. Watch Mode in CI/CD**
```typescript
// ❌ Never use this in automated processes
yarn test  // Runs in watch mode, never exits

// ✅ Always use --run flag in CI/CD and agentic processes
yarn test:run
vitest --run
```

**2. Inadequate Mock Cleanup**
```typescript
// ❌ Forgetting to clean up mocks
beforeEach(() => {
  vi.clearAllMocks();
  // Missing _nock.cleanAll() - can cause test pollution
});

// ✅ Comprehensive cleanup
beforeEach(() => {
  _nock.cleanAll();    // Clean HTTP mocks
  vi.clearAllMocks();  // Clear mock call history
  vi.resetAllMocks();  // Reset mock implementations
});

afterEach(() => {
  _nock.cleanAll();    // Ensure cleanup after test
});
```

**3. Missing Error Handling Tests**
```typescript
// ❌ Only testing happy path
it("should return recipe", async () => {
  const scope = nock(serviceUrl).post("/analyze").reply(200, mockRecipe);
  const result = await callVideoAnalysisService(serviceUrl, request);
  expect(result.success).toBe(true);
});

// ✅ Testing comprehensive error scenarios
it("should handle network errors", async () => {
  const scope = nock(serviceUrl)
    .post("/analyze")
    .replyWithError("Network error");
  
  const result = await callVideoAnalysisService(serviceUrl, request);
  
  expect(result.success).toBe(false);
  expect(result.error).toContain("Network error");
  expect(mockedLogger.error).toHaveBeenCalled();
});
```

**4. Ignoring Asynchronous Behavior**
```typescript
// ❌ Not handling async operations properly
it("should handle timeouts", () => {
  const promise = callVideoAnalysisService(serviceUrl, request);
  // Missing proper async handling
  expect(promise).rejects.toThrow("Timeout");
});

// ✅ Proper async test with fake timers
it("should handle timeouts gracefully", async () => {
  vi.useFakeTimers();
  
  const promise = callVideoAnalysisService(serviceUrl, request);
  vi.advanceTimersByTime(30000); // Fast-forward timeout
  
  await expect(promise).rejects.toThrow("Timeout");
  vi.useRealTimers(); // Clean up
});
```

**5. Over-mocking External Dependencies**
```typescript
// ❌ Mocking too much, hiding real bugs
vi.mock("@/utils/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    // Over-mocked implementation
  },
}));

// ✅ Minimal, focused mocking
vi.mock("@/utils/logger", () => ({
  logger: {
    error: vi.fn(),  // Only mock what the test needs
  },
}));
```

**6. Ignoring Environment-Specific Behavior**
```typescript
// ❌ Tests that don't account for serverless environment
it("should store file in R2", async () => {
  // Test assumes local file system behavior
  expect(fs.existsSync).toBe(true);
});

// ✅ Environment-aware testing
it("should store file in R2 bucket", async () => {
  // Test uses mockR2Bucket that mimics Cloudflare Workers behavior
  mockR2Bucket.put.mockResolvedValueOnce({
    etag: "test-etag",
    key: "test-key",
  });
  
  await uploadVideoToR2(videoData);
  expect(mockR2Bucket.put).toHaveBeenCalledWith(
    "test-key",
    expect.any(Object),
    { httpMetadata: { contentType: "video/mp4" } }
  );
});
```

### Important Note for Agentic Processes

When running tests in agentic processes (like CI/CD pipelines, automated scripts, or AI assistants), **always use the `--run` flag** with vitest commands to prevent watch mode issues:

```bash
# ❌ Avoid this in agentic processes - runs in watch mode and never exits
yarn test

# ✅ Use this instead - runs tests once and exits cleanly
yarn test:run

# ✅ Or add --run flag directly to any vitest command
vitest --run
```

**Why this matters:**
- The default `yarn test` command runs vitest in watch mode, which monitors file changes and never exits
- Agentic processes can get stuck waiting for the test process to terminate
- The `--run` flag ensures tests run exactly once and exit with the appropriate status code
- This is critical for automation scripts, CI/CD pipelines, and any process that needs to continue after tests complete