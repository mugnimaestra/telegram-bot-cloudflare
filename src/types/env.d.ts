import type { Browser } from "@cloudflare/puppeteer";

export interface Env {
  Bindings: {
    ENV_BOT_TOKEN: string;
    ENV_BOT_SECRET: string;
    NAMESPACE: KVNamespace;
    BROWSER: Browser;
    CF_ACCOUNT_ID: string;
    R2_ACCESS_KEY_ID: string;
    R2_SECRET_ACCESS_KEY: string;
    R2_BUCKET_NAME: string;
    R2_PUBLIC_URL: string;
    BUCKET: R2Bucket;
    NH_API_URL: string;
    // Google Gemini API for video analysis
    GEMINI_API_KEY: string;
    // Task completed: Added GEMINI_API_KEY to environment types at 2025-01-04T10:30:00.000Z UTC
  };
}

export type ExecutionContext = {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
};
