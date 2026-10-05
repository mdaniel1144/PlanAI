import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:4187",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    launchOptions: {
      ...(process.env.CHROMIUM_PATH
        ? { executablePath: process.env.CHROMIUM_PATH }
        : {}),
      args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
    },
  },
  webServer: {
    command: "tsx tests/e2e/server.ts",
    url: "http://127.0.0.1:4187/__e2e/ready",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
