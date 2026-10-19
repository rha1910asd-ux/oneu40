import { defineConfig } from "@playwright/test";

// 이 저장소에는 Vite 소스가 아니라 이미 빌드된 결과물(index.html + assets/)이
// 올라와 있다. 그래서 따로 빌드하지 않고, 저장소 루트를 그대로 outDir로 삼아
// vite preview(포트 4173)로 띄운다.
const PORT = 4173;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    locale: "ko-KR",
    // sw.js가 이전 실행의 자산을 캐시해서 결과가 흔들리지 않도록 막는다.
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npx vite preview --outDir . --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
