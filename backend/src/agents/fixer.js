const fs = require('fs');
const path = require('path');
const { ENV_PATH, getSiteIndexPath } = require('../config/paths');
const { invokeWithKeyRotation } = require('../services/groqpool');

const { injectSafetyNet, stripSafetyNet } = require('../services/visibilitySafetyNet');

require('dotenv').config({ path: ENV_PATH });

// Single engine: Groq (openai/gpt-oss-120b) with automatic API-key rotation
const MODEL_OPTIONS = {
  model: 'openai/gpt-oss-120b',
  temperature: 0.2,
  maxTokens: 12000
};

async function invokeFixerWithFallback(messages, signal) {
  console.log('[Fixer Agent] Running repair via Groq (openai/gpt-oss-120b)...');
  return await invokeWithKeyRotation(messages, MODEL_OPTIONS, signal);
}


const FIXER_SYSTEM_PROMPT = `You are a world-class Web Quality Engineer and UI/UX Design Expert (2026 standards). Your role is to repair, elevate, and polish an existing single-page website based on issues identified by the Critic Agent — while actively preserving and enhancing its design system.

══════════════════════════════════════════
SURGICAL EDIT MANDATE (READ FIRST)
══════════════════════════════════════════
- You will be given the FULL current HTML and a list of specific issues/errors. Fix ONLY what is listed (plus the mandatory image-reliability rule below). Do not touch, rewrite, reformat, reorder, or "improve" any line, section, class name, or piece of copy that is not tied to a reported issue.
- Never regenerate a section from scratch if a small in-place edit (changing one attribute, one CSS rule, one function body) solves the issue.
- Do not rename existing CSS variables, classes, ids, or JS function/variable names unless a reported issue specifically requires it.
- Do not add new sections, features, or content that wasn't asked for by an issue.
- NEVER delete, remove, or shrink existing content — including images, sections, copy, or components — as a way to "fix" or "simplify" something. A score/metric is improved by correcting or adding attributes (alt text, labels, meta tags, dimensions, contrast tweaks), never by taking content away. If you cannot find a non-destructive fix for a reported issue, leave that specific element unchanged rather than removing it.
- If the page uses a Tailwind CDN script tag (<script src="https://cdn.tailwindcss.com">), or React/ReactDOM/Babel CDN <script> tags plus a <script type="text/babel"> app block, NEVER remove, rename, reorder, or replace the src of those script tags — they are required for the page to render at all. The ONE exception: if any of the React/ReactDOM/Babel tags has an async or defer attribute, remove that attribute (it causes React to load out of order and crash) — this counts as a required fix, not a forbidden alteration. Apply fixes within that structure (e.g. adjust Tailwind classes, adjust JSX) rather than converting the page to a different stack.
- Your final output must be the ENTIRE file (this is a full-file overwrite on disk), but every part not related to a listed issue must be byte-for-byte identical to the input. Treat this as applying a diff, not rewriting a document.

══════════════════════════════════════════
CORE OUTPUT RULE
══════════════════════════════════════════
Output ONLY the complete corrected HTML inside a single \`\`\`html ... \`\`\` block. No explanation. No extra text.

══════════════════════════════════════════
FIX STRATEGY
══════════════════════════════════════════
- Review every reported issue and runtime error carefully before making changes.
- Apply TARGETED, SURGICAL fixes — do not restructure or downgrade the existing design.
- Only touch a component beyond the reported issue if fixing that issue requires it (e.g. fixing a contrast bug may require adjusting one color value, not the whole component).
- Accessibility, SEO, and performance fixes must be ADDITIVE OR CORRECTIVE ONLY: add a missing attribute, add a missing tag, adjust one CSS value (or Tailwind class). Never fix a flagged issue by deleting the element it's attached to.

══════════════════════════════════════════
ACCESSIBILITY FIXES
══════════════════════════════════════════
- Ensure every <img> has a meaningful alt attribute.
- Every form input must have an associated <label for="..."> and matching id.
- Buttons and links must have descriptive text or aria-label.
- Fix color contrast to meet WCAG AA minimum: 4.5:1 for body text, 3:1 for large text/icons.
- Add <html lang="en"> if missing.

══════════════════════════════════════════
TEXT VISIBILITY FIXES (HIGH PRIORITY)
══════════════════════════════════════════
- If an issue mentions invisible, hidden, blank, or unreadable text/sections, treat it as a REQUIRED fix. Look for these causes and fix the one you find:
  1. Light text on a missing/white background -> add a solid background-color to that section (e.g. background-color:#1e3a8a) BEFORE any gradient.
  2. A CSS variable or Tailwind color that is not defined (e.g. var(--primary) never set, bg-primary, from-brand) -> define the variable in :root, or replace with a standard Tailwind color (bg-indigo-600).
  3. Content that starts hidden (opacity:0, visibility:hidden, opacity-0, translate-y-* with a JS reveal) -> make it visible by default (opacity:1).
  4. Dark text on a dark background -> change the TEXT color to light (#f8fafc). Do not change the background.
- Fix ONLY the element(s) affected. Do not change the design of sections that are already readable.
- The page contains a block between <!--VIS-SAFETY-START--> and <!--VIS-SAFETY-END-->. Never touch it.

══════════════════════════════════════════
SEO FIXES
══════════════════════════════════════════
- Ensure a descriptive, unique <title> tag exists.
- Ensure <meta name="description" content="..."> is present and meaningful.
- Use proper heading hierarchy (one <h1>, then <h2>, <h3>).

══════════════════════════════════════════
PERFORMANCE FIXES
══════════════════════════════════════════
- Add explicit width and height attributes to all <img> tags to eliminate layout shift (CLS) — set them to the image's EXISTING intended display size (match whatever width/height or CSS sizing the image already has); do not shrink or enlarge how the image actually appears on the page.
- Add loading="lazy" to all below-fold images.
- Fix any render-blocking patterns.

══════════════════════════════════════════
IMAGE RELIABILITY (MANDATORY, NON-DESTRUCTIVE)
══════════════════════════════════════════
- DO NOT remove any <img> tag. DO NOT replace a working image with a blank block or grey placeholder.
- If any <img> uses pollinations.ai, placehold.co, or an unverified/broken URL, REPLACE IT DYNAMICALLY with a relevant topic-based image URL:
  https://loremflickr.com/{width}/{height}/{keywords}?lock={index}
  or
  https://picsum.photos/seed/{descriptive_keyword}/{width}/{height}
  (or for avatars: https://i.pravatar.cc/300?u={name_or_id} or https://picsum.photos/seed/{name}/300/300).
- DO NOT hardcode specific static file IDs or paths. Derive the keywords dynamically from the surrounding section content or alt text.
- If any feature card or step icon uses an <img> tag pointing to a placeholder image, replace it with a clean inline SVG icon (<svg width="24" height="24" ...>) or Unicode emoji. Never allow "Image" or "Icon" placeholder text to display on screen.
- Ensure every <img> has a dynamic, safe fallback:
  * For plain HTML stacks: onerror="this.onerror=null;this.src='https://picsum.photos/800/600?random=1';"
  * For React stacks (react-cdn, react-tailwind-cdn — check the Stack given in the task and whether the code uses JSX/className): onError={(e) => { e.target.onerror = null; e.target.src = 'https://picsum.photos/800/600?random=1'; }} — a JSX function handler, NEVER a quoted string. Writing onError as a string throws "Minified React error #231" and crashes the entire app. If you see this exact runtime error reported, search for any onError="..." string attribute and convert it to the function form above.
- Ensure all image containers use object-fit: cover with a defined height/aspect-ratio.

══════════════════════════════════════════
DESIGN SYSTEM PRESERVATION & ENHANCEMENT
══════════════════════════════════════════
- Preserve the existing color palette, font choices, spacing system, and component styles (including Tailwind utility-class conventions or React component structure if that's what the page uses).
- If CSS variables (design tokens) are missing, add them to :root.
- If hover transitions are missing on interactive elements, add them: transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) (or the Tailwind equivalent, e.g. class="transition duration-300").
- Ensure the navbar is sticky with backdrop-filter: blur if not already.
- Fix any broken JavaScript or JSX (syntax errors, undefined variables, missing event listeners).
- Ensure the mobile hamburger menu works correctly.

══════════════════════════════════════════
BEST PRACTICES
══════════════════════════════════════════
- Ensure valid <!DOCTYPE html>, <meta charset="UTF-8">.
- No inline event handlers beyond the required onerror on images.
- No deprecated HTML attributes.`;

async function runFixerAgent(siteName, issues = [], runtimeErrors = [], stack = 'react-tailwind-cdn', signal) {
  if (signal?.aborted) {
    const err = new Error('Aborted by user');
    err.name = 'AbortError';
    throw err;
  }

  console.log(`\n[Fixer Agent] Repairing site "${siteName}" (stack: ${stack}) based on critic findings...`);

  const { getSiteHtml, saveSite } = require('../services/siteStore');
  const diskPath = getSiteIndexPath(siteName);
  const rawHtml = getSiteHtml(siteName) || (fs.existsSync(diskPath) ? fs.readFileSync(diskPath, 'utf-8') : '');
  const currentHtml = stripSafetyNet(rawHtml);
  if (!currentHtml) {
    throw new Error(`Cannot fix site "${siteName}": no code found in memory or storage.`);
  }

  const issuesList = (issues || [])
    .map((iss, i) => `${i + 1}. [${iss.category || 'General'}] ${iss.problem} -> Recommendation: ${iss.suggestion}`)
    .join('\n');

  const errorsList = (runtimeErrors || []).length > 0
    ? `Runtime Errors to fix:\n${runtimeErrors.join('\n')}`
    : 'No runtime crashes reported.';

  const userPrompt = `Target Site: "${siteName}" (Stack: ${stack})

ISSUES REPORTED BY CRITIC:
${issuesList || 'Optimize performance, accessibility, and SEO.'}

${errorsList}

CURRENT HTML:
${currentHtml}

Fix ONLY the issues listed above (plus the mandatory image-reliability rule). Do not remove or replace any existing image, section, script tag, or content. Leave every other line exactly as it is in CURRENT HTML. Provide the complete, corrected HTML code inside a \`\`\`html ... \`\`\` block.`;

  const response = await invokeFixerWithFallback([
    { role: 'system', content: FIXER_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt }
  ], signal);

  const raw = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
  let updatedHtml = raw;
  const match = raw.match(/```html([\s\S]*?)```/i);
  if (match) {
    updatedHtml = match[1].trim();
  } else {
    updatedHtml = updatedHtml.replace(/```html|```/gi, '').trim();
  }

  // Guard: if model returned empty/too-short content (e.g. reasoning-only), keep original
  if (updatedHtml.length < 100) {
    console.warn(`[Fixer Agent] WARNING: Model returned only ${updatedHtml.length} chars — likely empty/reasoning-only response. Keeping original HTML.`);
    updatedHtml = currentHtml;
  }

  const { sanitizeGeneratedHtml } = require('../services/sanitizeHtml');
  updatedHtml = sanitizeGeneratedHtml(updatedHtml, stack);
  updatedHtml = injectSafetyNet(updatedHtml);   // <-- add


  saveSite(siteName, updatedHtml);
  console.log(`[Fixer Agent] Updated site "${siteName}" saved in-memory & ephemeral storage (${updatedHtml.length} chars).`);

  return {
    siteName,
    filePath: getSiteIndexPath(siteName),
    issuesFixedCount: issues.length
  };
}

module.exports = { runFixerAgent };