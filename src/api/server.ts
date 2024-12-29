import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Context } from "hono";
import type { Env } from "@/types/env";

const app = new Hono<{ Bindings: Env["Bindings"] }>();

// Enable CORS
app.use("/*", cors());

// Root endpoint
app.get("/", (c: Context<{ Bindings: Env["Bindings"] }>) => {
  const baseUrl = new URL(c.req.url).origin;
  return c.json({
    status: "success",
    service: [
      {
        method: "POST",
        endpoint: "fetch_url",
        url: `${baseUrl}/fetch_url`,
        params: ["url"],
        response: ["status", "message", "content"],
      },
    ],
    message: "Welcome to Telegram Bot API",
  });
});

// Fetch URL endpoint
app.post("/fetch_url", async (c) => {
  try {
    console.log("[API] Received fetch_url request");
    const { url } = await c.req.json<{ url: string }>();

    if (!url) {
      console.log("[API] URL is missing in request");
      return c.json({ status: "failed", message: "URL is required" });
    }

    console.log("[API] Fetching URL:", url);

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        DNT: "1",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const content = await response.text();
    const title = content.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || url;

    return c.json({
      status: "success",
      message: `Successfully fetched: ${title}`,
      content,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({
      status: "failed",
      message: `Failed to fetch URL: ${message}`,
    });
  }
});

export default app;
