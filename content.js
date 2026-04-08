/**
 * Jyutcitzi: buffer → dictionary lookup → replace in input/textarea.
 * IME-style scrollable candidate panel (Shadow DOM so page CSS cannot hide it).
 */
(function () {
  var trie = null;
  var lookup = null;
  var ready = false;
  var loadError = null;

  var stateMap = new WeakMap();

  /** Max candidates to collect (scroll inside panel). */
  var MAX_CANDIDATES = 800;

  var hostEl = null;
  var shadow = null;
  var panelEl = null;
  var listEl = null;
  var hintEl = null;

  var menuItems = [];
  var menuHighlight = 0;
  var menuField = null;
  var ignoreNextFieldBlur = false;

  /** Bundled: Jyutcitzi merged into Source Han Sans HC (submodule jyutcitzi-fonts). */
  var PREVIEW_FONT_PATH = "fonts/JyutcitziWithSourceHanSansHCRegular.ttf";
  /** CSS family name (must match .jtc-panel / .jtc-out). */
  var PREVIEW_FONT_FAMILY = "JyutcitziSourceHanHC";

  var previewFontPromise = null;

  /**
   * @font-face inside closed Shadow DOM often fails to load chrome-extension:// URLs.
   * Register the font on the page document via FontFace + ArrayBuffer instead.
   */
  function loadPreviewFontIntoDocument() {
    if (previewFontPromise !== null) return previewFontPromise;
    previewFontPromise = (async function () {
      if (typeof FontFace === "undefined") {
        console.warn("[Jyutcitzi] FontFace API missing; preview glyphs may not render.");
        return false;
      }
      var url = chrome.runtime.getURL(PREVIEW_FONT_PATH);
      var res = await fetch(url);
      if (!res.ok) {
        console.warn(
          "[Jyutcitzi] Preview font not found (" +
            res.status +
            "). Add symlink: fonts/JyutcitziWithSourceHanSansHCRegular.ttf → jyutcitzi-fonts submodule. URL:",
          url
        );
        return false;
      }
      var buf = await res.arrayBuffer();
      var face = new FontFace(PREVIEW_FONT_FAMILY, buf, {
        weight: "400",
        style: "normal",
      });
      await face.load();
      document.fonts.add(face);
      await document.fonts.load("14px '" + PREVIEW_FONT_FAMILY + "'");
      return true;
    })().catch(function (err) {
      console.warn("[Jyutcitzi] Preview font load error:", err);
      return false;
    });
    return previewFontPromise;
  }

  function fieldState(el) {
    if (!stateMap.has(el))
      stateMap.set(el, { buffer: "" });
    return stateMap.get(el);
  }

  function resetState(el) {
    fieldState(el).buffer = "";
    hideMenu();
  }

  function isTextField(el) {
    if (!el || el.disabled || el.readOnly) return false;
    var tag = el.tagName;
    if (tag === "TEXTAREA") return true;
    if (tag === "INPUT") {
      var t = (el.type || "").toLowerCase();
      return t === "text" || t === "search" || t === "";
    }
    return false;
  }

  function ensureMenuUi() {
    if (hostEl) return;

    hostEl = document.createElement("div");
    hostEl.id = "jyutcitzi-ime-host";
    hostEl.setAttribute("data-jyutcitzi-ime", "1");
    hostEl.style.cssText =
      "position:fixed!important;inset:0!important;width:100%!important;height:100%!important;margin:0!important;padding:0!important;border:0!important;pointer-events:none!important;z-index:2147483647!important;background:transparent!important;";

    shadow = hostEl.attachShadow({ mode: "closed" });

    var css = document.createElement("style");
    css.textContent = [
      ".jtc-panel {",
      "  position: fixed;",
      "  min-width: 220px;",
      "  max-width: min(520px, 92vw);",
      "  background: #f5f5f5;",
      "  border: 1px solid #888;",
      "  border-radius: 4px;",
      "  box-shadow: 0 6px 24px rgba(0,0,0,.2);",
      "  font: 14px/1.35 '" +
        PREVIEW_FONT_FAMILY +
        "', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif;",
      "  color: #111;",
      "  pointer-events: auto;",
      "  overflow: hidden;",
      "  display: none;",
      "  flex-direction: column;",
      "}",
      ".jtc-hint {",
      "  padding: 4px 8px;",
      "  font-size: 11px;",
      "  color: #555;",
      "  background: #e8e8e8;",
      "  border-bottom: 1px solid #ccc;",
      "}",
      ".jtc-list {",
      "  max-height: min(280px, 40vh);",
      "  overflow-y: auto;",
      "  overflow-x: hidden;",
      "}",
      ".jtc-row {",
      "  display: flex;",
      "  align-items: center;",
      "  gap: 8px;",
      "  padding: 6px 10px;",
      "  cursor: pointer;",
      "  border-bottom: 1px solid #e0e0e0;",
      "}",
      ".jtc-row:last-child { border-bottom: none; }",
      ".jtc-row:hover, .jtc-row.jtc-active { background: #d6e8ff; }",
      ".jtc-num {",
      "  flex: 0 0 1.4em;",
      "  text-align: right;",
      "  color: #666;",
      "  font-size: 12px;",
      "}",
      ".jtc-key {",
      "  flex: 0 0 auto;",
      "  font-family: ui-monospace, 'Cascadia Code', 'Menlo', monospace;",
      "  font-weight: 600;",
      "  color: #0b57d0;",
      "  max-width: 45%;",
      "  overflow: hidden;",
      "  text-overflow: ellipsis;",
      "  white-space: nowrap;",
      "}",
      ".jtc-out {",
      "  flex: 1;",
      "  min-width: 0;",
      "  overflow: hidden;",
      "  text-overflow: ellipsis;",
      "  white-space: nowrap;",
      "  font-family: '" +
        PREVIEW_FONT_FAMILY +
        "', 'PingFang SC', 'Microsoft YaHei', sans-serif;",
      "}",
    ].join("\n");

    panelEl = document.createElement("div");
    panelEl.className = "jtc-panel";
    panelEl.setAttribute("role", "listbox");

    hintEl = document.createElement("div");
    hintEl.className = "jtc-hint";
    hintEl.textContent =
      "↑↓ 選擇 · Enter / Tab 確認 · 1–9 快捷 · Esc 關閉";

    listEl = document.createElement("div");
    listEl.className = "jtc-list";

    panelEl.appendChild(hintEl);
    panelEl.appendChild(listEl);

    shadow.appendChild(css);
    shadow.appendChild(panelEl);

    listEl.addEventListener(
      "mousedown",
      function (e) {
        ignoreNextFieldBlur = true;
        e.preventDefault();
      },
      true
    );

    (document.documentElement || document.body).appendChild(hostEl);
  }

  function hideMenu() {
    menuItems = [];
    menuHighlight = 0;
    menuField = null;
    if (panelEl) panelEl.style.display = "none";
  }

  function positionMenu(field) {
    if (!panelEl || panelEl.style.display === "none") return;
    var r = field.getBoundingClientRect();
    var margin = 4;
    var top = r.bottom + margin;
    var left = r.left;
    var panelH = 300;
    if (top + panelH > window.innerHeight) {
      top = Math.max(margin, r.top - panelH - margin);
    }
    if (left + 400 > window.innerWidth) {
      left = Math.max(margin, window.innerWidth - 420);
    }
    panelEl.style.left = left + "px";
    panelEl.style.top = top + "px";
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setHighlight(idx) {
    menuHighlight = Math.max(0, Math.min(menuItems.length - 1, idx));
    if (!listEl) return;
    var rows = listEl.querySelectorAll(".jtc-row");
    for (var i = 0; i < rows.length; i++) {
      rows[i].classList.toggle("jtc-active", i === menuHighlight);
    }
    var active = rows[menuHighlight];
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  function renderMenu(field, buffer) {
    ensureMenuUi();

    if (!ready || !buffer || !trie) {
      hideMenu();
      return;
    }

    var keys = trie.keysWithPrefix(buffer, MAX_CANDIDATES);
    if (!keys.length) {
      hideMenu();
      return;
    }

    menuField = field;
    menuItems = keys;
    menuHighlight = 0;

    listEl.innerHTML = "";
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var entry = lookup.get(key);
      var preview = entry ? entry.output : "";
      if (preview.length > 80) preview = preview.slice(0, 77) + "…";

      var row = document.createElement("div");
      row.className = "jtc-row" + (i === 0 ? " jtc-active" : "");
      row.setAttribute("role", "option");
      row.dataset.index = String(i);

      var num = document.createElement("span");
      num.className = "jtc-num";
      num.textContent = i < 9 ? String(i + 1) : "·";

      var kEl = document.createElement("span");
      kEl.className = "jtc-key";
      kEl.textContent = key;

      var oEl = document.createElement("span");
      oEl.className = "jtc-out";
      oEl.textContent = preview;

      row.appendChild(num);
      row.appendChild(kEl);
      row.appendChild(oEl);

      (function (idx, k, f) {
        row.addEventListener("mouseenter", function () {
          setHighlight(idx);
        });
        row.addEventListener("click", function () {
          commitKey(f, k);
        });
      })(i, key, field);

      listEl.appendChild(row);
    }

    hintEl.textContent =
      keys.length >= MAX_CANDIDATES
        ? "顯示首 " +
          MAX_CANDIDATES +
          " 項（可捲動）· ↑↓ Enter Tab · 1–9 · Esc"
        : "↑↓ 選擇 · Enter / Tab 確認 · 1–9 快捷 · Esc 關閉";

    panelEl.style.display = "flex";
    positionMenu(field);

    void loadPreviewFontIntoDocument().then(function (ok) {
      if (!ok || !menuField || menuField !== field) return;
      if (fieldState(field).buffer !== buffer) return;
      document.fonts.load("14px '" + PREVIEW_FONT_FAMILY + "'").then(function () {
        if (!menuField || menuField !== field || fieldState(field).buffer !== buffer)
          return;
        repaintMenuPreviewCells();
      });
    });
  }

  /** Re-apply preview text after fonts load (avoid recursive renderMenu). */
  function repaintMenuPreviewCells() {
    if (!listEl || !menuItems.length) return;
    var rows = listEl.querySelectorAll(".jtc-row");
    for (var i = 0; i < rows.length; i++) {
      var key = menuItems[i];
      if (!key) break;
      var oEl = rows[i].querySelector(".jtc-out");
      if (!oEl) continue;
      var entry = lookup.get(key);
      var preview = entry ? entry.output : "";
      if (preview.length > 80) preview = preview.slice(0, 77) + "…";
      oEl.textContent = preview;
    }
  }

  function menuVisible() {
    return !!(panelEl && panelEl.style.display === "flex" && menuItems.length);
  }

  function commitKey(field, key) {
    hideMenu();
    return commitKeyAtCaret(field, key);
  }

  function scheduleMenuUpdate(field) {
    requestAnimationFrame(function () {
      var st = fieldState(field);
      if (st.buffer) renderMenu(field, st.buffer);
      else hideMenu();
    });
  }

  function insertAtCaret(el, text) {
    var start = el.selectionStart;
    var end = el.selectionEnd;
    var v = el.value;
    el.value = v.slice(0, start) + text + v.slice(end);
    var pos = start + text.length;
    el.setSelectionRange(pos, pos);
  }

  function deleteRange(el, from, to) {
    var v = el.value;
    el.value = v.slice(0, from) + v.slice(to);
    el.setSelectionRange(from, from);
  }

  function longestTerminalPrefix(buf) {
    var best = null;
    for (var i = 1; i <= buf.length; i++) {
      var pre = buf.slice(0, i);
      if (trie.isTerminal(pre)) best = pre;
    }
    return best;
  }

  function commitKeyAtCaret(el, key) {
    var entry = lookup.get(key);
    if (!entry) return false;
    var caret = el.selectionStart;
    var from = caret - key.length;
    if (from < 0 || el.value.slice(from, caret) !== key) return false;
    var v = el.value;
    var end = el.selectionEnd;
    el.value = v.slice(0, from) + entry.output + v.slice(end);
    var pos = from + entry.output.length;
    el.setSelectionRange(pos, pos);
    resetState(el);
    return true;
  }

  function commitLongestTerminal(el) {
    var st = fieldState(el);
    var full = st.buffer;
    if (!full) return false;
    var key = longestTerminalPrefix(full);
    if (!key) return false;
    var caret = el.selectionStart;
    var from = caret - full.length;
    if (from < 0 || el.value.slice(from, caret) !== full) return false;
    var out = lookup.get(key).output;
    el.value = el.value.slice(0, from) + out + el.value.slice(caret);
    el.setSelectionRange(from + out.length, from + out.length);
    resetState(el);
    hideMenu();
    return true;
  }

  function tryCommitImmediate(el, buf) {
    if (!trie.exactNoExtend(buf)) return false;
    var ok = commitKeyAtCaret(el, buf);
    if (ok) hideMenu();
    return ok;
  }

  function syncBufferFromField(el) {
    var st = fieldState(el);
    if (!st.buffer) return;
    var pos = el.selectionStart;
    if (pos !== el.selectionEnd) {
      resetState(el);
      return;
    }
    var from = pos - st.buffer.length;
    if (from < 0 || el.value.slice(from, pos) !== st.buffer) resetState(el);
  }

  function printableKey(e) {
    if (e.key === " ") return " ";
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) return e.key;
    return null;
  }

  async function loadLexicon() {
    ready = false;
    loadError = null;
    hideMenu();
    try {
      var stored = await chrome.storage.local.get({ outputMode: "web" });
      var mode = stored.outputMode === "font" ? "font" : "web";
      lookup = await JyutcitziParser.loadDictionaryBundle(mode);
      trie = new JyutcitziTrie();
      trie.addAll(Array.from(lookup.keys()));
      ready = true;
    } catch (err) {
      loadError = err;
      console.error("[Jyutcitzi] load failed", err);
      ready = false;
    }
  }

  function onKeyDown(e) {
    if (!isTextField(e.target)) return;

    if (!ready) {
      if (loadError && e.key === "F12") return;
      return;
    }

    var el = e.target;
    if (e.isComposing) {
      resetState(el);
      return;
    }

    var st = fieldState(el);
    syncBufferFromField(el);

    if (menuVisible() && menuField === el) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight(menuHighlight + 1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight(menuHighlight - 1);
        return;
      }
      if (e.key === "PageDown") {
        e.preventDefault();
        setHighlight(menuHighlight + 8);
        return;
      }
      if (e.key === "PageUp") {
        e.preventDefault();
        setHighlight(menuHighlight - 8);
        return;
      }
      if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        var n = parseInt(e.key, 10) - 1;
        if (n < menuItems.length) {
          e.preventDefault();
          commitKey(el, menuItems[n]);
        }
        return;
      }
      if ((e.key === "Enter" || e.key === "Tab") && menuItems.length) {
        e.preventDefault();
        commitKey(el, menuItems[menuHighlight]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        hideMenu();
        return;
      }
    }

    if (e.key === "Escape") {
      if (st.buffer.length) {
        e.preventDefault();
        var pos = el.selectionStart;
        deleteRange(el, pos - st.buffer.length, pos);
        resetState(el);
      }
      return;
    }

    if (e.key === "Backspace") {
      if (!st.buffer.length) return;
      e.preventDefault();
      st.buffer = st.buffer.slice(0, -1);
      var pos = el.selectionStart;
      deleteRange(el, pos - 1, pos);
      scheduleMenuUpdate(el);
      return;
    }

    if (e.key === "Enter" || e.key === "Tab") {
      if (!st.buffer.length) return;
      if (trie.isTerminal(st.buffer) && trie.exactAndExtend(st.buffer)) {
        e.preventDefault();
        commitKeyAtCaret(el, st.buffer);
        hideMenu();
      }
      return;
    }

    var ch = printableKey(e);
    if (ch === null) return;

    var lower = ch >= "A" && ch <= "Z" ? ch.toLowerCase() : ch;
    var newBuf = st.buffer + lower;

    if (trie.follow(newBuf)) {
      e.preventDefault();
      insertAtCaret(el, lower);
      st.buffer = newBuf;
      if (tryCommitImmediate(el, st.buffer)) return;
      scheduleMenuUpdate(el);
      return;
    }

    if (st.buffer.length) {
      e.preventDefault();
      var prevBuf = st.buffer;
      var key = longestTerminalPrefix(prevBuf);
      if (key) {
        commitLongestTerminal(el);
      } else {
        var pos = el.selectionStart;
        deleteRange(el, pos - prevBuf.length, pos);
        resetState(el);
      }
      st = fieldState(el);
      insertAtCaret(el, lower);
      if (trie.follow(lower)) {
        st.buffer = lower;
        tryCommitImmediate(el, st.buffer);
      }
      scheduleMenuUpdate(el);
      return;
    }

    if (trie.follow(lower)) {
      e.preventDefault();
      insertAtCaret(el, lower);
      st.buffer = lower;
      if (tryCommitImmediate(el, st.buffer)) return;
      scheduleMenuUpdate(el);
      return;
    }
  }

  function onScrollOrResize() {
    if (menuField) positionMenu(menuField);
  }

  function eventPathIncludesHost(e) {
    if (!hostEl || !e.composedPath) return false;
    var path = e.composedPath();
    for (var i = 0; i < path.length; i++) {
      if (path[i] === hostEl) return true;
    }
    return false;
  }

  function onDocMouseDown(e) {
    if (!panelEl || panelEl.style.display === "none") return;
    if (eventPathIncludesHost(e)) return;
    if (isTextField(e.target) && e.target === menuField) return;
    hideMenu();
  }

  function onBlur(e) {
    if (!isTextField(e.target)) return;
    var field = e.target;
    setTimeout(function () {
      if (ignoreNextFieldBlur) {
        ignoreNextFieldBlur = false;
        return;
      }
      hideMenu();
      resetState(field);
    }, 0);
  }

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== "local" || !changes.outputMode) return;
    loadLexicon().catch(function (err) {
      console.error("[Jyutcitzi] reload failed", err);
    });
  });

  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("selectionchange", function () {
    var a = document.activeElement;
    if (a && isTextField(a)) syncBufferFromField(a);
  });
  document.addEventListener(
    "click",
    function (e) {
      if (!isTextField(e.target)) return;
      requestAnimationFrame(function () {
        syncBufferFromField(e.target);
      });
    },
    true
  );
  document.addEventListener("blur", onBlur, true);
  window.addEventListener("scroll", onScrollOrResize, true);
  window.addEventListener("resize", onScrollOrResize);
  document.addEventListener("mousedown", onDocMouseDown, true);

  loadPreviewFontIntoDocument().catch(function () {});

  loadLexicon().catch(function (err) {
    console.error("[Jyutcitzi] init failed", err);
  });
})();
