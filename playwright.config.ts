import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './test/browser',
    testMatch: '**/*.pw.ts',
    timeout: 120_000,
    expect: { timeout: 8_000 },
    fullyParallel: false,
    workers: 1,
    reporter: 'line',
    use: {
        baseURL: 'http://127.0.0.1:3000',
        browserName: 'chromium',
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
    },
    projects: [
        {
            name: 'desktop',
            use: { viewport: { width: 1280, height: 720 } },
        },
        {
            name: 'narrow',
            use: {
                ...devices['iPhone 13'],
                viewport: { width: 390, height: 844 },
            },
        },
    ],
    webServer: {
        command: 'EXTENSIONS= bun run dev',
        url: 'http://127.0.0.1:3000',
        timeout: 120_000,
        reuseExistingServer: true,
        stdout: 'pipe',
        stderr: 'pipe',
    },
});
