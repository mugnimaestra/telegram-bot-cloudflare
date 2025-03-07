import type { R2Bucket } from "@cloudflare/workers-types";

export interface Env {
  ENV_BOT_TOKEN: string;
  ENV_BOT_SECRET: string;
  BUCKET: R2Bucket;
  NH_API_URL: string;
  // Environment mode
  NODE_ENV?: string;
  // RSCM environment variables
  RSCM_CONFIG?: string;
  RSCM_API_URL?: string;
  RSCM_CHECK_INTERVAL?: string;
  RSCM_SERVICES?: string;
}
