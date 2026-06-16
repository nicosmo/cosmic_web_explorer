// tests/smoke.spec.js
// Smoke test: verifies the app loads, Babel transforms successfully,
// React mounts into #root, and no fatal startup errors occur.

const { test, expect } = require('@playwright/test');

test('app mounts without fatal errors', async ({ page }) => {
    const fatalErrors = [];

    // Capture any uncaught page-level errors (e.g. Babel transform failures)
    page.on('pageerror', (err) => {
        fatalErrors.push(err.message);
    });

    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

    // Babel transforms the inline script after DOMContentLoaded, so allow
    // up to 10 seconds for React to mount.
    await page.waitForFunction(
        () => {
            const root = document.getElementById('root');
            return root && root.childElementCount > 0;
        },
        { timeout: 10000 }
    );

    // Assert #root has actual content (not just the Loading placeholder)
    const rootChildren = await page.locator('#root').evaluate(el => el.childElementCount);
    expect(rootChildren).toBeGreaterThan(0);

    // Assert no fatal startup errors occurred
    const blocking = fatalErrors.filter(msg =>
        msg.includes('Cannot use import statement') ||
        msg.includes('is not defined') ||
        msg.includes('Failed to execute') ||
        msg.includes('SyntaxError')
    );
    expect(blocking, `Fatal startup errors: ${blocking.join(' | ')}`).toHaveLength(0);
});
