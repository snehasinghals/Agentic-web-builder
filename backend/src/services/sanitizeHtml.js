// Guards against the two failure modes we've seen from the LLM agents:
// 1. A hallucinated local asset reference (e.g. <link href="main.css">,
//    <script src="app.js">) that 404s, since we only ever serve one
//    self-contained HTML file.
// 2. A stack that needs Tailwind's CDN script but the tag got dropped,
//    stripped, or mangled during a fix/modify pass.
function sanitizeGeneratedHtml(html, stack) {
  if (!html) return html;

  // 1. Strip <link rel="stylesheet"> pointing at a non-CDN (local) path
  html = html.replace(
    /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["'](?!https?:\/\/)[^"']*["'][^>]*>/gi,
    ''
  );
  // Also catch href-before-rel attribute ordering
  html = html.replace(
    /<link\s+[^>]*href=["'](?!https?:\/\/)[^"']*["'][^>]*rel=["']stylesheet["'][^>]*>/gi,
    ''
  );

  // 2. Strip <script src="..."> pointing at a non-CDN (local) path
  html = html.replace(
    /<script\s+[^>]*src=["'](?!https?:\/\/)[^"']*["'][^>]*><\/script>/gi,
    ''
  );

  // 3. Ensure Tailwind CDN script is present when the stack requires it
  const needsTailwind = stack === 'html-tailwind' || stack === 'react-tailwind-cdn';
  const hasTailwindScript = /cdn\.tailwindcss\.com/i.test(html);
  if (needsTailwind && !hasTailwindScript) {
    html = html.replace(
      /<head[^>]*>/i,
      (m) => `${m}\n<script src="https://cdn.tailwindcss.com"></script>`
    );
  }

  // 4. Ensure React/ReactDOM/Babel CDN scripts are present for React stacks
  const needsReact = stack === 'react-cdn' || stack === 'react-tailwind-cdn';
  const hasReact = /unpkg\.com\/react@18/i.test(html);
  if (needsReact && !hasReact) {
    html = html.replace(
      /<head[^>]*>/i,
      (m) => `${m}
<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>`
    );
  }

  // ===== NEW: 5. Prevent the browser's automatic favicon.ico request =====
  // (404s as "Failed to load resource: net::ERR_FILE_NOT_FOUND" on file:// pages)
  if (!/rel=["']icon["']/i.test(html)) {
    html = html.replace(
      /<head[^>]*>/i,
      (m) => `${m}\n<link rel="icon" href="data:,">`
    );
  }

  // ===== NEW: 6. Strip any inline tailwind.config script =====
  // Not requested by our Builder prompt (we style via utility classes only),
  // and when the LLM adds it before the CDN <script> tag loads, it throws
  // "tailwind is not defined". Safe to remove entirely.
  html = html.replace(/<script>\s*tailwind\.config\s*=[\s\S]*?<\/script>/gi, '');


  // 7. React must load synchronously and in order — async/defer causes a race
  // (ReactDOM can execute before React exists), producing:
  // "Cannot read properties of undefined (reading '__SECRET_INTERNALS...')"
  // or "ReactDOM.createRoot is not a function". Strip async/defer from just
  // these three CDN tags, regardless of which agent (Builder/Fixer/Modifier)
  // produced them.
  if (needsReact) {
    html = html.replace(
      /(<script\s+[^>]*src=["']https:\/\/unpkg\.com\/(?:react@18|react-dom@18|@babel\/standalone)[^"']*["'])([^>]*)(>)/gi,
      (m, open, attrs, close) => open + attrs.replace(/\s+(async|defer)\b/gi, '') + close
    );
  }

  // 8. React stacks: convert (never leave) a string onError/onerror value on
  // <img> into a JSX function handler — a string throws "Minified React
  // error #231" and crashes the app.
  if (needsReact) {
    html = html.replace(
      /onError=(["'])this\.onerror\s*=\s*null;\s*this\.src\s*=\s*(['"])(.*?)\2;?\s*\1/gi,
      (m, q, sq, fallback) => `onError={(e) => { e.target.onerror = null; e.target.src = '${fallback}'; }}`
    );
    // Also catch the lowercase HTML attribute form if the model used it in JSX
    html = html.replace(
      /onerror=(["'])this\.onerror\s*=\s*null;\s*this\.src\s*=\s*(['"])(.*?)\2;?\s*\1/gi,
      (m, q, sq, fallback) => `onError={(e) => { e.target.onerror = null; e.target.src = '${fallback}'; }}`
    );
  }

  return html;
}

module.exports = { sanitizeGeneratedHtml };