const https = require('https');
const crypto = require('crypto');
const fs = require('fs');

require('dotenv').config({ path: require('../config/paths').ENV_PATH });

/**
 * Make an HTTPS request to Vercel API.
 * Returns a promise that resolves with { statusCode, data }.
 */
function vercelRequest(method, path, body, token, contentType = 'application/json', extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const isJSON = contentType === 'application/json';
    const payload = isJSON && body ? JSON.stringify(body) : body;

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': contentType,
      ...extraHeaders
    };

    if (payload) {
      headers['Content-Length'] = Buffer.isBuffer(payload) ? payload.length : Buffer.byteLength(payload);
    }

    const options = {
      hostname: 'api.vercel.com',
      path,
      method,
      headers
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ statusCode: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error('Vercel API request timed out'));
    });

    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Upload a file to Vercel's file storage.
 * @param {Buffer} content - Raw file content
 * @param {string} token - Vercel access token
 * @returns {Promise<{sha: string, size: number}>}
 */
async function uploadFile(content, token) {
  const sha = crypto.createHash('sha1').update(content).digest('hex');
  const size = content.length;

  console.log(`[Vercel Deploy] Uploading file (${size} bytes, SHA: ${sha.slice(0, 12)}...)...`);

  const result = await vercelRequest('POST', '/v2/files', content, token, 'application/octet-stream', {
    'x-vercel-digest': sha
  });

  if (result.statusCode !== 200) {
    throw new Error(`File upload failed (HTTP ${result.statusCode}): ${JSON.stringify(result.data)}`);
  }

  console.log(`[Vercel Deploy] File uploaded successfully.`);
  return { sha, size };
}

/**
 * Create a deployment on Vercel with previously uploaded files.
 * @param {string} projectName - Project/site name
 * @param {string} sha - SHA1 of the uploaded file
 * @param {number} size - File size in bytes
 * @param {string} token - Vercel access token
 * @returns {Promise<{id: string, url: string, readyState: string}>}
 */
async function createDeployment(projectName, sha, size, token) {
  console.log(`[Vercel Deploy] Creating deployment for "${projectName}"...`);

  const deployPayload = {
    name: projectName,
    files: [
      {
        file: 'index.html',
        sha,
        size
      }
    ],
    projectSettings: {
      framework: null
    },
    target: 'production'
  };

  const result = await vercelRequest('POST', '/v13/deployments', deployPayload, token);

  if (result.statusCode !== 200 && result.statusCode !== 201) {
    const errMsg = result.data?.error?.message || JSON.stringify(result.data);
    throw new Error(`Deployment creation failed (HTTP ${result.statusCode}): ${errMsg}`);
  }

  const { id, url, readyState } = result.data;
  console.log(`[Vercel Deploy] Deployment created: id=${id}, url=https://${url}, state=${readyState}`);

  return { id, url: `https://${url}`, readyState };
}

/**
 * Poll deployment status until it's READY or ERROR.
 * @param {string} deploymentId
 * @param {string} token
 * @returns {Promise<{url: string, readyState: string}>}
 */
async function waitForReady(deploymentId, token) {
  const maxAttempts = 30;
  const pollInterval = 2000;

  for (let i = 0; i < maxAttempts; i++) {
    const result = await vercelRequest('GET', `/v13/deployments/${deploymentId}`, null, token);

    if (result.statusCode !== 200) {
      throw new Error(`Failed to check deployment status: HTTP ${result.statusCode}`);
    }

    const { readyState, url } = result.data;
    console.log(`[Vercel Deploy] Status poll ${i + 1}/${maxAttempts}: ${readyState}`);

    if (readyState === 'READY') {
      return { url: `https://${url}`, readyState };
    }

    if (readyState === 'ERROR' || readyState === 'CANCELED') {
      throw new Error(`Deployment failed with state: ${readyState}`);
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Deployment timed out waiting for READY state');
}

/**
 * Full deployment flow: read HTML from memory/temp storage → upload → deploy → wait for ready.
 * @param {string} siteName - Name of the generated site folder
 * @returns {Promise<{url: string, deploymentId: string}>}
 */
async function deployToVercel(siteName) {
  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    throw new Error(
      'VERCEL_TOKEN not found in .env file. ' +
      'Create a token at https://vercel.com/account/tokens and add VERCEL_TOKEN=your_token to .env'
    );
  }

  // Use siteStore's paths (temp storage) — this is where sites are actually saved
  const { getSiteHtml, getSiteIndexPath: getStoredIndexPath } = require('./siteStore');
  const filePath = getStoredIndexPath(siteName);
  const rawHtml = getSiteHtml(siteName) || (fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : null);
  if (!rawHtml) {
    throw new Error(`Site "${siteName}" not found in memory or storage. Generate a site first.`);
  }

  const htmlContent = Buffer.from(rawHtml, 'utf-8');
  console.log(`\n[Vercel Deploy] Starting deployment for "${siteName}" (${htmlContent.length} bytes)...`);

  // Step 1: Upload the HTML file
  const { sha, size } = await uploadFile(htmlContent, token);

  // Step 2: Create the deployment
  const deployment = await createDeployment(siteName, sha, size, token);

  // Step 3: Wait for deployment to be ready
  if (deployment.readyState !== 'READY') {
    const ready = await waitForReady(deployment.id, token);
    console.log(`\n🚀 [Vercel Deploy] Site is LIVE at ${ready.url}\n`);
    return { url: ready.url, deploymentId: deployment.id };
  }

  console.log(`\n🚀 [Vercel Deploy] Site is LIVE at ${deployment.url}\n`);
  return { url: deployment.url, deploymentId: deployment.id };
}

module.exports = { deployToVercel };