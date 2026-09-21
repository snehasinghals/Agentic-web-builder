const path = require('path');
const os = require('os');

// Root of the entire repository (ai-website-builder)
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const FRONTEND_DIR = path.join(PROJECT_ROOT, 'frontend');
const ENV_PATH = path.join(PROJECT_ROOT, '.env');

// Ephemeral Sites Directory in OS temp (Zero project disk bloat)
const GENERATED_SITES_DIR = path.join(os.tmpdir(), 'lumina-ai-sites');

function getSiteDir(siteName) {
  const safeName = (siteName || 'site1').trim().replace(/[^a-zA-Z0-9_-]/g, '') || 'site1';
  return path.join(GENERATED_SITES_DIR, safeName);
}

function getSiteIndexPath(siteName) {
  return path.join(getSiteDir(siteName), 'index.html');
}

module.exports = {
  PROJECT_ROOT,
  GENERATED_SITES_DIR,
  FRONTEND_DIR,
  ENV_PATH,
  getSiteDir,
  getSiteIndexPath
};
