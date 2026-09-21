const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Ephemeral Site Storage Service (Zero Local Disk Bloat)
 * 
 * Instead of storing user-generated websites inside the project repository,
 * this service maintains sites primarily in-memory (RAM) with backing in the
 * operating system's temporary directory (os.tmpdir()).
 * 
 * Benefits:
 * 1. Zero project directory pollution (git status stays 100% clean).
 * 2. Works natively across cloud container environments (Docker, Render, Railway, Vercel)
 *    where the root filesystem is read-only or ephemeral.
 * 3. Fast 0ms memory reads for preview streaming and code viewer.
 * 4. Automatic cleanup of expired sites.
 */

// Root of ephemeral temp storage — isolated in system temp directory
const EPHEMERAL_ROOT = path.join(os.tmpdir(), 'lumina-ai-sites');

// In-Memory site cache: Map<siteName, { html: string, updatedAt: number }>
const memoryCache = new Map();

// Max sites to keep in memory simultaneously (LRU eviction)
const MAX_CACHED_SITES = 25;
const MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours

// Start fresh on every server start (sites are session-only)
try {
  fs.rmSync(EPHEMERAL_ROOT, { recursive: true, force: true });
  fs.mkdirSync(EPHEMERAL_ROOT, { recursive: true });
} catch (e) {
  console.warn('[SiteStore] Failed to initialize ephemeral temp directory:', e.message);
}

function getSiteDir(siteName) {
  const safeName = (siteName || 'site1').trim().replace(/[^a-zA-Z0-9_-]/g, '') || 'site1';
  return path.join(EPHEMERAL_ROOT, safeName);
}

function getSiteIndexPath(siteName) {
  return path.join(getSiteDir(siteName), 'index.html');
}

/**
 * Save site HTML into memory and ephemeral temp directory.
 */
function saveSite(siteName, html) {
  const safeName = (siteName || 'site1').trim().replace(/[^a-zA-Z0-9_-]/g, '') || 'site1';
  
  // 1. Save in RAM
  memoryCache.set(safeName, {
    html,
    updatedAt: Date.now()
  });

  // 2. Persist to ephemeral temp directory for external tools (Playwright, Lighthouse)
  try {
    const dir = getSiteDir(safeName);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(getSiteIndexPath(safeName), html, 'utf-8');
  } catch (err) {
    console.warn(`[SiteStore] Could not write ephemeral file for "${safeName}":`, err.message);
  }

  evictOldSites();
}

/**
 * Get site HTML, preferring RAM (0ms) and falling back to ephemeral disk.
 */
function getSiteHtml(siteName) {
  const safeName = (siteName || 'site1').trim().replace(/[^a-zA-Z0-9_-]/g, '') || 'site1';

  // 1. RAM check
  if (memoryCache.has(safeName)) {
    return memoryCache.get(safeName).html;
  }

  // 2. Ephemeral disk fallback
  const indexPath = getSiteIndexPath(safeName);
  if (fs.existsSync(indexPath)) {
    try {
      const html = fs.readFileSync(indexPath, 'utf-8');
      memoryCache.set(safeName, { html, updatedAt: Date.now() });
      return html;
    } catch (e) {
      return null;
    }
  }

  return null;
}

/**
 * Check if a site exists in RAM or ephemeral storage.
 */
function hasSite(siteName) {
  const safeName = (siteName || 'site1').trim().replace(/[^a-zA-Z0-9_-]/g, '') || 'site1';
  if (memoryCache.has(safeName)) return true;
  return fs.existsSync(getSiteIndexPath(safeName));
}

/**
 * List all active sites.
 */
function listSites() {
  const names = new Set(memoryCache.keys());
  try {
    if (fs.existsSync(EPHEMERAL_ROOT)) {
      const dirs = fs.readdirSync(EPHEMERAL_ROOT);
      dirs.forEach(d => {
        if (fs.existsSync(path.join(EPHEMERAL_ROOT, d, 'index.html'))) {
          names.add(d);
        }
      });
    }
  } catch (e) {
    // Ignore read errors
  }
  return Array.from(names);
}

/**
 * Delete site from RAM and ephemeral storage.
 */
function deleteSite(siteName) {
  const safeName = (siteName || 'site1').trim().replace(/[^a-zA-Z0-9_-]/g, '') || 'site1';
  memoryCache.delete(safeName);
  try {
    const dir = getSiteDir(safeName);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (e) {
    // Ignore
  }
}

/**
 * Evict oldest sites if cache exceeds size limit or max age.
 */
function evictOldSites() {
  const now = Date.now();
  for (const [name, entry] of memoryCache.entries()) {
    if (now - entry.updatedAt > MAX_AGE_MS) {
      deleteSite(name);
    }
  }

  if (memoryCache.size > MAX_CACHED_SITES) {
    // Evict oldest
    const sorted = Array.from(memoryCache.entries()).sort((a, b) => a[1].updatedAt - b[1].updatedAt);
    const toRemove = sorted.slice(0, memoryCache.size - MAX_CACHED_SITES);
    toRemove.forEach(([name]) => deleteSite(name));
  }
}

module.exports = {
  EPHEMERAL_ROOT,
  getSiteDir,
  getSiteIndexPath,
  saveSite,
  getSiteHtml,
  hasSite,
  listSites,
  deleteSite
};

