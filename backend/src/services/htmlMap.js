/**
 * HTML tag map (click-to-code helper)
 *
 * Walks the generated HTML once and records where every element starts and
 * ends in the source text. The preview server tags each element with
 * data-lumina-idx="N" (N = order of the opening tag), and the dashboard uses
 * the same numbering to find the matching code when you click an element.
 */

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

// Tags whose content is plain text / code, not markup
const RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'title']);

const OPEN_TAG_RE = /<([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/y;
const CLOSE_TAG_RE = /<\/([a-zA-Z][a-zA-Z0-9:-]*)[^>]*>/y;

/**
 * Returns an array of { tag, start, openEnd, end } in document order.
 *  start   = index of "<" of the opening tag
 *  openEnd = index right after the opening tag's ">"
 *  end     = index right after the closing tag (or openEnd if none)
 */
function scanTags(html) {
  const tags = [];
  const stack = []; // indexes (into tags) of currently open elements
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
      if (!m) {
        i = lt + 1;
        continue;
      }
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
    if (!m) {
      i = lt + 1;
      continue;
    }

    const tag = m[1].toLowerCase();
    const openEnd = lt + m[0].length;
    const idx = tags.length;
    tags.push({ tag, start: lt, openEnd, end: openEnd });
    i = openEnd;

    const selfClosing = /\/\s*$/.test(m[2]);
    if (VOID_TAGS.has(tag) || selfClosing) continue;

    stack.push(idx);

    // Skip over <script>/<style> content so code inside isn't read as tags
    if (RAW_TEXT_TAGS.has(tag)) {
      const re = new RegExp('</' + tag + '[\\s>]', 'ig');
      re.lastIndex = openEnd;
      const c = re.exec(html);
      i = c ? c.index : n;
    }
  }

  // Elements never closed run to the end of the file
  for (const s of stack) tags[s].end = n;

  return tags;
}

/**
 * Adds data-lumina-idx="N" to every opening tag (used only for the live
 * preview; the stored/deployed HTML is never changed).
 */
function injectIndexes(html) {
  const tags = scanTags(html);
  let out = '';
  let last = 0;

  tags.forEach((t, idx) => {
    const at = t.start + 1 + t.tag.length; // right after "<tagname"
    out += html.slice(last, at) + ` data-lumina-idx="${idx}"`;
    last = at;
  });

  return out + html.slice(last);
}

/**
 * Compact map for the dashboard: [[start, openEnd, end, tag], ...]
 * Offsets are computed on LF-normalized text because a browser textarea
 * converts CRLF line endings to LF.
 */
function buildTagMap(html) {
  const normalized = html.replace(/\r\n?/g, '\n');
  return scanTags(normalized).map(t => [t.start, t.openEnd, t.end, t.tag]);
}

module.exports = { scanTags, injectIndexes, buildTagMap };