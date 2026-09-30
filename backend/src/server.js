// ─── Crash guards: MUST be first ───
process.on('uncaughtException', (err) => {
  console.error('[FATAL — recovered] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL — recovered] Unhandled rejection:', reason);
});
// ───────────────────────────────────────────────────────────────────────────────────────────

const http = require('http');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const httpProxy = require('http-proxy');
const { app: langGraphApp, setWorkflowEventEmitter } = require('./graph/workflow');
const { runModifierAgent } = require('./agents/modifier');
const { deployToVercel } = require('./services/vercelDeploy');
const { startPreview, triggerReload, PREVIEW_PORT } = require('./services/previewServer');
const { buildTagMap, htmlVersion } = require('./services/htmlMap');
const { toFriendlyError } = require('./services/friendlyError');
const {
  PROJECT_ROOT,
  FRONTEND_DIR,
  GENERATED_SITES_DIR,
  getSiteDir,
  getSiteIndexPath,
  ENV_PATH
} = require('./config/paths');
const {
  hasSite,
  getSiteHtml,
  listSites,
  saveSite
} = require('./services/siteStore');

require('dotenv').config({ path: ENV_PATH });

const PORT = process.env.PORT || 3000;

// Workflow event bus
const workflowEvents = new EventEmitter();
workflowEvents.setMaxListeners(50);
setWorkflowEventEmitter(workflowEvents);

// Track connected SSE dashboard clients
let sseClients = [];

// Track in-flight runs per site so /api/stop can actually cancel them
const activeRuns = new Map(); // siteName -> { controller: AbortController }

// Track which stack each site was built with, so later /api/modify calls
// know what to sanitize/preserve (Tailwind CDN, React CDN, etc.)
const siteStacks = new Map(); // siteName -> stack string
function startRun(siteName) {
  stopRun(siteName, false); // cancel any stale run for this site first
  const controller = new AbortController();
  activeRuns.set(siteName, { controller });
  return controller;
}

function stopRun(siteName, notify = true) {
  const run = activeRuns.get(siteName);
  if (!run) return false;
  try { run.controller.abort(); } catch (e) {}
  activeRuns.delete(siteName);
  if (notify) broadcastToClients('workflow_stopped', { siteName });
  return true;
}

function broadcastToClients(type, payload) {
  const data = JSON.stringify({ type, data: payload, timestamp: Date.now() });
  sseClients.forEach(client => {
    try {
      client.write(`data: ${data}\n\n`);
    } catch (e) {
      // client disconnected
    }
  });
}

// Listen to workflow internal events and broadcast to dashboard
workflowEvents.on('workflow_event', (evt) => {
  broadcastToClients(evt.type, evt.data);
});

// Helper for MIME types
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// Max request body size (edited site code can be large)
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB

// Parse request body JSON helper
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large (max 5 MB).'));
        req.destroy();
        return;
      }
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const previewProxy = httpProxy.createProxyServer();

previewProxy.on('error', (err, req, res) => {
  console.error('[Preview Proxy Error]:', err.message);
  if (!res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
  }
  res.end('Preview server unavailable');
});

// Start the preview server once, when the main server boots
startPreview('boot', false);

// HTTP Server
const server = http.createServer(async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;

  // --- Reverse proxy: forward /preview/* to the internal preview server ---
  if (pathname.startsWith('/preview/') || pathname === '/preview') {
    req.url = req.url.replace(/^\/preview/, '') || '/';
    previewProxy.web(req, res, { target: `http://localhost:${PREVIEW_PORT}` });
    return;
  }

  // --- API: Real-Time SSE Stream ---
  if (pathname === '/api/stream' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write('data: {"type":"connected"}\n\n');
    sseClients.push(res);

    req.on('close', () => {
      sseClients = sseClients.filter(c => c !== res);
    });
    return;
  }

  // --- API: Trigger Website Generation ---
    // --- API: Trigger Website Generation ---
  if (pathname === '/api/generate' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const prompt = body.prompt || 'a modern landing page';
      const siteName = (body.siteName || 'site1').trim().replace(/[^a-zA-Z0-9_-]/g, '') || 'site1';
      const maxIterations = Number(body.maxIterations) || 2;
      const ALLOWED_STACKS = ['html-css-js', 'html-tailwind', 'react-cdn', 'react-tailwind-cdn'];
      const stack = ALLOWED_STACKS.includes(body.stack) ? body.stack : 'react-tailwind-cdn';
      siteStacks.set(siteName, stack);  

      // Start the preview server early so URL is immediately available
      await startPreview(siteName, false); // idempotent — already running from boot
      const previewUrl = `/preview/${siteName}/`;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'started',
        siteName,
        previewUrl,
        message: 'Generation started'
      }));

            // Launch workflow asynchronously
      const controller = startRun(siteName);
      broadcastToClients('workflow_started', { prompt, siteName, maxIterations, stack, previewUrl });

      (async () => {
        try {
          const finalState = await langGraphApp.invoke({
            prompt,
            siteName,
            maxIterations,
            stack
          }, { signal: controller.signal });

          broadcastToClients('workflow_finished', {
            siteName,
            filePath: finalState.filePath,
            scores: finalState.report?.scores || {},
            iteration: finalState.iteration,
            previewUrl
          });
        } catch (err) {
          if (controller.signal.aborted) {
            console.log(`[Workflow] Stopped by user: ${siteName}`);
          } else {
            console.error('[Workflow Error]:', err); // full raw error stays in server logs
            broadcastToClients('workflow_error', { error: toFriendlyError(err) });
          }
        } finally {
          activeRuns.delete(siteName);
        }
      })();

    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // --- API: Apply Targeted Modifications to Existing Site ---

  // --- API: Apply Targeted Modifications to Existing Site ---
    if (pathname === '/api/modify' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const siteName = (body.siteName || 'site1').trim();
      const modificationPrompt = body.modificationPrompt || body.prompt;

      if (!modificationPrompt) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Modification instructions are required.' }));
        return;
      }

      if (!hasSite(siteName)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Site "${siteName}" not found to modify.` }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'modifying',
        siteName,
        message: 'Modifications in progress'
      }));

      const controller = startRun(siteName);
      broadcastToClients('modification_started', {
        siteName,
        prompt: modificationPrompt
      });

      (async () => {
        try {
          broadcastToClients('node_start', {
            node: 'modifier',
            message: `Applying requested modifications to "${siteName}"...`
          });
          const stack = siteStacks.get(siteName) || 'react-tailwind-cdn';  
          const result = await runModifierAgent(siteName, modificationPrompt, stack, controller.signal);  
          if (controller.signal.aborted) return;

          triggerReload();

          broadcastToClients('site_reloaded', {
            message: 'Targeted modifications applied and live-reloaded!',
            siteName
          });

          broadcastToClients('modification_finished', {
            siteName,
            message: 'Modifications successfully applied!'
          });
        } catch (err) {
          if (controller.signal.aborted) {
            console.log(`[Modifier] Stopped by user: ${siteName}`);
          } else {
            console.error('[Modifier Error]:', err); // full raw error stays in server logs
            broadcastToClients('workflow_error', {
              error: toFriendlyError(err)
            });
          }
        } finally {
          activeRuns.delete(siteName);
        }
      })();

    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }


    // --- API: Stop an in-progress generation/modification ---
  if (pathname === '/api/stop' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const siteName = (body.siteName || '').trim();
      const wasRunning = stopRun(siteName);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, stopped: wasRunning }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // --- API: Deploy Site to Vercel ---
  if (pathname === '/api/deploy' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const siteName = (body.siteName || 'site1').trim().replace(/[^a-zA-Z0-9_-]/g, '') || 'site1';

      if (!hasSite(siteName)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Site "${siteName}" has not been generated yet.` }));
        return;
      }

      console.log(`[Server] Deploying "${siteName}" to Vercel...`);
      const result = await deployToVercel(siteName);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        siteName,
        url: result.url,
        deploymentId: result.deploymentId
      }));
    } catch (err) {
      console.error('[Server Deploy Error]:', err); // full raw error stays in server logs
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: toFriendlyError(err) }));
    }
    return;
  }

  // --- API: Get Site Source Code ---
  if (pathname.startsWith('/api/site/') && pathname.endsWith('/code') && req.method === 'GET') {
    const parts = pathname.split('/');
    const siteName = parts[3];
    const code = getSiteHtml(siteName);

    if (code) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ siteName, code }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Site not found or not yet generated' }));
    }
    return;
  }

  // --- API: Save Manually Edited Site Code (from the code editor) ---
  if (pathname.startsWith('/api/site/') && pathname.endsWith('/code') && req.method === 'PUT') {
    try {
      const parts = pathname.split('/');
      const siteName = decodeURIComponent(parts[3] || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
      const body = await parseBody(req);
      const code = body.code;

      if (!siteName || !hasSite(siteName)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Site "${siteName}" not found.` }));
        return;
      }

      if (typeof code !== 'string' || !code.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Code cannot be empty.' }));
        return;
      }

      // 1. Update RAM cache + temp file (the preview server reads RAM first)
      saveSite(siteName, code);

      // 2. Make sure the preview server is running. If it's already running,
      //    startPreview() triggers the live reload itself.
      await startPreview(siteName, false);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, siteName }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // --- API: Element map (positions of every tag, for click-to-code) ---
  if (pathname.startsWith('/api/site/') && pathname.endsWith('/map') && req.method === 'GET') {
    const siteName = decodeURIComponent(pathname.split('/')[3] || '');
    const html = getSiteHtml(siteName);

    if (!html) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Site not found or not yet generated' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tags: buildTagMap(html), version: htmlVersion(html) }));
    return;
  }

  // --- API: List Existing Generated Sites ---
  if (pathname === '/api/sites' && req.method === 'GET') {
    const sites = listSites();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ sites, previewPort: PREVIEW_PORT }));
    return;
  }

  // --- Static Frontend File Serving ---
  let requestedFile = pathname === '/' ? 'index.html' : pathname;
  if (requestedFile.startsWith('/')) requestedFile = requestedFile.slice(1);

  const fullStaticPath = path.join(FRONTEND_DIR, requestedFile);

  // Security check: must reside inside FRONTEND_DIR
  if (!fullStaticPath.startsWith(FRONTEND_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(fullStaticPath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': getMimeType(fullStaticPath) });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Multi-Agent AI Website Builder Dashboard Ready!`);
  console.log(`======================================================`);
  console.log(`💻 Dashboard UI:   http://localhost:${PORT}`);
  console.log(`🌐 Preview Server: http://localhost:${PREVIEW_PORT}/[siteName]/`);
  console.log(`📁 Project Root:   ${PROJECT_ROOT}`);
  console.log(`======================================================\n`);
});

module.exports = { server };
