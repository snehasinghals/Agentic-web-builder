const { chromium } = require('playwright');
const path = require('path');

async function verifySite(filePath, { retries = 2 } = {}) {
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

    // Tell our safety-net script to stay OFF, so we can see the real bugs
    await page.addInitScript(() => { window.__SKIP_SAFETY_NET__ = true; });

    const fileUrl = 'file://' + path.resolve(filePath).replace(/\\/g, '/');

    let lastErr;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await page.goto(fileUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
            // wait for React/Babel to render at least one section
            await page.waitForSelector('section', { timeout: 8000 }).catch(() => {});
            await page.waitForTimeout(2000);
            lastErr = null;
            break;
        } catch (err) {
            lastErr = err;
            console.warn(`[Playwright] Attempt ${attempt}/${retries} failed: ${err.message}`);
        }
    }

    if (lastErr) {
        await browser.close();
        throw lastErr;
    }

    // ---- VISIBILITY CHECK ----
    let visibilityIssues = [];
    try {
        visibilityIssues = await page.evaluate(() => {
            const out = [];
            const parse = c => (c.match(/[\d.]+/g) || [0, 0, 0, 0]).map(Number);
            const lum = ([r, g, b]) => [r, g, b]
                .map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
                .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
            const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

            function bgOf(el) {
                while (el) {
                    const s = getComputedStyle(el);
                    if (s.backgroundImage !== 'none') return null; // gradient/image: skip
                    const c = parse(s.backgroundColor);
                    if ((c[3] ?? 1) > 0.05) return c;
                    el = el.parentElement;
                }
                return [255, 255, 255, 1]; // page default = white
            }

            document.querySelectorAll('section').forEach(sec => {
                const name = (sec.className || sec.id || 'section').toString().slice(0, 40);

                if (getComputedStyle(sec).opacity === '0') {
                    out.push({ locatorId: `${name}::section`, message: `Section "${name}" has opacity 0 (hidden)` });
                }

                sec.querySelectorAll('h1,h2,h3,h4,p,span,li,a,button,div').forEach(el => {
                    // only elements that directly hold text
                    if (el.children.length !== 0) return;
                    const txt = (el.innerText || '').trim();
                    if (!txt) return;
                    // skip elements that are not displayed (e.g. closed FAQ answers)
                    if (!el.getClientRects().length) return;
                    // skip hover-only overlays
                    if (el.closest('[class*="group-hover"], [class*="hover:"]')) return;

                    const st = getComputedStyle(el);

                                        const tag = el.tagName.toLowerCase();
                    const locatorId = `${name}::${tag}::${txt.slice(0, 40)}`;

                    // 1) text hidden with opacity / visibility
                    if (st.opacity === '0' || st.visibility === 'hidden') {
                        out.push({
                            locatorId,
                            message: `Text "${txt.slice(0, 30)}" in section "${name}" is hidden (opacity 0 or visibility hidden)`
                        });
                        return;
                    }

                    // 2) text color too close to background color
                    const bg = bgOf(el);
                    if (!bg) return;
                    const fg = parse(st.color);
                    if (ratio(lum(fg), lum(bg)) < 3) {
                        out.push({
                            locatorId,
                            message: `Text "${txt.slice(0, 30)}" in section "${name}" is unreadable (text ${st.color} on background rgb(${bg[0]},${bg[1]},${bg[2]}))`
                        });
                    }
                });
            });

            const seen = new Set();
            return out.filter(o => {
                if (seen.has(o.locatorId)) return false;
                seen.add(o.locatorId);
                return true;
            }).slice(0, 6);
        });
    } catch (err) {
        console.warn('[Playwright] Visibility check failed:', err.message);
    }

    const title = await page.title();
    await browser.close();

    console.log(`[Playwright] Verified page loads in-memory. Title: "${title}". Errors: ${pageErrors.length}. Visibility issues: ${visibilityIssues.length}`);
    return {
        title,
        pageErrors,
        consoleErrors,
        visibilityIssues
    };
}
module.exports = { verifySite };