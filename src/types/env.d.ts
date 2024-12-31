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
  };
}

export type ExecutionContext = {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
};
