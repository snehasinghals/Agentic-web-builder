const lighthouse = require('lighthouse').default || require('lighthouse');
const chromeLauncher = require('chrome-launcher');
const http = require('http');
const fs = require('fs');
const path = require('path');

function serveFolder(folderPath, port) {
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
    return new Promise((resolve) => {
        server.listen(port, () => resolve(server));
    });
}

async function auditSite(filePath) {
    const folderPath = path.dirname(filePath);
    const port = 5051;

    const server = await serveFolder(folderPath, port);
    const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });

    try {
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
        await chrome.kill();
        server.close();
    }
}

module.exports = { auditSite };

