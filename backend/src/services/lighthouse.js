const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const chromeLauncher = require('chrome-launcher');


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
    let chrome;
    try {
        server = await serveFolder(folderPath);
        const port = server.address().port;

        let chromePath;
        try {
            chromePath = chromium.executablePath();
        } catch (e) {
            // fallback to default detected Chrome
        }

        chrome = await chromeLauncher.launch({
            chromePath,
            chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu']
            
        });

        const options = { logLevel: 'error', output: 'json', port: chrome.port };
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
        if (chrome) { try { await chrome.kill(); } catch (e) { console.warn('[Lighthouse] chrome.kill failed:', e.message); } }
        if (server) { try { server.close(); } catch (e) { console.warn('[Lighthouse] server.close failed:', e.message); } }
    }
}

module.exports = { auditSite };