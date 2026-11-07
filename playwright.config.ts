import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1, // one shared server; a crashing test must not race the others
  retries: 0,
  forbidOnly: true,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm start",
    url: `http://localhost:${PORT}/api/stats`,
    env: { PORT: String(PORT), APP_DB_FAKE: "1" }, // reseñas de prueba en memoria, sin datos personales
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
