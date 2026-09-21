const fs = require('fs');
const path = require('path');
const { ChatGroq } = require('@langchain/groq');
const { ENV_PATH, getSiteDir, getSiteIndexPath } = require('../config/paths');

require('dotenv').config({ path: ENV_PATH });

const model = new ChatGroq({
  model: 'openai/gpt-oss-120b',
  temperature: 0.3,
  maxTokens: 11000,
  maxRetries: 5,
  apiKey: process.env.GROQ_API_KEY1
});

// -----------------------------------------------------------------------
// Stack-specific instructions. Each option still produces ONE self-contained
// HTML file (fits the existing Critic/Fixer/Modifier pipeline unchanged).
// -----------------------------------------------------------------------
function getStackInstructions(stack) {
  switch (stack) {
    case 'html-tailwind':
      return `STACK: HTML + Tailwind CSS.
- Include Tailwind via CDN in the <head>: <script src="https://cdn.tailwindcss.com"></script>
- Style every element using Tailwind utility classes (e.g. class="flex items-center gap-4 rounded-xl bg-indigo-600") instead of writing a custom <style> block.
- A small <style> block is allowed ONLY for @keyframes animations or things Tailwind utility classes cannot express (e.g. custom gradients, custom font-face). Do not duplicate layout/spacing/color rules that Tailwind classes already handle.
- Still include plain <script> JavaScript (no framework) for interactivity (mobile nav toggle, smooth scroll, FAQ accordion, form validation).`;

    case 'react-cdn':
      return `STACK: React (CDN, no build step).
- In the <head>, include, in this order:
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
- In the <body>, include a single mount point: <div id="root"></div>
- Write the ENTIRE application inside one <script type="text/babel"> block placed after the mount point. Break the UI into small reusable function components (e.g. Navbar, Hero, Features, Footer) composed inside a top-level App component, and render with:
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(<App />);
- Use React function components with hooks (useState, useEffect) for any interactivity (mobile menu, accordions, form state, tabs) instead of manual DOM manipulation.
- Regular CSS still goes in a normal <style> block in the <head> — do not use inline styles as the primary styling method; use CSS classes referenced via className.`;

    case 'react-tailwind-cdn':
      return `STACK: React (CDN, no build step) + Tailwind CSS.
- In the <head>, include, in this order:
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
- In the <body>, include a single mount point: <div id="root"></div>
- Write the ENTIRE application inside one <script type="text/babel"> block placed after the mount point. Break the UI into small reusable function components (Navbar, Hero, Features, Footer, etc.) composed inside a top-level App component, and render with:
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(<App />);
- Style every component using Tailwind utility classes via className (e.g. className="flex items-center gap-4 rounded-xl bg-indigo-600"). Do not write a separate custom CSS system — a tiny <style> block is allowed only for @keyframes.
- Use React hooks (useState, useEffect) for interactivity (mobile menu, accordions, form state, tabs).`;

    case 'html-css-js':
    default:
      return `STACK: Plain HTML + CSS + JavaScript (no frameworks).
- Write all styling in a single <style> block using CSS variables, flexbox/grid.
- Write all interactivity in a single <script> block using vanilla JavaScript (mobile nav toggle, smooth scroll, FAQ accordion, form validation, etc.).`;
  }
}

function buildSystemPrompt(stack) {
  return `You are an expert full-stack web designer and frontend developer.
Your task is to build a complete, beautiful, modern, mobile-responsive single-page website for the user's request.

${getStackInstructions(stack)}

CRITICAL INSTRUCTIONS:

1. Generate a single, fully self-contained HTML file (whatever <style>/<script> or CDN <script> tags the stack above requires, all inside this one file).

2. FIRST, infer from the user's requirement: the business name, industry/category, target audience, and an appropriate tone of voice (e.g. playful, corporate, minimal, luxurious, friendly, bold). Do this silently before writing any code — do not print this analysis, just use it to drive steps 3-5.

3. DESIGN SYSTEM — derive it from the inferred industry + tone, do NOT default to one generic look:
   - Color palette: pick 3-4 hex codes (or, for Tailwind stacks, 3-4 Tailwind color families) that fit the industry (e.g. earthy greens for a café, electric indigo for SaaS, deep navy + gold for a law firm), used consistently.
   - Typography: choose a Google Font pairing (heading + body) that matches the tone (serif/elegant for luxury, sans/modern for tech, rounded sans for friendly consumer brands, mono accents for developer tools).
   - Corner style: fully rounded for friendly/consumer brands, sharp for corporate/luxury, pill buttons for modern SaaS.
   - Spacing: airy and generous for premium brands, denser for information-heavy sites.
   - Pick one signature visual motif (e.g. soft glow, subtle grain texture, bold borders, duotone image treatment) and apply it consistently.

4. SECTIONS — choose 6-9 relevant ones from the menu below based on the inferred industry (never include a section that doesn't fit, e.g. no pricing tiers on a personal portfolio, no menu grid on a SaaS site). Whichever ones you pick, they MUST appear in this relative order — do not reorder or interleave them:

   1. Sticky navbar (always first, always included)
   2. Hero (always second, always included)
   3. Logo cloud / trust bar (if included, goes right after hero)
   4. Features / Services
   5. How it works / Process
   6. Showcase / Gallery / Menu
   7. About / Story
   8. Stats band
   9. Testimonials / Reviews
   10. Team
   11. Pricing / Packages
   12. FAQ
   13. Booking / Contact form (always near the end)
   14. CTA banner (right before the footer)
   15. Footer (always last, always included)

  In other words: pick your subset of 6-9 from this list, but keep them in the same top-to-bottom sequence shown here. Never place pricing before features, never place the contact form before the hero, never place the footer anywhere but last.

5. CONTENT RULES: write real, specific copy for the actual inferred business — no lorem ipsum, no generic filler. Headlines, testimonials, and CTAs should reference the real business/industry, not placeholders.

6. IMAGES & VISUAL ASSETS (DYNAMIC, ZERO HARDCODED PATHS, ZERO PLACEHOLDER TEXT):
   - Generate all image URLs DYNAMICALLY based on the inferred industry, section, and subject matter. Do NOT hardcode static image paths, specific file IDs, or fixed photo URLs.
   - Use dynamic, topic-driven CDN image providers that deliver real, high-resolution photography instantly:
     * For section photographs, hero banners, and product/showcase cards:
       https://loremflickr.com/{width}/{height}/{keywords}?lock={unique_index}
       or
       https://picsum.photos/seed/{descriptive_keyword}/{width}/{height}
       (Examples:
        - Hero banner: https://loremflickr.com/1200/600/bakery,bread?lock=1
        - Feature/gallery card: https://loremflickr.com/600/400/croissant,pastry?lock=2
        - Story/about image: https://picsum.photos/seed/artisan-bakery/800/600)
     * For customer testimonials, team members, and user avatars:
       https://i.pravatar.cc/300?u={unique_name_or_id}
       or
       https://picsum.photos/seed/{member_name}/300/300
   - NEVER use placeholder services that render grey boxes with "Image" text (e.g. placehold.co, ).
   -You can also use pollinations.ai to generate the images if required
   - Every <img> must include:
     * loading="lazy" (except the above-the-fold hero image)
     * A meaningful, descriptive alt text
     * Explicit width and height attributes (or CSS aspect-ratio)
     * A dynamic fallback that never breaks:
       onerror="this.onerror=null;this.src='https://picsum.photos/800/600?random=1';"
   - ICONS & BADGES: For feature icons, process step numbers, and small badges, NEVER use <img> tags. Always use clean inline SVG icons (<svg width="24" height="24" ...>) or appropriate Unicode emojis (✨, 🥖, ⚡, 🥐, 🛡️, 📦, ☕). This guarantees icons never show as broken image boxes.

7. Include essential meta tags: <meta name="viewport" content="width=device-width, initial-scale=1.0">, <meta name="description" content="...">, and <html lang="en">.

8. Provide interactive JavaScript (or React state, per the stack instructions above) features appropriate to the sections included (e.g. mobile nav toggle, smooth scroll, FAQ accordion, form validation, filter buttons).

9. Ensure high accessibility: clear color contrast, form labels, alt tags on all images, semantic tags (<header>, <nav>, <main>, <section>, <footer>).

10. Use flexbox/grid, responsive media queries (or Tailwind's responsive prefixes, per the stack), subtle box shadows, and tasteful scroll/hover animations — not excessive.

11. Output ONLY the complete HTML code inside a \`\`\`html ... \`\`\` block.`;
}

async function runBuilderAgent(siteName, prompt, stack = 'react-tailwind-cdn') {
  console.log(`\n[Builder Agent] Generating site "${siteName}" (stack: ${stack}) for prompt: "${prompt}"...`);

  const response = await model.invoke([
    { role: 'system', content: buildSystemPrompt(stack) },
    { role: 'user', content: `Target Site: "${siteName}"\nUser Requirement: ${prompt}` }
  ]);

  const raw = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
  let html = raw;
  const match = raw.match(/```html([\s\S]*?)```/i);
  if (match) {
    html = match[1].trim();
  } else {
    html = html.replace(/```html|```/gi, '').trim();
  }

  const { saveSite } = require('../services/siteStore');
  saveSite(siteName, html);
  const filePath = getSiteIndexPath(siteName);

  console.log(`[Builder Agent] Saved site "${siteName}" in-memory & ephemeral storage (${html.length} chars).`);
  return {
    filePath,
    siteName,
    html
  };
}

module.exports = { runBuilderAgent };