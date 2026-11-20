/* TheKnack: progressive enhancement only. Every page reads in full without this file: the home page shows every
   app in a grid (its rows and the finder need the script), and the screenshot strips scroll with the keyboard. */
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
    var browse = d.getElementById("browse");
    var groups = Array.prototype.slice.call(run.querySelectorAll(".group"));
    var activeGroup = "";  /* the home has no group filter (design v4): every group is a row of its own */
    var gridView = false;  /* "Browse all": every group as a grid instead of a sideways row */
    var narrow = window.matchMedia && window.matchMedia("(max-width: 47.99rem)");

    /* THE MATCHING RULE (one place; the evidence run checks it against a table of questions).
       1. The question is folded (case and accents; Turkish dotless i and dotted capital I read as i) and split into
          words at every character that is not a letter or a digit.
       2. Words of one letter and the filler words below are dropped. When nothing is left (only filler, emoji or
          punctuation), the run is shown as with an empty box: every app, no match count and no closest match.
       3. Plain match: a question word, as typed, matches a word of an app's name or sentence (or its group's name)
          when it is that word, or that word with or without a plural ending (s, es, or y and ies); a question word of
          four letters or more also matches the start of a longer word ("track" finds "tracker"). Words begin after any
          character that is not a letter or a digit, and at a capital after a small letter ("log" finds the Log of
          WrenchLog). Nothing is matched inside a word: "do" does not find "dose", "log" does not find "blog".
       4. Stem match: a word of six letters or more ending in -ing has a stripped stem (spending: spend; saving: sav,
          save; running: run). A stripped stem, from the question word or from the app's word, matches only the stem
          itself or the stem with one of the closed endings s, es, er, ers, ed (spending and spend, tracking and
          tracker, reading and reader, fasting and fast). The start rule is never used on a stripped stem: "read" from
          "reading" does not find "Readiness", "head" from "heading" does not find "headache".
       5. When some app matches every question word by plain matches (a group's name counts), the run shows only
          those apps ("N apps match"), and the one with the highest score is the closest match: a word in the name 8,
          in the sentence 3, in the group's name 1, and 2 for every question word; a tie keeps the catalog order.
          A word found only through its stem never makes a closest match.
       6. Otherwise the run shows each app whose name or sentence matches at least one question word (plain or stem;
          a group's name does not count here), with no closest match: the apps that match more words first, then the
          higher score (a word in the name 8, in the sentence 3, 2 less each where it is only the start of a longer
          word or a stem form, and 2 for every word), then the catalog order; groups follow their first app. The status line names only the words found in the names and sentences of the apps shown
          ("N apps mention ..."). No other word is claimed.
       7. The mark covers the matched word (or, for a start match, the typed part of it); marks that touch or overlap
          join into one. */
    var FILLER = {};
    ("a an the to do i my me for of and or in on with need want app apps is how what you your we it are am be can " +
     "this that some any more most every each at by as from about into up out so if not no yes please help thing " +
     "things something get have has had will would should could lot much many very really just like")
      .split(" ").forEach(function (w) { FILLER[w] = 1; });

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
    /* The stripped stems of a word of six letters or more ending in -ing (rule 4: spending: spend; saving: sav,
       save; running: runn, run); none for any other word. */
    function stems(x) {
      if (x.length < 6 || x.slice(-3) !== "ing") return [];
      var b = x.slice(0, -3), out = [b, b + "e"];
      if (b.length > 2 && b[b.length - 1] === b[b.length - 2]) out.push(b.slice(0, -1));
      return out;
    }
    /* Rule 4: word w is stem s itself or s with one closed ending. */
    function closed(s, w) {
      return w === s || w === s + "s" || w === s + "es" || w === s + "er" || w === s + "ers" || w === s + "ed";
    }
    /* Rule 3: how many characters of word w a question word q matches (0: no match). */
    function plain(q, w) {
      if (q === w || w === q + "s" || w === q + "es" || q === w + "s" || q === w + "es") return w.length;
      if (q.length > 3 && q.slice(-3) === "ies" && w === q.slice(0, -3) + "y") return w.length;
      if (w.length > 3 && w.slice(-3) === "ies" && q === w.slice(0, -3) + "y") return w.length;
      if (q.length >= 4 && w.length > q.length && w.lastIndexOf(q, 0) === 0) return q.length;
      return 0;
    }
    /* Rule 4: does question word q match word w through a stripped stem (of q or of w)? */
    function stemmed(q, w) {
      return stems(q).some(function (s) { return closed(s, w); }) || stems(w).some(function (s) { return closed(s, q); });
    }
    function questionWords(raw) {
      var seen = {};
      return fold(raw).s.split(/[^\p{L}\p{N}]+/u).filter(function (q) {
        if (q.length < 2 || FILLER[q] || seen[q]) return false;
        seen[q] = 1;
        return true;
      });
    }

    var apps = [];
    groups.forEach(function (g) {
      var label = d.getElementById(g.getAttribute("aria-labelledby"));
      each(".tile", g, function (li) {
        var nm = li.querySelector(".dir-name"), s = li.querySelector(".dir-text");
        apps.push({ li: li, g: g, group: g.getAttribute("data-group"), nm: nm, s: s,
          nameText: nm.textContent, sayText: s.textContent, name: wordsOf(nm.textContent), say: wordsOf(s.textContent),
          gname: wordsOf(label ? label.textContent : "") });
      });
    });

    /* Every place question word q matches in a text's words: [{at, len}] in folded positions; with stem true, the
       stem matches (rule 4) as well as the plain ones. */
    function find(text, q, stem) {
      var hits = [];
      text.words.forEach(function (x) {
        var n = plain(q, x.w), whole = n === x.w.length;
        if (!n && stem && stemmed(q, x.w)) n = x.w.length;
        if (n) hits.push({ at: x.at, len: n, whole: whole });
      });
      return hits;
    }
    /* An app against the question words, both ways: plain (rule 5: name, sentence and group's name, plain matches
       only) and some (rule 6: name and sentence only, plain or stem matches). */
    function score(app, qs) {
      var p = { matched: 0, score: 0, nameHits: [], sayHits: [] };
      var s = { matched: 0, score: 0, nameHits: [], sayHits: [], found: {} };
      qs.forEach(function (q) {
        var nh = find(app.name, q, false), sh = find(app.say, q, false), gh = find(app.gname, q, false).length > 0;
        if (nh.length || sh.length || gh) {
          p.matched++;
          p.score += (nh.length ? 8 : 0) + (sh.length ? 3 : 0) + (gh ? 1 : 0) + 2;
          p.nameHits = p.nameHits.concat(nh);
          p.sayHits = p.sayHits.concat(sh);
        }
        var ns = find(app.name, q, true), ss = find(app.say, q, true);
        if (ns.length || ss.length) {
          s.matched++;
          s.found[q] = 1;
          var wn = ns.some(function (h) { return h.whole; }), ws = ss.some(function (h) { return h.whole; });
          s.score += (ns.length ? (wn ? 8 : 6) : 0) + (ss.length ? (ws ? 3 : 1) : 0) + 2;
          s.nameHits = s.nameHits.concat(ns);
          s.sayHits = s.sayHits.concat(ss);
        }
      });
      return { plain: p, some: s };
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
      /* Replacement by function, so special replacement patterns in a typed question stay exactly as typed. */
      return s.replace("{n}", String(n)).replace("{group}", function () { return fill.group || ""; })
        .replace("{q}", function () { return fill.q || ""; });
    }
    function groupLabel(key) {
      var g = d.getElementById("g-" + key + "-h");
      return g ? g.textContent : "";
    }

    /* "Browse all N apps": every group as a grid, so every app is in view without sideways scrolling; it also
       empties the box. Pressed again ("Show the rows") it puts the rows back. */
    browse.addEventListener("click", function () {
      var wasAsked = !!input.value.trim();
      input.value = "";
      gridView = wasAsked ? true : !gridView;
      update();
    });

    /* The run in catalog order, kept so that a ranked run (rule 5) can be put back. */
    var order = groups.map(function (g) { return { g: g, list: g.querySelector(".row"), items: Array.prototype.slice.call(g.querySelectorAll(".tile")) }; });
    function arrange(rank) {
      var gs = order.map(function (o, i) {
        var items = o.items.map(function (li, k) { return { li: li, k: k, r: rank ? rank(li) : 0 }; });
        items.sort(function (x, y) { return y.r - x.r || x.k - y.k; });
        return { o: o, i: i, items: items, top: items.length ? items[0].r : 0 };
      });
      gs.sort(function (x, y) { return y.top - x.top || x.i - y.i; });
      /* Nodes move only when the order changes (a moved node would lose focus). */
      function place(parent, nodes) {
        var now = Array.prototype.filter.call(parent.children, function (c) { return nodes.indexOf(c) !== -1; });
        if (now.some(function (c, i) { return c !== nodes[i]; })) nodes.forEach(function (c) { parent.appendChild(c); });
      }
      gs.forEach(function (x) { place(x.o.list, x.items.map(function (it) { return it.li; })); });
      place(run, gs.map(function (x) { return x.o.g; }));
    }
    function quoted(s) { return status.getAttribute("data-quote-open") + s + status.getAttribute("data-quote-close"); }
    function apply() {
      var raw = input.value.trim();
      var toks = questionWords(raw);
      var asked = toks.length > 0;  /* false: empty, or only filler, emoji or punctuation (the neutral state) */
      var results = apps.map(function (a) {
        return { a: a, r: asked ? score(a, toks) : null };
      });
      var inGroup = function (x) { return !activeGroup || x.a.group === activeGroup; };
      var full = results.filter(function (x) { return inGroup(x) && asked && x.r.plain.matched === toks.length; });
      var some = results.filter(function (x) { return inGroup(x) && asked && x.r.some.matched > 0; });
      var mode = !asked ? "all" : full.length ? "full" : some.length ? "some" : "none";
      var shown = mode === "all" ? results.filter(inGroup) : mode === "full" ? full : some;
      results.forEach(function (x) {
        var show = shown.indexOf(x) !== -1, r = show && x.r ? (mode === "full" ? x.r.plain : x.r.some) : null;
        x.a.li.hidden = !show;
        paint(x.a.nm, x.a.nameText, x.a.name.f, r ? r.nameHits : []);
        paint(x.a.s, x.a.sayText, x.a.say.f, r ? r.sayHits : []);
      });
      /* Rule 6: more of the words first, then the higher score; otherwise the catalog order. */
      var byLi = new Map(results.map(function (x) { return [x.a.li, x.r ? x.r.some.matched * 1000 + x.r.some.score : 0]; }));
      arrange(mode === "some" ? function (li) { return byLi.get(li) || 0; } : null);
      /* Rule 5: the closest match steps forward: a copy of its tile, larger, first on the grid; its own tile leaves. */
      while (lead.firstChild) lead.removeChild(lead.firstChild);
      lead.hidden = true;
      if (mode === "full") {
        var top = full.slice().sort(function (x, y) { return y.r.plain.score - x.r.plain.score; })[0].a;
        var list = make("ul", { "class": "row" });
        list.appendChild(top.li.cloneNode(true));
        lead.appendChild(list);
        lead.hidden = false;
        top.li.hidden = true;
      }
      groups.forEach(function (g) { g.hidden = !g.querySelector(".tile:not([hidden])"); });
      /* Rows (no attribute), every group as a grid ("grid"), or one grid of the matches ("search"). */
      var view = asked ? "search" : gridView ? "grid" : "";
      if ((run.getAttribute("data-view") || "") !== view) {
        if (view) run.setAttribute("data-view", view); else run.removeAttribute("data-view");
        shelvesChanged();
      }
      browse.setAttribute("aria-pressed", String(view === "grid"));
      var label = browse.getAttribute(view === "grid" ? "data-on" : "data-off");
      if (browse.textContent !== label) browse.textContent = label;
      var n = shown.length, q = raw ? quoted(raw) : "";
      var group = activeGroup ? groupLabel(activeGroup) : "";
      var text;
      if (mode === "none") text = activeGroup ? msg("none-group", 0, { q: q, group: group }) : msg("none", 0, { q: q });
      else if (mode === "full") text = activeGroup ? msg("match-group", n, { q: q, group: group }) : msg("match", n, { q: q });
      else if (mode === "some") {
        /* Only the words found in the name or sentence of a shown app, in the order typed. */
        var words = toks.filter(function (w) { return some.some(function (x) { return x.r.some.found[w]; }); }).map(quoted);
        var said = words.length < 2 ? words.join("") : words.slice(0, -1).join(", ") + " " + status.getAttribute("data-or") + " " + words[words.length - 1];
        text = activeGroup ? msg("mention-group", n, { q: said, group: group }) : msg("mention", n, { q: said });
      }
      else if (activeGroup) text = msg("group", n, { group: group });
      else text = status.getAttribute("data-all");
      if (status.textContent !== text) status.textContent = text;
      clear.hidden = !raw;
    }
    var running = null;
    function update() {
      if (running && running.skipTransition) running.skipTransition();
      if (d.startViewTransition && !reduced()) {
        running = d.startViewTransition(apply);
        /* A transition skipped by the next keystroke rejects its promises: expected, not an error. */
        ["ready", "finished", "updateCallbackDone"].forEach(function (k) {
          if (running[k] && running[k].catch) running[k].catch(function () {});
        });
      } else apply();
    }
    function firstResult() {
      return lead.querySelector("a") || run.querySelector(".group:not([hidden]) .tile:not([hidden]) a");
    }
    /* When the box goes from empty to holding words (the first letter typed, or a paste), the search takes the stage
       on every screen: the page scrolls so the question and its box sit at the top of the window (on a narrow screen
       the box itself, as on focus below), with the results under them. Further letters, clearing the box and Clear
       do not move the page. */
    var ask = finder.closest(".ask") || finder, held = !!input.value;
    var question = ask.querySelector(".question");
    /* On a narrow screen: the box at the top of the window and the question just above it, wholly out of view (never
       cut through its letters). The letters' descenders paint a little below the heading's box, so the page goes 4 px
       further; on a phone the box sits 10 px under the question (site.css), so it keeps 6 px of air above it. */
    function boxTop() {
      return question ? question.getBoundingClientRect().bottom + 4 : finder.getBoundingClientRect().top - 12;
    }
    input.addEventListener("input", function () {
      var has = !!input.value;
      if (has && !held) {
        var top = narrow && narrow.matches ? boxTop() : ask.getBoundingClientRect().top;
        if (Math.abs(top) > 2) window.scrollTo({ top: window.pageYOffset + top, behavior: motion() });
      }
      held = has;
      update();
    });
    /* On a narrow screen the box moves to the top of the window when it takes focus, so the first results sit above
       the on-screen keyboard; on a wide screen nothing moves on focus. */
    input.addEventListener("focus", function () {
      if (!narrow || !narrow.matches) return;
      var top = boxTop();
      if (Math.abs(top) > 2) window.scrollTo({ top: window.pageYOffset + top, behavior: motion() });
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && input.value) { input.value = ""; held = false; update(); }
      if ((e.key === "ArrowDown" || e.key === "Enter") && input.value.trim()) {
        var link = firstResult();
        if (link) link.focus();
      }
    });
    clear.addEventListener("click", function () { input.value = ""; held = false; update(); input.focus(); });
    finder.hidden = false;
    status.hidden = false;
    browse.hidden = false;
    apply();
  }

  /* ------------------------------------------------------------ rows (home page) */
  /* Each row scrolls sideways (native scrolling with snap). With the script: previous and next buttons in the row's
     head (pointer screens, by CSS; disabled at the ends, hidden when the row fits), a fade at each end that still
     has more, and a tile whose link takes keyboard focus is brought fully into view, clear of the fades. */
  var shelves;  /* set below; the finder's first apply() runs before the rows exist */
  function shelfState(s) {
    var row = s.row, max = row.scrollWidth - row.clientWidth - 2, x = Math.abs(row.scrollLeft);
    var fits = max <= 2 || !!(run && run.getAttribute("data-view"));
    s.frame.classList.toggle("fits", fits);
    s.frame.classList.toggle("not-start", !fits && x > 2);
    s.frame.classList.toggle("at-end", !fits && x >= max);
    s.prev.disabled = fits || x <= 2;
    s.next.disabled = fits || x >= max;
    s.nav.hidden = fits;
  }
  function shelvesChanged() { if (shelves) shelves.forEach(shelfState); }
  shelves = [];
  each(".shelf", null, function (shelf) {
    var frame = shelf.querySelector(".shelf-frame"), row = shelf.querySelector(".row"), head = shelf.querySelector(".shelf-head");
    if (!frame || !row || !head) return;
    var s = { frame: frame, row: row, nav: make("div", { "class": "shelf-nav" }) };
    var rtl = getComputedStyle(row).direction === "rtl";
    [["prev", -1], ["next", 1]].forEach(function (p) {
      var b = make("button", { type: "button", "aria-label": shelf.getAttribute("data-" + p[0]) });
      b.appendChild(make("span", { "class": "chev " + ((p[1] > 0) === rtl ? "left" : "right"), "aria-hidden": "true" }));
      b.addEventListener("click", function () {
        row.scrollBy({ left: p[1] * (rtl ? -1 : 1) * row.clientWidth * 0.85, behavior: motion() });
      });
      s.nav.appendChild(b);
      s[p[0]] = b;
    });
    head.appendChild(s.nav);
    row.addEventListener("scroll", function () { shelfState(s); }, { passive: true });
    /* Focus inside a tile: the whole tile comes into view, clear of the fades (rows only; the grids do not scroll). */
    row.addEventListener("focusin", function (e) {
      var tile = e.target.closest(".tile");
      if (!tile || run.getAttribute("data-view")) return;
      var fr = row.getBoundingClientRect(), tr = tile.getBoundingClientRect();
      var pad = parseFloat(getComputedStyle(row).paddingInlineStart) || 16;
      var fade = Math.max(pad, parseFloat(getComputedStyle(frame, "::after").width) || pad);
      /* The row snaps to a tile's start, so it moves to a snap point: this tile's own when it is cut at the start,
         otherwise the first tile start at which this tile ends clear of the fade (the row's end when there is none). */
      var dx = 0, starts = rtl ? function (t) { return fr.right - pad - t.getBoundingClientRect().right; }
                                : function (t) { return t.getBoundingClientRect().left - fr.left - pad; };
      /* (A scroll by a fraction of a pixel would still move a snapping row to the next snap point: 1 px of slack.) */
      var cutStart = starts(tile) < -1;
      var over = rtl ? fr.left + fade - tr.left : tr.right - fr.right + fade;
      if (cutStart) dx = starts(tile);
      else if (over > 1) {
        dx = Math.abs(row.scrollWidth - row.clientWidth) - Math.abs(row.scrollLeft);
        for (var i = 0; i < row.children.length; i++) {
          var from = starts(row.children[i]);
          if (from >= over - 1) { dx = Math.min(dx, from); break; }
        }
      }
      if (Math.abs(dx) >= 1) row.scrollBy({ left: (rtl ? -1 : 1) * dx, behavior: motion() });
      /* After the browser's own scroll to the link (smooth when motion is allowed), keep the whole tile, and its
         row's head when there is room, in the window. */
      var done = false;
      function keep() {
        if (done) return;
        done = true;
        window.removeEventListener("scrollend", keep);
        var b = tile.getBoundingClientRect();
        var top = (b.height + 80 < window.innerHeight ? head.getBoundingClientRect().top : b.top) - 12;
        var dy = top < 0 ? top : b.bottom + 12 > window.innerHeight ? b.bottom + 12 - window.innerHeight : 0;
        if (dy) window.scrollBy({ top: dy, behavior: "instant" });
      }
      if (reduced()) window.requestAnimationFrame(keep);
      else { window.addEventListener("scrollend", keep); window.setTimeout(keep, 700); }
    });
    shelves.push(s);
    shelfState(s);
  });
  window.addEventListener("resize", shelvesChanged, { passive: true });

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
