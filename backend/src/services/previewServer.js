const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { GENERATED_SITES_DIR, getSiteDir } = require('../config/paths');
const { injectIndexes } = require('./htmlMap');

let server = null;
let sseClients = [];
let fileWatcher = null;

const PREVIEW_PORT = 3456;

// Live reload: refreshes the preview whenever the site changes
const LIVE_RELOAD_SNIPPET = `
<!-- Live Reload (injected by preview server) -->
<script>
(function() {
  var es = new EventSource('/__sse');
  es.addEventListener('reload', function() {
    window.location.reload();
  });
  es.onerror = function() {
    setTimeout(function() {
      es = new EventSource('/__sse');
      es.addEventListener('reload', function() { window.location.reload(); });
    }, 2000);
  };
})();
</script>`;

// Element inspector: lets the dashboard pick an element by clicking it.
// Only active when the dashboard sends { type: 'lumina-inspect', on: true }.
const INSPECTOR_SNIPPET = `
<!-- Element Inspector (injected by preview server) -->
<style>
  .__lumina-hover { outline: 2px solid #6366f1 !important; outline-offset: -2px !important; cursor: crosshair !important; }
  .__lumina-selected { outline: 2px solid #10b981 !important; outline-offset: -2px !important; }
</style>
<script>
(function() {
  var on = false, hovered = null, selected = null;

  function target(el) {
    return el && el.closest ? el.closest('[data-lumina-idx]') : null;
  }

  document.addEventListener('mouseover', function(e) {
    if (!on) return;
    var t = target(e.target);
    if (hovered && hovered !== t) hovered.classList.remove('__lumina-hover');
    hovered = t;
    if (t) t.classList.add('__lumina-hover');
  }, true);

  document.addEventListener('mouseout', function(e) {
    if (!e.relatedTarget && hovered) {
      hovered.classList.remove('__lumina-hover');
      hovered = null;
    }
  }, true);

  document.addEventListener('click', function(e) {
    if (!on) return;
    var t = target(e.target);
    if (!t) return;
    e.preventDefault();
    e.stopPropagation();
    if (selected) selected.classList.remove('__lumina-selected');
    selected = t;
    t.classList.remove('__lumina-hover');
    t.classList.add('__lumina-selected');
    window.parent.postMessage({
      type: 'lumina-select',
      idx: Number(t.getAttribute('data-lumina-idx')),
      tag: t.tagName.toLowerCase()
    }, '*');
  }, true);

  window.addEventListener('message', function(e) {
    if (e.source !== window.parent || !e.data || e.data.type !== 'lumina-inspect') return;
    on = !!e.data.on;
    if (!on) {
      if (hovered) hovered.classList.remove('__lumina-hover');
      if (selected) selected.classList.remove('__lumina-selected');
      hovered = null;
      selected = null;
    }
  });
})();
</script>`;

function injectLiveReloadScript(html) {
  // Number every element (preview only — stored/deployed HTML is untouched)
  const indexed = injectIndexes(html);
  const snippets = LIVE_RELOAD_SNIPPET + INSPECTOR_SNIPPET;

  const bodyEnd = indexed.lastIndexOf('</body>');
  if (bodyEnd !== -1) {
    return indexed.slice(0, bodyEnd) + snippets + '\n' + indexed.slice(bodyEnd);
  }
  return indexed + snippets;
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

async function startPreview(siteName, autoOpenBrowser = false) {
  if (server) {
    // Already running, update file watch if needed and trigger reload
    triggerReload();
    return {
      url: `http://localhost:${PREVIEW_PORT}/${siteName}/`,
      stop: stopPreview,
      triggerReload
    };
  }

  server = http.createServer((req, res) => {
    // SSE endpoint for browser auto-reload
    if (req.url === '/__sse') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write(':ok\n\n');
      sseClients.push(res);

      req.on('close', () => {
        sseClients = sseClients.filter(c => c !== res);
      });
      return;
    }

    // CORS headers for iframe / external preview embedding
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    // Parse URL: supports /site1 or /site1/ or /site1/index.html
    let normalizedUrl = req.url.split('?')[0];
    if (normalizedUrl.startsWith('/')) normalizedUrl = normalizedUrl.slice(1);
    
    const parts = normalizedUrl.split('/').filter(Boolean);
    const { getSiteHtml } = require('../services/siteStore');
    const targetSiteName = parts.length >= 1 ? parts[0] : siteName;

    // Fast-path: serve directly from memory cache if root of site requested
    const isRootRequest = parts.length <= 1 || (parts.length === 2 && parts[1] === 'index.html');
    if (isRootRequest) {
      const inMemoryHtml = getSiteHtml(targetSiteName);
      if (inMemoryHtml) {
        const injected = injectLiveReloadScript(inMemoryHtml);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(injected);
        return;
      }
    }

    let targetFilePath;
    if (parts.length === 0) {
      targetFilePath = path.join(getSiteDir(siteName), 'index.html');
    } else if (parts.length === 1 && fs.existsSync(getSiteDir(parts[0]))) {
      targetFilePath = path.join(getSiteDir(parts[0]), 'index.html');
    } else {
      targetFilePath = path.join(GENERATED_SITES_DIR, normalizedUrl);
    }

    if (!targetFilePath.startsWith(GENERATED_SITES_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.readFile(targetFilePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Site or file not found');
        return;
      }

      const mimeType = getMimeType(targetFilePath);

      if (mimeType === 'text/html') {
        const html = data.toString('utf-8');
        const injected = injectLiveReloadScript(html);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(injected);
      } else {
        res.writeHead(200, { 'Content-Type': mimeType });
        res.end(data);
      }
    });
  });

  const url = `http://localhost:${PREVIEW_PORT}/${siteName}/`;

  await new Promise((resolve) => {
    server.listen(PREVIEW_PORT, () => resolve());
  });

  try {
    fileWatcher = fs.watch(GENERATED_SITES_DIR, { recursive: true }, (eventType, filename) => {
      if (filename && (filename.endsWith('.html') || filename.endsWith('.css') || filename.endsWith('.js'))) {
        triggerReload();
      }
    });
  } catch (e) {
    // Ignore fallback
  }

  if (autoOpenBrowser) {
    openBrowser(url);
  }

  console.log(`\n🌐 [Preview Server] Live preview running at ${url}`);

  return {
    url,
    stop: stopPreview,
    triggerReload,
  };
}

function triggerReload() {
  sseClients.forEach(client => {
    try {
      client.write('event: reload\ndata: reload\n\n');
    } catch (e) {
      // Client disconnected
    }
  });
}

async function stopPreview() {
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
  }
  sseClients.forEach(client => {
    try { client.end(); } catch (e) {}
  });
  sseClients = [];
  if (server) {
    await new Promise((resolve) => {
      server.close(() => resolve());
    });
    server = null;
  }
}

function openBrowser(url) {
  const platform = process.platform;
  let cmd;
  if (platform === 'win32') {
    cmd = `start "" "${url}"`;
  } else if (platform === 'darwin') {
    cmd = `open "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }
  exec(cmd, (err) => {
    if (err) {
      console.log(`[Preview Server] Could not auto-open browser. Please visit: ${url}`);
    }
  });
}

module.exports = { startPreview, stopPreview, triggerReload, PREVIEW_PORT };