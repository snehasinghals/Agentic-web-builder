const fs = require('fs');
const path = require('path');
const { ChatGroq } = require('@langchain/groq');
const { auditSite } = require('../services/lighthouse');
const { verifySite } = require('../services/playwright');
const { getSiteIndexPath } = require('../config/paths');
const { ENV_PATH } = require('../config/paths');

require('dotenv').config({ path: ENV_PATH });

const model = new ChatGroq({
  model: 'openai/gpt-oss-120b',
  temperature: 0.1,
  maxTokens: 4000,
  maxRetries: 5,
  apiKey: process.env.GROQ_API_KEY2 || process.env.GROQ_API_KEY1 || process.env.GROQ_API_KEY3
});

async function runCriticAgent(siteName) {
  console.log(`\n[Critic Agent] Auditing site "${siteName}" using Playwright and Lighthouse...`);
  const filePath = getSiteIndexPath(siteName);

  // 1. Run Playwright inspection directly
  let playwrightResult = { title: '', pageErrors: [], consoleErrors: [] };
  try {
    playwrightResult = await verifySite(filePath);
  } catch (err) {
    console.warn('[Critic Agent] Playwright inspection error:', err.message);
    playwrightResult.pageErrors.push(`Playwright error: ${err.message}`);
  }

  // 2. Run Lighthouse audit directly
  let lighthouseResult = {
    scores: { performance: 0, accessibility: 0, bestPractices: 0, seo: 0 },
    fullReport: {}
  };
  try {
    lighthouseResult = await auditSite(filePath);
  } catch (err) {
    console.warn('[Critic Agent] Lighthouse audit error:', err.message);
  }

  const scores = lighthouseResult.scores || { performance: 0, accessibility: 0, bestPractices: 0, seo: 0 };
  const rawRuntimeErrors = [
    ...(playwrightResult.pageErrors || []),
    ...(playwrightResult.consoleErrors || [])
  ];
  const runtimeErrors = [...new Set(rawRuntimeErrors)];

  // Extract top failing audits from Lighthouse
  const failingAudits = Object.values(lighthouseResult.fullReport?.audits || {})
    .filter(a => a.score !== null && a.score < 0.9)
    .map(a => ({
      title: a.title,
      description: a.description ? a.description.slice(0, 160) : '',
      score: Math.round((a.score || 0) * 100)
    }))
    .slice(0, 5);

  const passed = (
    scores.performance >= 85 &&
    scores.accessibility >= 85 &&
    scores.bestPractices >= 85 &&
    scores.seo >= 85 &&
    runtimeErrors.length === 0
  );

  // Fast path: if quality threshold is met and no runtime errors, skip LLM call
  if (passed) {
    console.log(`[Critic Agent] Site passed with scores:`, scores);
    return {
      siteName,
      rawSummary: 'All audits passed with scores >= 85 and 0 errors.',
      report: {
        scores,
        runtimeErrors: [],
        passed: true,
        issues: []
      }
    };
  }

  // 3. Ask LLM to synthesize actionable issues for the Fixer agent (standard prompt, no tool-calling)
  const CRITIC_PROMPT = `You are a Senior Web QA, Performance, and Accessibility Critic.
Analyze the following automated audit results for website "${siteName}" and return actionable fixes.

LIGHTHOUSE SCORES:
- Performance: ${scores.performance}/100
- Accessibility: ${scores.accessibility}/100
- Best Practices: ${scores.bestPractices}/100
- SEO: ${scores.seo}/100

RUNTIME ERRORS:
${runtimeErrors.length > 0 ? runtimeErrors.map(e => `- ${e}`).join('\n') : 'None'}

FAILING LIGHTHOUSE AUDITS:
${failingAudits.length > 0 ? failingAudits.map(a => `- [${a.score}%] ${a.title}: ${a.description}`).join('\n') : 'None'}

CRITICAL INSTRUCTIONS:
- You must respond with a SINGLE valid JSON object inside a \`\`\`json ... \`\`\` block.
- Do NOT use tools or tool calls.
- Return ONLY the JSON object.

SCHEMA:
{
  "scores": {
    "performance": ${scores.performance},
    "accessibility": ${scores.accessibility},
    "bestPractices": ${scores.bestPractices},
    "seo": ${scores.seo}
  },
  "runtimeErrors": ${JSON.stringify(runtimeErrors)},
  "passed": ${passed},
  "issues": [
    {
      "category": "performance|accessibility|bestPractices|seo|runtime",
      "problem": "Specific description of the defect",
      "suggestion": "Exact, actionable CSS/HTML/JS fix"
    }
  ]
}`;

  let content = '';
  let structuredReport = {
    scores,
    runtimeErrors,
    passed,
    issues: failingAudits.map(a => ({
      category: 'performance',
      problem: a.title,
      suggestion: a.description || 'Improve implementation to satisfy this audit.'
    }))
  };

  try {
    const response = await model.invoke([
      { role: 'system', content: 'You are a web QA critic. Always output a valid JSON object inside a ```json ... ``` block. Never call tools.' },
      { role: 'user', content: CRITIC_PROMPT }
    ]);

    content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

    const jsonMatch = content.match(/```json([\s\S]*?)```/) || content.match(/\{[\s\S]*"scores"[\s\S]*\}/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[1] ? jsonMatch[1].trim() : jsonMatch[0].trim();
      const parsed = JSON.parse(jsonStr);
      structuredReport = {
        scores: parsed.scores || scores,
        runtimeErrors: parsed.runtimeErrors || runtimeErrors,
        passed: parsed.passed !== undefined ? parsed.passed : passed,
        issues: parsed.issues || structuredReport.issues
      };
    }
  } catch (err) {
    console.warn('[Critic Agent] LLM issue synthesis failed, using fallback audit report:', err.message);
  }

  return {
    siteName,
    rawSummary: content,
    report: structuredReport
  };
}

// Retain export for backward compatibility
const criticAgent = { invoke: async () => ({ messages: [{ content: 'OK' }] }) };

module.exports = { criticAgent, runCriticAgent };

