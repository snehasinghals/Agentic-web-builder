const fs = require('fs');
const path = require('path');
const { ENV_PATH, getSiteIndexPath } = require('../config/paths');
const { invokeWithKeyRotation } = require('../services/groqpool');

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

function applyEditBlocks(html, blocks) {
  let result = html;
  const failures = [];
  for (const { search, replace } of blocks) {
    const occurrences = result.split(search).length - 1;
    if (occurrences === 0) {
      failures.push({ search: search.slice(0, 80), reason: 'search text not found' });
      continue;
    }
    if (occurrences > 1) {
      failures.push({ search: search.slice(0, 80), reason: `matched ${occurrences} times — applied to first only` });
    }
    result = result.replace(search, replace); // string-arg .replace() only touches the first match
  }
  return { result, failures, appliedCount: blocks.length - failures.filter(f => f.reason === 'search text not found').length };
}
// --- end inlined helpers ---

// Single engine: Groq (openai/gpt-oss-120b) with automatic API-key rotation
const MODEL_OPTIONS = {
  model: 'openai/gpt-oss-120b',
  temperature: 0.2,
  maxTokens: 12000
};

async function invokeModifierWithFallback(messages) {
  console.log('[Modifier Agent] Applying modification via Groq (openai/gpt-oss-120b)...');
  return await invokeWithKeyRotation(messages, MODEL_OPTIONS);
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
- The SEARCH text must match the current HTML EXACTLY, including whitespace and indentation. Do not paraphrase, abbreviate, or use "..." inside it.
- Use exactly 7 "<" characters, 7 "=" characters and 7 ">" characters in the markers, each on its own line.
- Each SEARCH block must be the SMALLEST snippet that uniquely identifies the location — usually 2-6 lines. Include a line of unchanged context above/below the change if needed for uniqueness, but never paste unrelated large chunks.
- Use multiple separate edit blocks for multiple non-contiguous changes — one block per change, in the order they appear in the file.
- Never include an entire section, the whole <style> block, or the whole file as one SEARCH block.
- If adding a brand-new section/component that has no existing equivalent to anchor near, use a small unique anchor (e.g. the closing tag of the section right before where the new one goes) as SEARCH, and place the anchor plus the new content in REPLACE.
- No explanation, no prose, no \`\`\`html fences — only the edit block(s).

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
PRESERVATION RULES
══════════════════════════════════════════
- Keep all existing sections, scripts, styles, and content intact unless the user explicitly asked to change them (or the change requires touching them, e.g. adding a nav link).
- Do NOT remove existing interactivity, animations, or event listeners.
- Do NOT simplify or reduce the existing design quality in any way.
- These preservation rules apply to parts of the site NOT related to the request — they must never be used as a reason to leave the requested change unimplemented.`;

async function runModifierAgent(siteName, modificationPrompt) {
  console.log(`\n[Modifier Agent] Applying user modifications to "${siteName}"...`);
  console.log(`[Modifier Agent] User request: "${modificationPrompt}"`);

  const { getSiteHtml, saveSite } = require('../services/siteStore');
  const diskPath = getSiteIndexPath(siteName);
  const currentHtml = getSiteHtml(siteName) || (fs.existsSync(diskPath) ? fs.readFileSync(diskPath, 'utf-8') : '');
  if (!currentHtml) {
    throw new Error(`Cannot modify site "${siteName}": site code not found in memory or storage.`);
  }

  const userPrompt = `TARGET SITE: "${siteName}"

USER REQUESTED MODIFICATIONS:
"${modificationPrompt}"

CURRENT SITE HTML CODE:
${currentHtml}

Apply ONLY the requested modifications above. Output ONLY SEARCH/REPLACE edit block(s) for the exact lines that change — do not output the full file.`;

  const response = await invokeModifierWithFallback([
    { role: 'system', content: MODIFIER_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt }
  ]);

  const raw = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
  let updatedHtml;

  const editBlocks = parseEditBlocks(raw);

  if (editBlocks.length > 0) {
    const { result, failures, appliedCount } = applyEditBlocks(currentHtml, editBlocks);
    if (failures.length) {
      console.warn(`[Modifier Agent] ${failures.length}/${editBlocks.length} edit block(s) had issues:`, failures);
    }
    updatedHtml = appliedCount > 0 ? result : currentHtml;
  } else {
    let fallback = raw;
    const match = raw.match(/```html([\s\S]*?)```/i);
    fallback = match ? match[1].trim() : fallback.replace(/```html|```/gi, '').trim();
    updatedHtml = fallback.length >= 100 ? fallback : currentHtml;
  }

  if (updatedHtml === currentHtml) {
    console.warn(`[Modifier Agent] WARNING: No changes were applied — keeping original HTML.`);
  }

  saveSite(siteName, updatedHtml);
  console.log(`[Modifier Agent] Modifications saved for "${siteName}" in-memory & ephemeral storage (${updatedHtml.length} chars).`);

  return {
    siteName,
    filePath: getSiteIndexPath(siteName),
    html: updatedHtml
  };
}

module.exports = { runModifierAgent };