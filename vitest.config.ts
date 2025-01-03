import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "happy-dom",
    environmentOptions: {
      happyDOM: {
        settings: {
          disableJavaScriptEvaluation: false,
          disableJavaScriptFileLoading: false,
          disableCSSFileLoading: true,
          enableFileSystemHttpRequests: true,
          navigator: {
            userAgent: "vitest",
          },
        },
      },
    },
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
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
