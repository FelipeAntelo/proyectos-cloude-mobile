import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations");
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            SETUP_CODE: "test-setup-code-123456",
            APP_ENV: "test",
          },
        },
      }),
    ],
    test: { include: ["test/**/*.test.ts"] },
  };
});
