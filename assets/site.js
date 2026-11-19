/* TheKnack: progressive enhancement only. Every page reads in full without this file: the home page lists every
   app, its purposes are plain links to their groups, and the screenshot strips scroll with the keyboard. */
(function () {
  "use strict";
  var d = document;
  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  function reduced() { return !!(still && still.matches); }
  function motion() { return reduced() ? "auto" : "smooth"; }
  function make(tag, attrs, text) {
    var el = d.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    if (text) el.textContent = text;
    return el;
  }
  function each(sel, root, fn) { Array.prototype.forEach.call((root || d).querySelectorAll(sel), fn); }

  /* ------------------------------------------------------------ the finder (home page) */
  var finder = d.getElementById("finder");
  var run = d.getElementById("apps");
  if (finder && run) {
    var input = d.getElementById("q");
    var clear = finder.querySelector(".clear");
    var status = d.getElementById("finder-status");
    var lead = d.getElementById("lead");
    var lang = d.documentElement.lang || "en";
    var rules = window.Intl && Intl.PluralRules ? new Intl.PluralRules(lang) : null;
    var groups = Array.prototype.slice.call(run.querySelectorAll(".group"));
    var activeGroup = "";
    var narrow = window.matchMedia && window.matchMedia("(max-width: 47.99rem)");

    /* THE MATCHING RULE (one place; the evidence run checks it against a table of questions).
       1. The question is folded (case and accents; Turkish dotless i and dotted capital I read as i) and split into
          words at every character that is not a letter or a digit.
       2. Words of one letter and the filler words below are dropped. When nothing is left (only filler, emoji or
          punctuation), the run is shown as with an empty box: every app, no match count and no closest match.
       3. A question word matches a word of an app's name or sentence (or its group's name) when it is that word, or
          that word with or without a plural ending (s, es, or y and ies), in either direction; a question word of
          four letters or more also matches the start of a longer word. Words begin after any character that is not
          a letter or a digit, and at a capital after a small letter ("log" finds the Log of WrenchLog). Nothing is
          matched inside a word: "do" does not find "dose", "log" does not find "blog".
       4. An app is shown when at least half of the question words match it. Score: a word in the name 8, in the
          sentence 3, in the group's name 1, and 2 for every question word that matched; the highest score is the
          closest match, and a tie keeps the catalog order.
       5. The mark covers the matched word (or, for a start match, the typed part of it); marks that touch or overlap
          join into one. */
    var FILLER = { a: 1, an: 1, the: 1, to: 1, "do": 1, i: 1, my: 1, me: 1, "for": 1, of: 1, and: 1, or: 1,
      "in": 1, on: 1, "with": 1, need: 1, want: 1, app: 1, apps: 1, is: 1, how: 1 };

    /* Case and accents folded; U+0131 and U+0130 read as a plain i. Returns the folded text and, for each folded
       character, its index in the original, so marks land on the original text. */
    function fold(s) {
      var out = "", map = [];
      for (var i = 0; i < s.length; i++) {
        var c = s[i];
        if (c === "\u0131" || c === "\u0130") c = "i";
        c = c.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        for (var k = 0; k < c.length; k++) { out += c[k]; map.push(i); }
      }
      return { s: out, map: map };
    }
    /* The words of a text (rule 3): each run of letters and digits, and each part of it that starts at a capital
       after a small letter. Positions are in the folded text. */
    function wordsOf(text) {
      var f = fold(text), out = [], re = /[\p{L}\p{N}]+/gu, m;
      while ((m = re.exec(f.s))) {
        var at = m.index, w = m[0], cuts = [0];
        out.push({ w: w, at: at });
        for (var k = 1; k < w.length; k++) {
          var o = f.map[at + k], p = f.map[at + k - 1];
          if (o !== p && /\p{Lu}/u.test(text[o]) && /\p{Ll}/u.test(text[p])) cuts.push(k);
        }
        if (cuts.length > 1) {
          cuts.push(w.length);
          for (var c = 0; c < cuts.length - 1; c++) out.push({ w: w.slice(cuts[c], cuts[c + 1]), at: at + cuts[c] });
        }
      }
      return { f: f, words: out };
    }
    /* How many characters of word w a question word q matches (0: no match). */
    function matches(q, w) {
      if (q === w || w === q + "s" || w === q + "es" || q === w + "s" || q === w + "es") return w.length;
      if (q.length > 3 && q.slice(-3) === "ies" && w === q.slice(0, -3) + "y") return w.length;
      if (w.length > 3 && w.slice(-3) === "ies" && q === w.slice(0, -3) + "y") return w.length;
      if (q.length >= 4 && w.length > q.length && w.lastIndexOf(q, 0) === 0) return q.length;
      return 0;
    }
    function questionWords(raw) {
      return fold(raw).s.split(/[^\p{L}\p{N}]+/u).filter(function (q) { return q.length >= 2 && !FILLER[q]; });
    }

    var apps = [];
    groups.forEach(function (g) {
      var label = d.getElementById(g.getAttribute("aria-labelledby"));
      each(".band", g, function (li) {
        var nm = li.querySelector(".dir-name"), s = li.querySelector(".dir-text");
        apps.push({ li: li, g: g, group: g.getAttribute("data-group"), nm: nm, s: s,
          nameText: nm.textContent, sayText: s.textContent, name: wordsOf(nm.textContent), say: wordsOf(s.textContent),
          gname: wordsOf(label ? label.textContent : "") });
      });
    });

    /* Every place question word q matches in a text's words: [{at, len}] in folded positions. */
    function find(text, q) {
      var hits = [];
      text.words.forEach(function (x) {
        var n = matches(q, x.w);
        if (n) hits.push({ at: x.at, len: n });
      });
      return hits;
    }
    function score(app, qs) {
      var total = 0, matched = 0, nameHits = [], sayHits = [];
      qs.forEach(function (q) {
        var nh = find(app.name, q), sh = find(app.say, q), gh = find(app.gname, q).length > 0;
        if (!nh.length && !sh.length && !gh) return;
        matched++;
        total += (nh.length ? 8 : 0) + (sh.length ? 3 : 0) + (gh ? 1 : 0) + 2;
        nameHits = nameHits.concat(nh);
        sayHits = sayHits.concat(sh);
      });
      return { ok: matched > 0 && matched >= Math.ceil(qs.length / 2), score: total, nameHits: nameHits, sayHits: sayHits };
    }
    /* Rewrite an element as text nodes, with <mark> around each hit. */
    function paint(el, text, folded, hits) {
      while (el.firstChild) el.removeChild(el.firstChild);
      if (!hits.length) { el.appendChild(d.createTextNode(text)); return; }
      var spans = hits.map(function (h) { return [folded.map[h.at], folded.map[h.at + h.len - 1] + 1]; })
        .sort(function (a, b) { return a[0] - b[0]; });
      var merged = [];
      spans.forEach(function (m) {
        var last = merged[merged.length - 1];
        if (last && m[0] <= last[1]) last[1] = Math.max(last[1], m[1]); else merged.push(m.slice());
      });
      var pos = 0;
      merged.forEach(function (m) {
        if (m[0] > pos) el.appendChild(d.createTextNode(text.slice(pos, m[0])));
        el.appendChild(make("mark", {}, text.slice(m[0], m[1])));
        pos = m[1];
      });
      if (pos < text.length) el.appendChild(d.createTextNode(text.slice(pos)));
    }

    /* Messages come from the page; the plural form is chosen by the browser's rules for the page language. */
    function msg(key, n, fill) {
      var cat = rules ? rules.select(n) : (n === 1 ? "one" : "other");
      var s = status.getAttribute("data-" + key + "-" + cat) || status.getAttribute("data-" + key + "-other") ||
        status.getAttribute("data-" + key) || "";
      return s.replace("{n}", String(n)).replace("{group}", fill.group || "").replace("{q}", fill.q || "");
    }
    function groupLabel(key) {
      var g = d.getElementById("g-" + key + "-h");
      return g ? g.textContent : "";
    }

    /* Purposes: with the script they are toggle buttons that narrow the run (without it, links to the groups). */
    var purposes = [];
    each(".purpose", null, function (a) {
      var b = make("button", { type: "button", "class": "purpose", "data-group": a.getAttribute("data-group"),
        "aria-pressed": "false" });
      while (a.firstChild) b.appendChild(a.firstChild);
      a.parentNode.replaceChild(b, a);
      /* In the sideways row of a narrow screen a button that takes focus scrolls fully into view. */
      b.addEventListener("focus", function () {
        b.scrollIntoView({ block: "nearest", inline: "nearest", behavior: motion() });
      });
      b.addEventListener("click", function () {
        var g = b.getAttribute("data-group");
        /* "Browse all" shows every app: it also empties the box. A group toggles. */
        if (!g) input.value = "";
        activeGroup = g === activeGroup ? "" : g;
        update();
      });
      purposes.push(b);
    });

    function apply() {
      var raw = input.value.trim();
      var toks = questionWords(raw);
      var asked = toks.length > 0;  /* false: empty, or only filler, emoji or punctuation (the neutral state) */
      var shown = [];
      apps.forEach(function (a) {
        var r = asked ? score(a, toks) : { ok: true, score: 0, nameHits: [], sayHits: [] };
        var show = (!activeGroup || a.group === activeGroup) && r.ok;
        a.li.hidden = !show;
        paint(a.nm, a.nameText, a.name.f, show ? r.nameHits : []);
        paint(a.s, a.sayText, a.say.f, show ? r.sayHits : []);
        if (show) shown.push({ a: a, score: r.score });
      });
      /* The closest match steps forward: a copy of its band, larger, above the run; its own band leaves the run. */
      while (lead.firstChild) lead.removeChild(lead.firstChild);
      lead.hidden = true;
      if (asked && shown.length) {
        shown.sort(function (x, y) { return y.score - x.score; });
        var top = shown[0].a;
        var list = make("ul", { "class": "bands" });
        list.appendChild(top.li.cloneNode(true));
        lead.appendChild(list);
        lead.hidden = false;
        top.li.hidden = true;
      }
      groups.forEach(function (g) { g.hidden = !g.querySelector(".band:not([hidden])"); });
      var n = shown.length, q = raw ? status.getAttribute("data-quote-open") + raw + status.getAttribute("data-quote-close") : "";
      var group = activeGroup ? groupLabel(activeGroup) : "";
      var text;
      if (asked && !n) text = activeGroup ? msg("none-group", 0, { q: q, group: group }) : msg("none", 0, { q: q });
      else if (asked) text = activeGroup ? msg("match-group", n, { q: q, group: group }) : msg("match", n, { q: q });
      else if (activeGroup) text = msg("group", n, { group: group });
      else text = status.getAttribute("data-all");
      if (status.textContent !== text) status.textContent = text;
      clear.hidden = !raw;
      purposes.forEach(function (p) { p.setAttribute("aria-pressed", String(p.getAttribute("data-group") === activeGroup)); });
    }
    var running = null;
    function update() {
      if (running && running.skipTransition) running.skipTransition();
      if (d.startViewTransition && !reduced()) running = d.startViewTransition(apply); else apply();
    }
    function firstResult() {
      return lead.querySelector("a") || run.querySelector(".band:not([hidden]) a");
    }
    input.addEventListener("input", update);
    /* On a narrow screen the box moves to the top of the window when it takes focus, so the first results sit above
       the on-screen keyboard; on a wide screen nothing moves. */
    input.addEventListener("focus", function () {
      if (!narrow || !narrow.matches) return;
      var top = finder.getBoundingClientRect().top - 12;
      if (Math.abs(top) > 2) window.scrollTo({ top: window.pageYOffset + top, behavior: motion() });
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && input.value) { input.value = ""; update(); }
      if ((e.key === "ArrowDown" || e.key === "Enter") && input.value.trim()) {
        var link = firstResult();
        if (link) link.focus();
      }
    });
    clear.addEventListener("click", function () { input.value = ""; update(); input.focus(); });
    finder.hidden = false;
    status.hidden = false;
    apply();
  }

  /* ------------------------------------------------------------ screenshot strips (app pages) */
  /* A strip wider than the screen becomes a tab stop (it scrolls with the arrow keys) and gets previous and next
     buttons; a strip that fits is never a stop. The markup has no tab stop. */
  function scrolls(strip) { return strip.scrollWidth > strip.clientWidth + 8; }
  function focusable() {
    each(".shots", null, function (strip) {
      if (scrolls(strip)) strip.setAttribute("tabindex", "0"); else strip.removeAttribute("tabindex");
    });
  }
  focusable();
  window.addEventListener("resize", focusable, { passive: true });
  each(".shots", null, function (strip) {
    var head = strip.parentNode.querySelector(".shots-head");
    if (!head || !scrolls(strip)) return;
    var nav = make("div", { "class": "shots-nav" });
    var rtl = getComputedStyle(strip).direction === "rtl";
    [["prev", -1], ["next", 1]].forEach(function (p) {
      var b = make("button", { type: "button", "aria-label": strip.getAttribute("data-" + p[0]) });
      b.appendChild(make("span", { "class": "chev " + ((p[1] > 0) === rtl ? "left" : "right"), "aria-hidden": "true" }));
      b.addEventListener("click", function () {
        strip.scrollBy({ left: p[1] * (rtl ? -1 : 1) * strip.clientWidth * 0.8, behavior: motion() });
      });
      nav.appendChild(b);
    });
    function state() {
      var max = strip.scrollWidth - strip.clientWidth - 2;
      var x = Math.abs(strip.scrollLeft);
      nav.children[0].disabled = x <= 2;
      nav.children[1].disabled = x >= max;
    }
    strip.addEventListener("scroll", state, { passive: true });
    head.appendChild(nav);
    state();
  });

  /* ------------------------------------------------------------ section list (app pages) */
  /* The current section is the last one whose heading has reached the top of the window (the page has no sticky
     bar; anchors land 16 px below the edge). At the end of the page, where the last headings cannot reach the top,
     the last heading in view is current. A click marks the clicked section and keeps it until the reader scrolls. */
  var toc = d.querySelector(".toc");
  if (toc) {
    var items = [];
    each("a", toc, function (a) {
      var t = d.getElementById(a.getAttribute("href").slice(1));
      if (t && t.tagName === "SECTION") t = t.querySelector("h2") || t;
      if (t) items.push({ a: a, h: t });
    });
    var current = null, pinned = false, ticking = false;
    function mark(a) {
      if (a === current) return;
      if (current) current.removeAttribute("aria-current");
      current = a;
      if (a) a.setAttribute("aria-current", "true");
    }
    function spy() {
      ticking = false;
      if (pinned || !items.length) return;
      var line = 40, found = null;
      items.forEach(function (it) { if (it.h.getBoundingClientRect().top <= line) found = it; });
      var end = window.innerHeight + window.scrollY >= d.documentElement.scrollHeight - 2;
      if (end) {
        items.forEach(function (it) { var r = it.h.getBoundingClientRect(); if (r.top < window.innerHeight) found = it; });
      }
      mark(found ? found.a : null);
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(spy); }
    }, { passive: true });
    ["wheel", "touchstart", "keydown"].forEach(function (ev) {
      window.addEventListener(ev, function (e) {
        if (ev === "keydown" && (e.key === "Enter" || e.key === " " || e.key === "Tab" || e.key === "Shift")) return;
        pinned = false;
      }, { passive: true });
    });
    items.forEach(function (it) { it.a.addEventListener("click", function () { mark(it.a); pinned = true; }); });
    spy();
  }
})();
