/**
 * HTML + JSX tag map (click-to-code helper)
 *
 * Works for all 4 stacks of the builder:
 *   - HTML + CSS + JS
 *   - HTML + Tailwind CSS
 *   - React (CDN, Babel in the browser)
 *   - React + Tailwind CSS
 *
 * It numbers every element that exists as TEXT in the generated file:
 *   1. every real HTML tag                        -> <div>, <h1>, <button> ...
 *   2. every JSX element in <script type="text/babel">   (React stacks)
 *   3. every HTML tag written inside a JS string / template literal
 *      in a normal <script>   (cards, lists etc. built with innerHTML)
 *
 * The preview server adds data-lumina-idx="N" to all of them, and the
 * dashboard uses the same N to find the matching code. Stored/deployed
 * HTML is never changed.
 *
 * Exports are the same as before: scanTags, injectIndexes, buildTagMap,
 * htmlVersion.
 */

const crypto = require('crypto');

// Babel is only needed for JSX / JS-string support. If it is missing we still
// number the plain HTML tags instead of crashing the server.
let babelParse = null;
try {
  babelParse = require('@babel/parser').parse;
} catch (e) {
  console.warn('[htmlMap] @babel/parser not installed - JSX and JS-string elements will not be mapped. Run: npm install @babel/parser');
}

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

// Tags whose content is plain text / code, not markup
const RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'title']);

// A JS string only counts as "HTML" if the tag inside it is a real HTML tag.
// (stops things like "a<b and c>d" from being treated as markup)
const KNOWN_HTML_TAGS = new Set([
  'a', 'abbr', 'article', 'aside', 'b', 'blockquote', 'br', 'button', 'canvas',
  'caption', 'circle', 'code', 'dd', 'details', 'div', 'dl', 'dt', 'em',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'g', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'header', 'hr', 'i', 'img', 'input', 'label', 'legend',
  'li', 'main', 'mark', 'nav', 'ol', 'option', 'p', 'path', 'pre', 'rect',
  'section', 'select', 'small', 'span', 'strong', 'sub', 'summary', 'sup',
  'svg', 'table', 'tbody', 'td', 'textarea', 'tfoot', 'th', 'thead', 'time',
  'tr', 'u', 'ul', 'video'
]);

const OPEN_TAG_RE = /<([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/y;
const CLOSE_TAG_RE = /<\/([a-zA-Z][a-zA-Z0-9:-]*)[^>]*>/y;

// A browser <textarea> converts CRLF to LF, so we always work on LF text.
function normalize(html) {
  return html.replace(/\r\n?/g, '\n');
}

// ---------------------------------------------------------------------------
// 1. Plain HTML scan
// ---------------------------------------------------------------------------
/**
 * Returns [{ tag, attrs, start, openEnd, end, contentEnd }] in document order.
 *  start      = index of "<" of the opening tag
 *  openEnd    = index right after the opening tag's ">"
 *  end        = index right after the closing tag (or openEnd if none)
 *  contentEnd = for <script>/<style>: index where the closing tag begins
 */
function scanTags(html) {
  const tags = [];
  const stack = [];
  const n = html.length;
  let i = 0;

  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt === -1) break;

    // Comments
    if (html.startsWith('<!--', lt)) {
      const e = html.indexOf('-->', lt + 4);
      i = e === -1 ? n : e + 3;
      continue;
    }

    // <!DOCTYPE ...>, <?xml ... ?>
    const next = html[lt + 1];
    if (next === '!' || next === '?') {
      const e = html.indexOf('>', lt + 2);
      i = e === -1 ? n : e + 1;
      continue;
    }

    // Closing tag
    if (next === '/') {
      CLOSE_TAG_RE.lastIndex = lt;
      const m = CLOSE_TAG_RE.exec(html);
      if (!m) { i = lt + 1; continue; }
      const name = m[1].toLowerCase();
      const closeEnd = lt + m[0].length;

      for (let s = stack.length - 1; s >= 0; s--) {
        if (tags[stack[s]].tag === name) {
          // Anything still open above it was implicitly closed here
          for (let k = stack.length - 1; k > s; k--) tags[stack[k]].end = lt;
          tags[stack[s]].end = closeEnd;
          stack.length = s;
          break;
        }
      }
      i = closeEnd;
      continue;
    }

    // Opening tag
    OPEN_TAG_RE.lastIndex = lt;
    const m = OPEN_TAG_RE.exec(html);
    if (!m) { i = lt + 1; continue; }

    const tag = m[1].toLowerCase();
    const openEnd = lt + m[0].length;
    const idx = tags.length;
    tags.push({ tag, attrs: m[2], start: lt, openEnd, end: openEnd, contentEnd: openEnd });
    i = openEnd;

    const selfClosing = /\/\s*$/.test(m[2]);
    if (VOID_TAGS.has(tag) || selfClosing) continue;

    stack.push(idx);

    // Skip over <script>/<style> content so code inside isn't read as tags
    if (RAW_TEXT_TAGS.has(tag)) {
      const re = new RegExp('</' + tag + '[\\s>]', 'ig');
      re.lastIndex = openEnd;
      const c = re.exec(html);
      tags[idx].contentEnd = c ? c.index : n;
      i = c ? c.index : n;
    }
  }

  // Elements never closed run to the end of the file
  for (const s of stack) tags[s].end = n;
  return tags;
}

// ---------------------------------------------------------------------------
// Helpers for reading <script> tags
// ---------------------------------------------------------------------------
function getAttr(attrs, name) {
  const re = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i');
  const m = re.exec(attrs);
  if (!m) return null;
  return m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]);
}

// 'jsx' = Babel script (React), 'js' = normal script, null = ignore
function scriptKind(t) {
  if (t.tag !== 'script') return null;
  if (getAttr(t.attrs, 'src') !== null) return null; // external file: nothing inline to read
  const type = (getAttr(t.attrs, 'type') || '').toLowerCase().trim();
  if (/^text\/(babel|jsx)/.test(type)) return 'jsx';
  if (type === '' || type === 'module' || /^(text|application)\/(javascript|ecmascript)/.test(type)) return 'js';
  return null; // json, importmap, templates ...
}

function tryParse(code, pluginSets) {
  if (!babelParse) return null;
  for (const plugins of pluginSets) {
    try {
      return babelParse(code, {
        sourceType: 'unambiguous',
        plugins,
        errorRecovery: true,
        allowReturnOutsideFunction: true,
        allowAwaitOutsideFunction: true
      });
    } catch (e) { /* try the next plugin set */ }
  }
  return null;
}

// Tiny recursive AST walker
const SKIP_KEYS = new Set(['loc', 'extra', 'leadingComments', 'trailingComments', 'innerComments', 'errors']);
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node) walk(n, visit);
    return;
  }
  if (typeof node.type === 'string') visit(node);
  for (const key in node) {
    if (SKIP_KEYS.has(key)) continue;
    const v = node[key];
    if (v && typeof v === 'object') walk(v, visit);
  }
}

// ---------------------------------------------------------------------------
// 2. JSX elements inside <script type="text/babel">  (React stacks)
// ---------------------------------------------------------------------------
function scanJsx(html, scriptTag) {
  const base = scriptTag.openEnd;
  const code = html.slice(base, scriptTag.contentEnd);
  const ast = tryParse(code, [['jsx'], ['jsx', 'typescript']]);
  if (!ast) return [];

  const out = [];
  walk(ast.program, (node) => {
    if (node.type !== 'JSXElement') return;
    const open = node.openingElement;
    const nm = open.name;
    let tag = null;

    if (nm.type === 'JSXIdentifier') {
      // <div> yes. <Card /> no: a component is not a DOM tag and may not pass the attribute on.
      if (/^[a-z]/.test(nm.name)) tag = nm.name;
    } else if (nm.type === 'JSXMemberExpression') {
      // <motion.div> passes data-* props to the DOM. Other <Foo.Bar> (e.g. React.Fragment) must be skipped.
      if (nm.object.type === 'JSXIdentifier' && nm.object.name === 'motion') tag = nm.property.name;
    }
    if (!tag) return;

    out.push({
      tag,
      start: base + node.start,
      openEnd: base + open.end,
      end: base + node.end,
      nameEnd: base + nm.end
    });
  });

  out.sort((a, b) => a.start - b.start);
  return out;
}

// ---------------------------------------------------------------------------
// 3. HTML written inside JS strings / template literals (HTML stacks)
//    e.g.  list.innerHTML = items.map(i => `<li class="x">${i}</li>`).join('')
// ---------------------------------------------------------------------------
function scanJsStrings(html, scriptTag) {
  const base = scriptTag.openEnd;
  const code = html.slice(base, scriptTag.contentEnd);
  if (code.indexOf('<') === -1) return [];
  const ast = tryParse(code, [[]]);
  if (!ast) return [];

  const out = [];
  const seen = new Set();

  // text = the raw text of one string, offset = where text[0] sits in the file
  function addFrom(text, offset) {
    if (text.indexOf('<') === -1) return;
    // Real markup starts with "<" or has a closing tag. Plain text such as
    // "a<b and c>d" has neither, so it is left alone.
    if (!/^\s*</.test(text) && text.indexOf('</') === -1 && text.indexOf('/>') === -1) return;
    for (const t of scanTags(text)) {
      if (!KNOWN_HTML_TAGS.has(t.tag)) continue;
      const nameEnd = offset + t.start + 1 + t.tag.length;
      if (seen.has(nameEnd)) continue;
      seen.add(nameEnd);
      out.push({
        tag: t.tag,
        start: offset + t.start,
        openEnd: offset + t.openEnd,
        end: offset + t.end,
        nameEnd,
        bare: true // inside a JS string we can't safely add quotes, so use an unquoted attribute
      });
    }
  }

  walk(ast.program, (node) => {
    if (node.type === 'StringLiteral') {
      addFrom(code.slice(node.start + 1, node.end - 1), base + node.start + 1);
    } else if (node.type === 'TemplateLiteral' && node.quasis.length) {
      // Hide every ${ ... } with "_" (same length, so all positions stay correct).
      // This way <div class="a ${x}"> is still read as one tag.
      const first = node.quasis[0].start;
      let masked = '';
      let pos = first;
      for (const q of node.quasis) {
        masked += '_'.repeat(q.start - pos) + code.slice(q.start, q.end);
        pos = q.end;
      }
      addFrom(masked, base + first);
    }
  });

  out.sort((a, b) => a.start - b.start);
  return out;
}

// ---------------------------------------------------------------------------
// Put everything together (never throws)
// ---------------------------------------------------------------------------
// HTML tags first (0..k-1), then the elements found inside scripts.
function scanAll(html) {
  const htmlTags = scanTags(html);
  const entries = htmlTags.map(t => ({
    tag: t.tag,
    start: t.start,
    openEnd: t.openEnd,
    end: t.end,
    nameEnd: t.start + 1 + t.tag.length
  }));

  for (const t of htmlTags) {
    const kind = scriptKind(t);
    if (!kind) continue;
    try {
      const found = kind === 'jsx' ? scanJsx(html, t) : scanJsStrings(html, t);
      for (const e of found) entries.push(e);
    } catch (err) {
      // a broken script must never break the preview
    }
  }
  return entries;
}

/**
 * Adds data-lumina-idx to every mapped element (preview only).
 */
function injectIndexes(html) {
  const text = normalize(html);
  const points = scanAll(text)
    .map((e, idx) => ({ at: e.nameEnd, idx, bare: !!e.bare }))
    .sort((a, b) => a.at - b.at);

  let out = '';
  let last = 0;
  for (const p of points) {
    const attr = p.bare ? ` data-lumina-idx=${p.idx} ` : ` data-lumina-idx="${p.idx}"`;
    out += text.slice(last, p.at) + attr;
    last = p.at;
  }
  return out + text.slice(last);
}

/** Compact map for the dashboard: [[start, openEnd, end, tag], ...] */
function buildTagMap(html) {
  return scanAll(normalize(html)).map(e => [e.start, e.openEnd, e.end, e.tag]);
}

/** Short fingerprint of the file, so the dashboard can detect a stale preview */
function htmlVersion(html) {
  return crypto.createHash('md5').update(normalize(html)).digest('hex').slice(0, 10);
}

module.exports = { scanTags, injectIndexes, buildTagMap, htmlVersion };