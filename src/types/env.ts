import type { R2Bucket, KVNamespace } from "@cloudflare/workers-types";

export interface Env {
  ENV_BOT_TOKEN: string;
  ENV_BOT_SECRET: string;
  BUCKET: R2Bucket;
  NH_API_URL: string;
  // Environment mode
  NODE_ENV?: string;
  // KV namespace for caching
  NAMESPACE?: KVNamespace;
  // Google Gemini API key for video analysis
  GEMINI_API_KEY: string;
  // Chutes API token for video analysis service
  CHUTES_API_TOKEN: string;
  // R2 bucket configuration
  R2_BUCKET_NAME: string;
  R2_PUBLIC_URL: string;
  // Video analysis service URL
  VIDEO_ANALYSIS_SERVICE_URL: string;
  // Webhook secret for video analysis job completion notifications
  WEBHOOK_SECRET: string;
  // Userbot configuration
  USERBOT_ENABLED?: string; // "true" to enable userbot functionality
  USERBOT_API_ID?: string; // Telegram API ID for userbot
  USERBOT_API_HASH?: string; // Telegram API Hash for userbot
  USERBOT_BOT_TOKEN?: string; // Bot token for userbot (bot mode)
  USERBOT_AUTH_MODE?: string; // Authentication mode: "bot" or "user"
  TELEGRAM_PHONE_NUMBER?: string; // Phone number for user mode
  TELEGRAM_PASSWORD?: string; // Password for 2FA in user mode
}
