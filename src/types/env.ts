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
}
