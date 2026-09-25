const START = '<!--VIS-SAFETY-START-->';
const END = '<!--VIS-SAFETY-END-->';

const SAFETY_SCRIPT = `${START}
<script>
window.addEventListener('load', function () {
  if (window.__SKIP_SAFETY_NET__) return;   // <-- add this line
  setTimeout(function () {
    function rgba(c) { var m = c.match(/[\\d.]+/g) || [0,0,0,0]; return { r:+m[0], g:+m[1], b:+m[2], a: m.length > 3 ? +m[3] : 1 }; }
    function lum(c) {
      return [c.r, c.g, c.b].map(function (v) { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); })
        .reduce(function (s, v, i) { return s + v * [0.2126, 0.7152, 0.0722][i]; }, 0);
    }
    function ratio(a, b) { var l1 = Math.max(a,b), l2 = Math.min(a,b); return (l1+0.05)/(l2+0.05); }
    function effectiveBg(el) {
      while (el) {
        var s = getComputedStyle(el);
        if (s.backgroundImage !== 'none') return null;
        var c = rgba(s.backgroundColor);
        if (c.a > 0.05) return c;
        el = el.parentElement;
      }
      return { r:255, g:255, b:255, a:1 };
    }

    // 1) sections stuck hidden (opacity 0)
    document.querySelectorAll('section, section > *').forEach(function (el) {
      if (getComputedStyle(el).opacity === '0') { el.style.opacity = '1'; el.style.transform = 'none'; }
    });

    // 2) text with almost the same color as its background
    document.querySelectorAll('section h1, section h2, section h3, section p, section span, section li').forEach(function (el) {
      if (!el.textContent.trim()) return;
      var bg = effectiveBg(el);
      if (!bg) return;
      var fg = rgba(getComputedStyle(el).color);
      if (ratio(lum(fg), lum(bg)) < 3) {
        if (lum(bg) < 0.4) {
          el.style.setProperty('color', '#f8fafc', 'important');
        } else {
          var sec = el.closest('section');
          if (sec) sec.style.backgroundColor = '#1e293b';
        }
      }
    });
  }, 1500);
});
</script>
${END}`;

const STRIP_RE = new RegExp(START + '[\\s\\S]*?' + END, 'g');

// remove our script (used before sending HTML to the AI)
function stripSafetyNet(html) {
  return (html || '').replace(STRIP_RE, '');
}

// add our script exactly once (used after the AI is done)
function injectSafetyNet(html) {
  const clean = stripSafetyNet(html);
  if (/<\/body>/i.test(clean)) return clean.replace(/<\/body>/i, () => SAFETY_SCRIPT + '</body>');
  return clean + SAFETY_SCRIPT;
}

module.exports = { injectSafetyNet, stripSafetyNet };