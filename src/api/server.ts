import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Context } from "hono";
import type { Env } from "@/types/env";

const app = new Hono<{ Bindings: Env["Bindings"] }>();

// Enable CORS
app.use("/*", cors());

// Root endpoint
app.get("/", (c: Context<{ Bindings: Env["Bindings"] }>) => {
  return c.json({
    status: "success",
    service: "UMP9 Bot API",
    version: "1.1.0",
    description:
      "Telegram bot API for NH content with PDF generation and Telegraph viewer",
    endpoints: [
      {
        path: "/endpoint",
        method: "POST",
        description: "Telegram bot webhook endpoint",
        auth: "Requires X-Telegram-Bot-Api-Secret-Token header",
      },
      {
        path: "/registerWebhook",
        method: "GET",
        description: "Register bot webhook URL",
      },
      {
        path: "/unRegisterWebhook",
        method: "GET",
        description: "Unregister bot webhook URL",
      },
    ],
  });
});

export default app;
