import { defineConfig } from "@playwright/test"
import { PORTS } from "@/config/ports"

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  retries: 1,
  use: {
    baseURL: process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${PORTS.app}`,
    headless: true,
  },
  webServer: {
    command: "pnpm dev",
    url: process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${PORTS.app}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
