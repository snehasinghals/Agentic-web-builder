const fs = require('fs');
const path = require('path');
const { ENV_PATH, getSiteIndexPath } = require('../config/paths');
const { invokeWithKeyRotation } = require('../services/groqpool');

const { injectSafetyNet, stripSafetyNet } = require('../services/visibilitySafetyNet');

require('dotenv').config({ path: ENV_PATH });

// --- Inlined edit-block helpers (no external file needed) ---
const EDIT_BLOCK_REGEX = /<{5,}\s*SEARCH\n([\s\S]*?)\n={5,}\n([\s\S]*?)\n>{5,}\s*REPLACE/g;

function parseEditBlocks(text) {
  const blocks = [];
  let match;
  while ((match = EDIT_BLOCK_REGEX.exec(text)) !== null) {
    blocks.push({ search: match[1], replace: match[2] });
  }
  return blocks;
}

// NEW: whitespace-tolerant fallback matcher.
// If the exact SEARCH string isn't found (common when the model reproduces
// the HTML with slightly different indentation/line-breaks), collapse all
// whitespace runs in the SEARCH text to \s+ and look for that pattern in
// the real HTML, then replace the ACTUAL substring found (not the model's
// version) with REPLACE.
function findFlexibleMatch(html, search) {
  const tokens = search.split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  const pattern = tokens
    .map(tok => tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  try {
    const re = new RegExp(pattern);
    const m = html.match(re);
    return m ? m[0] : null;
  } catch {
    return null;
  }
}

function applyEditBlocks(html, blocks) {
  let result = html;
  const failures = [];
  let appliedCount = 0;

  for (const { search, replace } of blocks) {
    const exactOccurrences = result.split(search).length - 1;

    if (exactOccurrences === 1) {
      result = result.replace(search, replace);
      appliedCount++;
      continue;
    }

    if (exactOccurrences > 1) {
      failures.push({ search: search.slice(0, 80), reason: `matched ${exactOccurrences} times — applied to first only` });
      result = result.replace(search, replace);
      appliedCount++;
      continue;
    }

    // exactOccurrences === 0 → try whitespace-tolerant fallback before giving up
    const flexibleMatch = findFlexibleMatch(result, search);
    if (flexibleMatch) {
      result = result.replace(flexibleMatch, replace);
      appliedCount++;
    } else {
      failures.push({ search: search.slice(0, 80), reason: 'search text not found (exact or flexible)' });
    }
  }

  return { result, failures, appliedCount };
}
// --- end inlined helpers ---

// Single engine: Groq (openai/gpt-oss-120b) with automatic API-key rotation
const MODEL_OPTIONS = {
  model: 'openai/gpt-oss-120b',
  temperature: 0.2,
  maxTokens: 12000
};

async function invokeModifierWithFallback(messages, signal) {
  console.log('[Modifier Agent] Applying modification via Groq (openai/gpt-oss-120b)...');
  return await invokeWithKeyRotation(messages, MODEL_OPTIONS, signal);
}

const MODIFIER_SYSTEM_PROMPT = `You are a world-class Senior Frontend Engineer and UI/UX Design Expert (2026 standards), specializing in iterative, high-quality website modifications. Your task is to apply specific user-requested changes to an existing single-page website while preserving and elevating its design system.

══════════════════════════════════════════
CORE OUTPUT RULE — EDIT BLOCKS ONLY
══════════════════════════════════════════
Do NOT output the full HTML file. Output ONLY one or more edit blocks in this exact format:

<<<<<<< SEARCH
(exact existing code to find, copied character-for-character from the current HTML)
=======
(the replacement code)
>>>>>>> REPLACE

Example — changing a hero headline and adding a nav link, as two separate blocks:

<<<<<<< SEARCH
<h1 class="hero-title">Fresh Bread Daily</h1>
=======
<h1 class="hero-title">Handcrafted Sourdough, Baked Every Morning</h1>
>>>>>>> REPLACE

<<<<<<< SEARCH
<li><a href="#about">About</a></li>
=======
<li><a href="#about">About</a></li>
<li><a href="#faq">FAQ</a></li>
>>>>>>> REPLACE

Rules:
- The SEARCH text must match the current HTML EXACTLY, including whitespace and indentation. Do not paraphrase, abbreviate, or use "..." inside it. Copy it verbatim from the CURRENT SITE HTML CODE block you were given — never reconstruct it from memory or from what you think it should look like.
- Use exactly 7 "<" characters, 7 "=" characters and 7 ">" characters in the markers, each on its own line.
- Each SEARCH block must be the SMALLEST snippet that uniquely identifies the location — usually 2-6 lines. Include a line of unchanged context above/below the change if needed for uniqueness, but never paste unrelated large chunks.
- Use multiple separate edit blocks for multiple non-contiguous changes — one block per change, in the order they appear in the file.
- Never include an entire section, the whole <style> block, or the whole file as one SEARCH block.
- If adding a brand-new section/component that has no existing equivalent to anchor near, use a small unique anchor (e.g. the closing tag of the section right before where the new one goes) as SEARCH, and place the anchor plus the new content in REPLACE.
- No explanation, no prose, no \`\`\`html fences — only the edit block(s).

══════════════════════════════════════════
STRICT SCOPE DISCIPLINE (READ CAREFULLY)
══════════════════════════════════════════
- Touch ONLY the element(s) the user's request is actually about. Never modify the header, navbar, hero image, unrelated sections, or any content the user did not mention — even if you personally think it would look better.
- When the user gives you creative discretion on HOW to do something (e.g. "adjust it yourself, whatever feels good", "fix it how you think is best"), that discretion applies ONLY to choosing the specific value/technique for the property they're asking about (e.g. picking a margin/padding/gap value, or a spacer height). It is NEVER permission to change anything else in the file — no swapping images, no rewriting copy, no touching sections they didn't name.
- For spacing/layout requests between two named sections (e.g. "reduce the gap between the contact form and the footer"): identify the actual CSS controlling that gap — margin-bottom on the last element of the first section, margin-top/padding-top on the next section, or a dedicated spacer/divider element between them — and adjust ONLY that property's value. Do not touch anything inside either section's content, and do not touch any other section of the page.
- If you cannot find an exact, uniquely-matching anchor for the requested area, pick the smallest CSS rule or inline style that clearly governs that spacing and edit only its value — do not fall back to editing something unrelated just to "produce a change."

══════════════════════════════════════════
MANDATORY: THE CHANGE MUST ACTUALLY HAPPEN
══════════════════════════════════════════
- You MUST implement the user's requested modification via your edit block(s). Returning zero edit blocks, or edit blocks that don't functionally fulfill the request, is a FAILURE.
- Before outputting, verify: "Do these edit blocks, once applied, visibly and functionally reflect the user's request?" If not, revise until they do.
- If the request is ambiguous, make the most reasonable concrete interpretation and implement it fully — do not skip it or ask for clarification, since no explanation text is allowed in the output.
- Never output an edit block whose SEARCH and REPLACE are identical.

══════════════════════════════════════════
MODIFICATION PHILOSOPHY
══════════════════════════════════════════
- SURGICAL EDITS: Change only what's needed to fulfill the request, but the request MUST be fulfilled — "surgical" describes precision, not an excuse to leave the site unchanged.
- DESIGN SYSTEM CONSISTENCY: Any new elements you add must match the existing font families, CSS variable tokens, spacing scale, border-radius, and color palette exactly.
- QUALITY ELEVATION: When adding a new component, build it to the same premium 2026 standard as the rest of the site — use the existing CSS variables, apply hover transitions (transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1)), and ensure mobile responsiveness.

══════════════════════════════════════════
DESIGN STANDARDS FOR NEW/MODIFIED ELEMENTS
══════════════════════════════════════════
- New interactive components (modals, drawers, tabs, toggles, accordions, sliders): implement with clean, self-contained JavaScript inside the existing <script> block.
- New cards or sections: use the site's existing CSS variable design tokens (--color-surface, --color-border, etc.). Apply glassmorphism if the site already uses it.
- New CTAs or buttons: match the existing button styles (pill-shaped, gradient, outline, etc.) — do not introduce mismatched styles.
- New form elements: ensure they have proper <label for="...">, aria attributes, and validation logic consistent with any existing form patterns.

══════════════════════════════════════════
IMAGE RELIABILITY (MANDATORY, DYNAMIC)
══════════════════════════════════════════
- If the modification requires adding new images, use dynamic topic-based CDNs (do not hardcode static photo IDs):
  https://loremflickr.com/{width}/{height}/{keywords}?lock={index}
  or
  https://picsum.photos/seed/{keyword}/{width}/{height}
  (or for avatars: https://i.pravatar.cc/300?u={name} or https://picsum.photos/seed/{name}/300/300)
- EVERY new <img> tag MUST include:
  onerror="this.onerror=null;this.src='https://picsum.photos/800/600?random=1';"
- Include alt, loading="lazy", width, height on every new image.
- For icons/badges, always use inline SVG icons or Unicode emojis, never <img> tags.


══════════════════════════════════════════
TEXT VISIBILITY RULES (MANDATORY)
══════════════════════════════════════════
- Any new or changed element with light/white text MUST sit on a solid background-color (add it before any gradient). Never rely on a gradient alone.
- Use ONLY CSS variables that already exist in :root and standard Tailwind colors. Never invent names like bg-primary or var(--brand).
- Never make new content start hidden (no opacity:0, visibility:hidden, opacity-0). New content must be visible with zero JavaScript.
- If the user asks to change a background color or a text color, check the result: light text on dark bg, dark text on light bg. Also update the matching text/background color if needed so nothing becomes unreadable.

══════════════════════════════════════════
PRESERVATION RULES
══════════════════════════════════════════
- Keep all existing sections, scripts, styles, and content intact unless the user explicitly asked to change them (or the change requires touching them, e.g. adding a nav link).
- Do NOT remove existing interactivity, animations, or event listeners.
- Do NOT simplify or reduce the existing design quality in any way.
- These preservation rules apply to parts of the site NOT related to the request — they must never be used as a reason to leave the requested change unimplemented.`;

function buildUserPrompt(siteName, modificationPrompt, currentHtml) {
  return `TARGET SITE: "${siteName}"

USER REQUESTED MODIFICATIONS:
"${modificationPrompt}"

CURRENT SITE HTML CODE:
${currentHtml}

Apply ONLY the requested modifications above. Output ONLY SEARCH/REPLACE edit block(s) for the exact lines that change — do not output the full file.`;
}

async function runModifierAgent(siteName, modificationPrompt, stack = 'react-tailwind-cdn', signal) {
  if (signal?.aborted) {
    const err = new Error('Aborted by user');
    err.name = 'AbortError';
    throw err;
  }

  console.log(`\n[Modifier Agent] Applying user modifications to "${siteName}"...`);
  console.log(`[Modifier Agent] User request: "${modificationPrompt}"`);

  const { getSiteHtml, saveSite } = require('../services/siteStore');
  const diskPath = getSiteIndexPath(siteName);
  const rawHtml = getSiteHtml(siteName) || (fs.existsSync(diskPath) ? fs.readFileSync(diskPath, 'utf-8') : '');
  const currentHtml = stripSafetyNet(rawHtml);
  if (!currentHtml) {
    throw new Error(`Cannot modify site "${siteName}": site code not found in memory or storage.`);
  }

  async function attempt(promptMessages) {
    const response = await invokeModifierWithFallback(promptMessages, signal);
    const raw = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    const editBlocks = parseEditBlocks(raw);

    if (editBlocks.length > 0) {
      const { result, failures, appliedCount } = applyEditBlocks(currentHtml, editBlocks);
      return { updatedHtml: appliedCount > 0 ? result : null, failures, appliedCount, raw };
    }

    let fallback = raw;
    const match = raw.match(/```html([\s\S]*?)```/i);
    fallback = match ? match[1].trim() : fallback.replace(/```html|```/gi, '').trim();
    return {
      updatedHtml: fallback.length >= 100 ? fallback : null,
      failures: [],
      appliedCount: fallback.length >= 100 ? 1 : 0,
      raw
    };
  }

  let { updatedHtml, failures, appliedCount } = await attempt([
    { role: 'system', content: MODIFIER_SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(siteName, modificationPrompt, currentHtml) }
  ]);

  // NEW: one-shot retry if nothing actually applied — tell the model exactly
  // why its edit blocks failed and force it to re-copy text verbatim.
  if (!updatedHtml && appliedCount === 0) {
    console.warn('[Modifier Agent] No edits applied on first attempt — retrying with failure feedback.');
    const failureNote = failures.length
      ? `Your previous attempt's SEARCH text did not match the actual HTML (reasons: ${failures.map(f => f.reason).join('; ')}). You must copy SEARCH text character-for-character from the CURRENT SITE HTML CODE below — do not retype it from memory.`
      : `Your previous attempt returned no usable edit blocks.`;

    const retryResult = await attempt([
      { role: 'system', content: MODIFIER_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `${failureNote}\n\n${buildUserPrompt(siteName, modificationPrompt, currentHtml)}`
      }
    ]);
    updatedHtml = retryResult.updatedHtml;
    failures = retryResult.failures;
    appliedCount = retryResult.appliedCount;
  }

  if (!updatedHtml) {
    console.warn(`[Modifier Agent] WARNING: No changes were applied after retry — keeping original HTML.`);
    updatedHtml = currentHtml;
  }

  const { sanitizeGeneratedHtml } = require('../services/sanitizeHtml');
  updatedHtml = sanitizeGeneratedHtml(updatedHtml, stack);
  updatedHtml = injectSafetyNet(updatedHtml);   // <-- add


  saveSite(siteName, updatedHtml);
  console.log(`[Modifier Agent] Modifications saved for "${siteName}" in-memory & ephemeral storage (${updatedHtml.length} chars).`);

  return {
    siteName,
    filePath: getSiteIndexPath(siteName),
    html: updatedHtml
  };
}

module.exports = { runModifierAgent };