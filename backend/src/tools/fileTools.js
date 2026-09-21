const fs = require('fs');
const path = require('path');
const { tool } = require('@langchain/core/tools');
const { z } = require('zod');
const { getSiteDir, getSiteIndexPath } = require('../config/paths');

const writeSiteFileTool = tool(
  async ({ siteName, fileName, content }) => {
    const dir = getSiteDir(siteName);
    fs.mkdirSync(dir, { recursive: true });
    const targetPath = path.join(dir, fileName);
    fs.writeFileSync(targetPath, content, 'utf-8');
    return `Successfully saved file to ${targetPath} (${content.length} characters).`;
  },
  {
    name: 'write_site_file',
    description: 'Writes or updates a file (like index.html, style.css, script.js) for the generated website.',
    schema: z.object({
      siteName: z.string().describe('The name/directory of the site, e.g. "site1"'),
      fileName: z.string().describe('The name of the file to save, e.g. "index.html"'),
      content: z.string().describe('The full code content to write to the file')
    })
  }
);

const readSiteFileTool = tool(
  async ({ siteName, fileName }) => {
    const dir = getSiteDir(siteName);
    const filePath = path.join(dir, fileName);
    if (!fs.existsSync(filePath)) {
      return `File not found at ${filePath}.`;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return content;
  },
  {
    name: 'read_site_file',
    description: 'Reads the code content of a file (e.g. index.html) from the generated website directory.',
    schema: z.object({
      siteName: z.string().describe('The name/directory of the site, e.g. "site1"'),
      fileName: z.string().describe('The name of the file to read, e.g. "index.html"')
    })
  }
);

const listSiteFilesTool = tool(
  async ({ siteName }) => {
    const dir = getSiteDir(siteName);
    if (!fs.existsSync(dir)) {
      return `No directory found for ${siteName}.`;
    }
    const files = fs.readdirSync(dir);
    return `Files in ${siteName}: ${files.join(', ')}`;
  },
  {
    name: 'list_site_files',
    description: 'Lists all files currently generated for the specified site directory.',
    schema: z.object({
      siteName: z.string().describe('The name/directory of the site, e.g. "site1"')
    })
  }
);

module.exports = {
  writeSiteFileTool,
  readSiteFileTool,
  listSiteFilesTool
};

