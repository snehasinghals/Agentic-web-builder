const { chromium } = require('playwright');
const path = require('path');

async function verifySite(filePath) {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    const consoleErrors = [];
    const pageErrors = [];

    page.on('console', msg => {
        if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
        }
    });

    page.on('pageerror', err => {
        pageErrors.push(err.message);
    });

    const fileUrl = 'file://' + path.resolve(filePath).replace(/\\/g, '/');
    await page.goto(fileUrl, { waitUntil: 'load' });

    const title = await page.title();
    await browser.close();

    console.log(`[Playwright] Verified page loads in-memory. Title: "${title}". Errors: ${pageErrors.length}`);
    return {
        title,
        pageErrors,
        consoleErrors
    };
}

module.exports = { verifySite };

