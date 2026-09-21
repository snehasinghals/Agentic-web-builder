const path = require('path');
const { tool } = require('@langchain/core/tools');
const { z } = require('zod');
const { auditSite } = require('../services/lighthouse');
const { verifySite } = require('../services/playwright');
const { getSiteIndexPath } = require('../config/paths');

const runLighthouseAuditTool = tool(
  async ({ siteName }) => {
    const filePath = getSiteIndexPath(siteName);
    try {
      const result = await auditSite(filePath);
      const failingAudits = Object.values(result.fullReport.audits || {})
        .filter(a => a.score !== null && a.score < 0.9)
        .map(a => ({
          title: a.title,
          score: Math.round((a.score || 0) * 100)
        }))
        .slice(0, 4);

      return JSON.stringify({
        scores: result.scores,
        failingAudits
      });
    } catch (err) {
      return `Lighthouse audit failed: ${err.message}`;
    }
  },
  {
    name: 'run_lighthouse_audit',
    description: 'Runs Google Lighthouse on the generated site to get Performance, Accessibility, Best Practices, and SEO scores, plus top failing audits.',
    schema: z.object({
      siteName: z.string().describe('The name/directory of the site, e.g. "site1"')
    })
  }
);

const runPlaywrightInspectionTool = tool(
  async ({ siteName }) => {
    const filePath = getSiteIndexPath(siteName);
    try {
      const result = await verifySite(filePath);
      return JSON.stringify({
        title: result.title,
        screenshotPath: result.screenshotPath,
        runtimeErrors: result.pageErrors,
        consoleErrors: result.consoleErrors,
        status: result.pageErrors.length === 0 ? 'Page loaded cleanly without runtime crashes' : 'Runtime errors detected'
      }, null, 2);
    } catch (err) {
      return `Playwright inspection failed: ${err.message}`;
    }
  },
  {
    name: 'run_playwright_inspection',
    description: 'Launches the website in a real browser using Playwright to take a screenshot and check for JavaScript errors or broken page loads.',
    schema: z.object({
      siteName: z.string().describe('The name/directory of the site, e.g. "site1"')
    })
  }
);

module.exports = {
  runLighthouseAuditTool,
  runPlaywrightInspectionTool
};

