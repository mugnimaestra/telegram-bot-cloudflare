# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Telegram bot built on Cloudflare Workers (serverless edge computing) that fetches NH content and generates PDFs with Telegraph viewer support. The bot also includes RSCM appointment checking functionality.

**Stack**: TypeScript, Hono framework, Cloudflare Workers, R2 storage, KV namespace

## Development Commands

```bash
# Local development with state persistence
yarn dev

# Run tests in watch mode
yarn test

# Generate test coverage report
yarn test:coverage

# Deploy to Cloudflare Workers
yarn deploy

# TypeScript compilation check
yarn build
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
   - `src/utils/rscm/` - RSCM appointment checking

### Bot Commands

- `/nh <id>` - Fetch content and generate PDF/Telegraph
- `/read <id_or_url>` - Telegraph viewer only
- `/getpdf <id_or_url>` - PDF generation only
- `/rscm <service>` - Check RSCM appointments
- `/help`, `/start` - Show help message
- `/ping` - Health check


### Key Implementation Details

1. **Webhook Architecture**: Uses secret token authentication at `POST /endpoint`
2. **Async Processing**: Long-running tasks use `executionCtx.waitUntil()`
3. **Error Handling**: Comprehensive error handling with Telegraph fallback when PDF fails
4. **Progress Tracking**: Real-time updates during PDF generation
5. **WASM Support**: WebAssembly modules for WEBP to PNG conversion
6. **Rate Limiting**: Status checks limited to 10 per gallery

### Environment Configuration

Managed via `wrangler.toml`:
- Bot credentials (`ENV_BOT_TOKEN`, `ENV_BOT_SECRET`)
- R2 bucket and KV namespace bindings
- API endpoints configuration
- Node.js compatibility mode enabled

### Testing Strategy

- Unit tests with Vitest
- HTTP mocking with Nock
- Happy DOM environment for DOM operations
- Coverage reporting with V8