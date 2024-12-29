import type { Browser } from "@cloudflare/puppeteer";

export interface Env {
  Bindings: {
    ENV_BOT_TOKEN: string;
    ENV_BOT_SECRET: string;
    NAMESPACE: KVNamespace;
    BROWSER: Browser;
  };
}

export type ExecutionContext = {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
};
