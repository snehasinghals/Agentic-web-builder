const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

function serveFolder(folderPath) {
    const server = http.createServer((req, res) => {
        const filePath = path.join(folderPath, req.url === '/' ? 'index.html' : req.url);
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('Not found');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    });

    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, () => {
            server.removeListener('error', reject);
            resolve(server);
        });
    });
}

async function auditSite(filePath) {
    const { default: lighthouse } = await import('lighthouse');

    const folderPath = path.dirname(filePath);

    let server;
    let browser;
    try {
        server = await serveFolder(folderPath);
        const port = server.address().port;

        const debugPort = 9222;
        browser = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-gpu',
                `--remote-debugging-port=${debugPort}`
            ]
        });

        const options = { logLevel: 'error', output: 'json', port: debugPort };
        const runnerResult = await lighthouse(`http://localhost:${port}`, options);

        const categories = runnerResult.lhr.categories;
        const scores = {
            performance: Math.round((categories.performance?.score || 0) * 100),
            accessibility: Math.round((categories.accessibility?.score || 0) * 100),
            bestPractices: Math.round((categories['best-practices']?.score || 0) * 100),
            seo: Math.round((categories.seo?.score || 0) * 100)
        };

        console.log('Lighthouse scores:', scores);
        return { scores, fullReport: runnerResult.lhr };
    } finally {
        if (browser) { try { await browser.close(); } catch (e) { console.warn('[Lighthouse] browser.close failed:', e.message); } }
        if (server) { try { server.close(); } catch (e) { console.warn('[Lighthouse] server.close failed:', e.message); } }
    }
}

module.exports = { auditSite };