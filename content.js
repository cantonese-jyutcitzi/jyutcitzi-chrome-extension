/**
 * Jyutcitzi: buffer → dictionary lookup → replace in input/textarea.
 * IME-style scrollable candidate panel (Shadow DOM so page CSS cannot hide it).
 */
(function () {
  var trie = null;
  /** Prefix trie on tone-stripped keys (concatenated toneless Jyutping). */
  var tlRoot = null;
  var lookup = null;
  var ready = false;
  var loadError = null;
  /** When false, keys pass through (popup). */
  var imeEnabled = true;
  /**
   * Toggled on each Escape in a text field: while true, Jyutcitzi does not intercept.
   */
  var extensionPaused = false;

  var stateMap = new WeakMap();

  /** Max candidates to collect (scroll inside panel). */
  var MAX_CANDIDATES = 800;
  /** When matching space-omitted phrases, scan more trie leaves before filtering. */
  var PREFIX_SCAN_CAP = 5000;

  var hostEl = null;
  var shadow = null;
  var panelEl = null;
  var listEl = null;
  var hintEl = null;

  /** Each entry: { type: "dict", key } or { type: "seg", k1, k2, label }. */
  var menuRows = [];
  var menuHighlight = 0;
  var menuField = null;
  /** True while candidate list is shown; do not rely on panelEl.style alone. */
  var menuOpen = false;
  var ignoreNextFieldBlur = false;

  function isSpaceKey(e) {
    return e.key === " " || e.code === "Space";
  }

  /** Bundled: Jyutcitzi merged into Source Han Sans HC (submodule jyutcitzi-fonts). */
  var PREVIEW_FONT_PATH = "fonts/JyutcitziWithSourceHanSansHCRegular.ttf";
  /** CSS family name (must match .jtc-panel / .jtc-out). */
  var PREVIEW_FONT_FAMILY = "JyutcitziSourceHanHC";
  /** Injected @font-face for page text; unicode-range limits to PUA only. */
  var GLOBAL_PUA_FONT_FAMILY = "JyutcitziPUAFallback";
  var GLOBAL_PUA_STYLE_ID = "jyutcitzi-global-pua-font";

  var previewFontPromise = null;
  /** Opt-in: inject document-level font stack so PUA glyphs resolve (see popup). */
  var globalPuaFontRendering = false;

  /**
   * @font-face inside closed Shadow DOM often fails to load chrome-extension:// URLs.
   * Register the font on the page document via FontFace + ArrayBuffer instead.
   */
  function loadPreviewFontIntoDocument() {
    if (previewFontPromise !== null) return previewFontPromise;
    previewFontPromise = (async function () {
      if (typeof FontFace === "undefined") {
        console.warn(
          "[Jyutcitzi] FontFace API missing; preview glyphs may not render.",
        );
        return false;
      }
      var url = chrome.runtime.getURL(PREVIEW_FONT_PATH);
      var res = await fetch(url);
      if (!res.ok) {
        console.warn(
          "[Jyutcitzi] Preview font not found (" +
            res.status +
            "). Add symlink: fonts/JyutcitziWithSourceHanSansHCRegular.ttf → jyutcitzi-fonts submodule. URL:",
          url,
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

  function removeGlobalPuaRenderingStyle() {
    var el = document.getElementById(GLOBAL_PUA_STYLE_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function applyGlobalPuaRenderingStyle() {
    removeGlobalPuaRenderingStyle();
    var fontUrl = chrome.runtime.getURL(PREVIEW_FONT_PATH);
    var style = document.createElement("style");
    style.id = GLOBAL_PUA_STYLE_ID;
    style.textContent =
      "@font-face{font-family:'" +
      GLOBAL_PUA_FONT_FAMILY +
      "';src:url('" +
      fontUrl +
      "') format('truetype');unicode-range:U+E000-F8FF,U+F0000-FFFFD,U+100000-10FFFD;font-weight:100 900;font-style:normal;}" +
      "*:not(code):not(pre):not(kbd):not(samp):not(tt):not([class*='icon']){font-family:system-ui,-apple-system,'Segoe UI',sans-serif,'" +
      GLOBAL_PUA_FONT_FAMILY +
      "'!important;}";
    (document.head || document.documentElement).appendChild(style);
  }

  function syncGlobalPuaRenderingStyle() {
    if (globalPuaFontRendering) applyGlobalPuaRenderingStyle();
    else removeGlobalPuaRenderingStyle();
  }

  function fieldState(el) {
    if (!stateMap.has(el))
      stateMap.set(el, { buffer: "", panelHist: [] });
    return stateMap.get(el);
  }

  function resetState(el) {
    var st = fieldState(el);
    st.buffer = "";
    st.panelHist = [];
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

  /**
   * Broader than isTextField: Escape toggles pause for these (shadow DOM, email, etc.).
   * IME key handling still uses isTextField only.
   */
  function isPauseToggleField(el) {
    if (!el || el.disabled || el.readOnly) return false;
    var tag = el.tagName;
    if (tag === "TEXTAREA") return true;
    if (tag === "INPUT") {
      var ty = (el.type || "").toLowerCase();
      return (
        ty === "text" ||
        ty === "search" ||
        ty === "" ||
        ty === "email" ||
        ty === "url" ||
        ty === "tel" ||
        ty === "password" ||
        ty === "number"
      );
    }
    return false;
  }

  function resolvePauseToggleField(e) {
    if (isPauseToggleField(e.target)) return e.target;
    var path = e.composedPath && e.composedPath();
    if (path) {
      var i;
      for (i = 0; i < path.length; i++) {
        if (isPauseToggleField(path[i])) return path[i];
      }
    }
    var a = document.activeElement;
    if (isPauseToggleField(a)) return a;
    return null;
  }

  function notifyToolbarIconSync() {
    try {
      chrome.runtime.sendMessage({ type: "jyutcitziSyncToolbarIcon" }, function () {
        void chrome.runtime.lastError;
      });
    } catch (err) {
      /* ignore */
    }
  }

  /** After extension reload/update, this tab's content script cannot use chrome.* until refresh. */
  var extensionContextDead = false;
  var invalidationWarned = false;

  function isInvalidatedMessage(msg) {
    return typeof msg === "string" && msg.indexOf("Extension context invalidated") >= 0;
  }

  function isInvalidatedError(err) {
    return err && isInvalidatedMessage(err.message);
  }

  function warnInvalidatedOnce() {
    if (invalidationWarned) return;
    invalidationWarned = true;
    console.warn(
      "[Jyutcitzi] Extension context invalidated (extension was reloaded or updated). Reload this tab to use Jyutcitzi again.",
    );
  }

  function teardownAfterInvalidation() {
    if (extensionContextDead) return;
    extensionContextDead = true;
    hideMenu();
    try {
      chrome.storage.onChanged.removeListener(onStorageChangedForIme);
    } catch (err) {
      void err;
    }
    window.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("selectionchange", onSelectionChangeForIme);
    document.removeEventListener("click", onDocumentClickForIme, true);
    document.removeEventListener("blur", onBlur, true);
    window.removeEventListener("scroll", onScrollOrResize, true);
    window.removeEventListener("resize", onScrollOrResize);
    document.removeEventListener("mousedown", onDocMouseDown, true);
  }

  function handleInvalidatedContext(err) {
    if (err && !isInvalidatedError(err)) return false;
    warnInvalidatedOnce();
    teardownAfterInvalidation();
    return true;
  }

  /**
   * @returns {boolean} false if sync throw (invalidated); true if API was scheduled
   */
  function safeStorageLocalSet(items, callback) {
    if (extensionContextDead) return false;
    try {
      chrome.storage.local.set(items, function () {
        void chrome.runtime.lastError;
        var le = chrome.runtime.lastError;
        if (le && isInvalidatedMessage(le.message)) handleInvalidatedContext(null);
        if (callback && !extensionContextDead) callback();
      });
      return true;
    } catch (err) {
      if (isInvalidatedError(err)) handleInvalidatedContext(err);
      return false;
    }
  }

  function safeStorageLocalGet(defaults, callback) {
    if (extensionContextDead) return;
    try {
      chrome.storage.local.get(defaults, function (r) {
        void chrome.runtime.lastError;
        var le = chrome.runtime.lastError;
        if (le && isInvalidatedMessage(le.message)) {
          handleInvalidatedContext(null);
          return;
        }
        if (extensionContextDead) return;
        callback(r);
      });
    } catch (err) {
      if (isInvalidatedError(err)) handleInvalidatedContext(err);
    }
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
    var panelFontStack =
      "'" +
      PREVIEW_FONT_FAMILY +
      "', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif";
    css.textContent = [
      ":host {",
      "  font: 14px/1.35 " + panelFontStack + ";",
      "}",
      ".jtc-panel {",
      "  position: fixed;",
      "  min-width: 220px;",
      "  max-width: min(520px, 92vw);",
      "  background: #f5f5f5;",
      "  border: 1px solid #888;",
      "  border-radius: 4px;",
      "  box-shadow: 0 6px 24px rgba(0,0,0,.2);",
      "  font: inherit;",
      "  color: #111;",
      "  pointer-events: auto;",
      "  overflow: hidden;",
      "  display: none;",
      "  flex-direction: column;",
      "}",
      ".jtc-hint {",
      "  padding: 4px 8px;",
      "  font: 11px/1.35 " + panelFontStack + ";",
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
      "  font: 12px/1.35 " + panelFontStack + ";",
      "}",
      ".jtc-key {",
      "  flex: 0 0 auto;",
      "  font-family: " + panelFontStack + ";",
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
      "  font-family: " + panelFontStack + ";",
      "}",
    ].join("\n");

    panelEl = document.createElement("div");
    panelEl.className = "jtc-panel";
    panelEl.setAttribute("role", "listbox");

    hintEl = document.createElement("div");
    hintEl.className = "jtc-hint";
    hintEl.textContent =
      "↑↓ 選擇 · 面板開啟時 Space（含 ⇧）僅確認 · 面板關閉時 ⇧Space 輸入一般空格並結束組字 · Enter / Tab · 1–9 · Esc＝暫停／恢復擴充 · 無須鍵入聲調";

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
      true,
    );

    (document.documentElement || document.body).appendChild(hostEl);

    void loadPreviewFontIntoDocument();
  }

  function hideMenu() {
    menuOpen = false;
    menuRows = [];
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

  function panelHistoryPush(st, buffer, dictKeys) {
    if (!dictKeys || !dictKeys.length) return;
    if (!st.panelHist) st.panelHist = [];
    var prevHi = 0;
    for (var h = 0; h < st.panelHist.length; h++) {
      if (st.panelHist[h].buffer === buffer) {
        prevHi = st.panelHist[h].highlight;
        break;
      }
    }
    st.panelHist = st.panelHist.filter(function (x) {
      return x.buffer !== buffer;
    });
    prevHi = Math.max(0, Math.min(prevHi, dictKeys.length - 1));
    st.panelHist.unshift({
      buffer: buffer,
      highlight: prevHi,
      dictKeys: dictKeys.slice(),
    });
    while (st.panelHist.length > 16) st.panelHist.pop();
  }

  function panelHistoryUpdateHighlight(st, buffer, hi) {
    if (!st.panelHist) return;
    for (var i = 0; i < st.panelHist.length; i++) {
      if (st.panelHist[i].buffer === buffer) {
        st.panelHist[i].highlight = hi;
        return;
      }
    }
  }

  function pickPreferredFirstKey(field, P, pKeys) {
    if (!pKeys.length) return null;
    var st = fieldState(field);
    var hist = st.panelHist || [];
    for (var i = 0; i < hist.length; i++) {
      if (hist[i].buffer !== P || !hist[i].dictKeys || !hist[i].dictKeys.length)
        continue;
      var hi = Math.max(
        0,
        Math.min(hist[i].highlight, hist[i].dictKeys.length - 1),
      );
      var want = hist[i].dictKeys[hi];
      if (pKeys.indexOf(want) >= 0) return want;
    }
    var sortedP = sortKeysByWeight(pKeys);
    return sortedP[0] || null;
  }

  function setHighlight(idx) {
    menuHighlight = Math.max(0, Math.min(menuRows.length - 1, idx));
    if (!listEl) return;
    var rows = listEl.querySelectorAll(".jtc-row");
    for (var i = 0; i < rows.length; i++) {
      rows[i].classList.toggle("jtc-active", i === menuHighlight);
    }
    var active = rows[menuHighlight];
    if (active) active.scrollIntoView({ block: "nearest" });
    if (
      menuField &&
      menuRows.length &&
      menuRows[menuHighlight] &&
      menuRows[menuHighlight].type === "dict"
    ) {
      var st = fieldState(menuField);
      panelHistoryUpdateHighlight(st, st.buffer, menuHighlight);
    }
  }

  function renderMenu(field, buffer) {
    ensureMenuUi();

    if (!ready || !buffer || !trie) {
      hideMenu();
      return;
    }

    var rows = buildMenuRows(buffer, MAX_CANDIDATES, field);
    if (!rows.length) {
      hideMenu();
      return;
    }

    var st = fieldState(field);
    var coreKeys = keysForTypedBufferCore(buffer, MAX_CANDIDATES);
    if (coreKeys.length) {
      panelHistoryPush(st, buffer, coreKeys);
    }

    menuField = field;
    menuRows = rows;
    menuHighlight = 0;
    if (
      coreKeys.length &&
      st.panelHist &&
      st.panelHist[0] &&
      st.panelHist[0].buffer === buffer
    ) {
      menuHighlight = Math.max(
        0,
        Math.min(st.panelHist[0].highlight, rows.length - 1),
      );
    }

    listEl.innerHTML = "";
    for (var i = 0; i < rows.length; i++) {
      var mrow = rows[i];
      var preview = "";
      if (mrow.type === "dict") {
        var entry = lookup.get(mrow.key);
        preview = entry ? entry.output : "";
      } else {
        var eA = lookup.get(mrow.k1);
        var eB = lookup.get(mrow.k2);
        preview =
          (eA ? eA.output : "") + (eB ? eB.output : "");
      }
      if (preview.length > 80) preview = preview.slice(0, 77) + "…";

      var row = document.createElement("div");
      row.className = "jtc-row" + (i === menuHighlight ? " jtc-active" : "");
      row.setAttribute("role", "option");
      row.dataset.index = String(i);

      var num = document.createElement("span");
      num.className = "jtc-num";
      num.textContent = i < 9 ? String(i + 1) : "·";

      var kEl = document.createElement("span");
      kEl.className = "jtc-key";
      kEl.textContent = menuRowLabel(mrow);

      var oEl = document.createElement("span");
      oEl.className = "jtc-out";
      oEl.textContent = preview;

      row.appendChild(num);
      row.appendChild(kEl);
      row.appendChild(oEl);

      (function (idx, f) {
        row.addEventListener("mouseenter", function () {
          setHighlight(idx);
        });
        row.addEventListener("click", function () {
          commitPick(f, idx);
        });
      })(i, field);

      listEl.appendChild(row);
    }

    hintEl.textContent =
      rows.length >= MAX_CANDIDATES
        ? "顯示首 " +
          MAX_CANDIDATES +
          " 項（可捲動）· 開啟時 Space⇧ 僅確認 · 關閉時 ⇧Space 空格 · Enter Tab · 1–9 · Esc＝暫停切換 · 無須鍵入聲調"
        : "↑↓ 選擇 · 面板開啟時 Space（含 ⇧）僅確認 · 關閉時 ⇧Space 一般空格 · Enter / Tab · 1–9 · Esc＝暫停／恢復 · 無須鍵入聲調";

    menuOpen = true;
    panelEl.style.display = "flex";
    positionMenu(field);

    void loadPreviewFontIntoDocument().then(function (ok) {
      if (!ok || !menuField || menuField !== field) return;
      if (fieldState(field).buffer !== buffer) return;
      document.fonts
        .load("14px '" + PREVIEW_FONT_FAMILY + "'")
        .then(function () {
          if (
            !menuField ||
            menuField !== field ||
            fieldState(field).buffer !== buffer
          )
            return;
          repaintMenuPreviewCells();
        });
    });
  }

  /** Re-apply preview text after fonts load (avoid recursive renderMenu). */
  function repaintMenuPreviewCells() {
    if (!listEl || !menuRows.length) return;
    var domRows = listEl.querySelectorAll(".jtc-row");
    for (var i = 0; i < domRows.length; i++) {
      var mrow = menuRows[i];
      if (!mrow) break;
      var oEl = domRows[i].querySelector(".jtc-out");
      if (!oEl) continue;
      var preview = "";
      if (mrow.type === "dict") {
        var entry = lookup.get(mrow.key);
        preview = entry ? entry.output : "";
      } else {
        var e1 = lookup.get(mrow.k1);
        var e2 = lookup.get(mrow.k2);
        preview = (e1 ? e1.output : "") + (e2 ? e2.output : "");
      }
      if (preview.length > 80) preview = preview.slice(0, 77) + "…";
      oEl.textContent = preview;
    }
  }

  function menuVisible() {
    return !!(
      menuOpen &&
      menuField &&
      menuRows.length &&
      panelEl &&
      panelEl.style.display === "flex"
    );
  }

  /**
   * Commit a menu (or default) choice: remove the current Latin buffer only and
   * insert output for dictKey (full RIME key), even if buffer is only a prefix.
   */
  function commitCandidateChoice(el, dictKey) {
    var entry = lookup.get(dictKey);
    if (!entry) return false;
    var st = fieldState(el);
    var bufLen = st.buffer.length;
    if (bufLen === 0) return false;
    if (!keyMatchesTypedBufferIncomplete(dictKey, st.buffer)) return false;
    var caret = el.selectionStart;
    var from = caret - bufLen;
    if (from < 0) return false;
    if (el.value.slice(from, caret) !== st.buffer) return false;
    var v = el.value;
    var end = el.selectionEnd;
    el.value = v.slice(0, from) + entry.output + v.slice(end);
    el.setSelectionRange(
      from + entry.output.length,
      from + entry.output.length,
    );
    resetState(el);
    return true;
  }

  function commitSegmentedChoice(el, k1, k2) {
    var e1 = lookup.get(k1);
    var e2 = lookup.get(k2);
    if (!e1 || !e2) return false;
    var st = fieldState(el);
    var bufLen = st.buffer.length;
    if (bufLen === 0) return false;
    if (
      tonelessLetters(k1) + tonelessLetters(k2) !==
      tonelessLetters(st.buffer)
    )
      return false;
    var caret = el.selectionStart;
    var from = caret - bufLen;
    if (from < 0) return false;
    if (el.value.slice(from, caret) !== st.buffer) return false;
    var out = e1.output + e2.output;
    var v = el.value;
    var end = el.selectionEnd;
    el.value = v.slice(0, from) + out + v.slice(end);
    el.setSelectionRange(from + out.length, from + out.length);
    resetState(el);
    return true;
  }

  function commitPickFromRow(el, row) {
    if (!row) return false;
    if (row.type === "dict") return commitCandidateChoice(el, row.key);
    if (row.type === "seg") return commitSegmentedChoice(el, row.k1, row.k2);
    return false;
  }

  function commitPick(field, index) {
    var row = menuRows[index];
    var ok = commitPickFromRow(field, row);
    if (ok) hideMenu();
    return ok;
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

  function compactInput(s) {
    return String(s).replace(/\s+/g, "");
  }

  /** Lowercase letters only: Jyutping body without tone digits or spaces. */
  function tonelessLetters(s) {
    return compactInput(String(s))
      .toLowerCase()
      .replace(/[1-9]/g, "");
  }

  function makeTlNode() {
    return { children: Object.create(null), keys: [] };
  }

  function tlTrieAdd(fullKey) {
    if (!tlRoot) return;
    var str = tonelessLetters(fullKey);
    if (!str.length) return;
    var node = tlRoot;
    for (var i = 0; i < str.length; i++) {
      var ch = str[i];
      if (!node.children[ch]) node.children[ch] = makeTlNode();
      node = node.children[ch];
    }
    if (node.keys.indexOf(fullKey) < 0) node.keys.push(fullKey);
  }

  function tlFollowString(s) {
    if (!tlRoot || !s.length) return null;
    var node = tlRoot;
    for (var i = 0; i < s.length; i++) {
      var next = node.children[s[i]];
      if (!next) return null;
      node = next;
    }
    return node;
  }

  function collectKeysUnderTlNode(node, limit) {
    var acc = [];
    function walk(n) {
      if (acc.length >= limit) return;
      for (var i = 0; i < n.keys.length && acc.length < limit; i++) {
        acc.push(n.keys[i]);
      }
      var chs = Object.keys(n.children).sort();
      for (var j = 0; j < chs.length && acc.length < limit; j++) {
        walk(n.children[chs[j]]);
      }
    }
    walk(node);
    return acc;
  }

  function sortKeysByWeight(keys) {
    return keys.slice().sort(function (a, b) {
      var ea = lookup.get(a);
      var eb = lookup.get(b);
      var wa = ea && typeof ea.weight === "number" ? ea.weight : 0;
      var wb = eb && typeof eb.weight === "number" ? eb.weight : 0;
      if (wb !== wa) return wb - wa;
      var la = tonelessLetters(a).length;
      var lb = tonelessLetters(b).length;
      if (la !== lb) return la - lb;
      return a < b ? -1 : a > b ? 1 : 0;
    });
  }

  function keysForTonelessBuffer(buffer, limit) {
    var t = tonelessLetters(buffer);
    if (!t.length || !tlRoot) return [];
    var node = tlFollowString(t);
    if (!node) return [];
    return collectKeysUnderTlNode(node, limit);
  }

  /**
   * Raw dict keys for buffer (no auxiliary segmentation). Used internally to
   * avoid recursive auxiliary calls.
   */
  function keysForTypedBufferCore(buffer, limit) {
    if (!buffer || !trie) return [];
    var seen = Object.create(null);
    var acc = [];

    function addArr(arr) {
      for (var i = 0; i < arr.length && acc.length < limit; i++) {
        var k = arr[i];
        if (!seen[k]) {
          seen[k] = 1;
          acc.push(k);
        }
      }
    }

    if (trie.follow(buffer)) {
      addArr(trie.keysWithPrefix(buffer, limit));
    }
    addArr(keysForTonelessBuffer(buffer, Math.max(0, limit - acc.length)));

    if (acc.length < limit) {
      var p = trie.longestPrefix(buffer);
      if (p.length) {
        var tail = buffer.slice(p.length);
        if (tail.length) {
          addArr(
            trie.keysWithPrefix(p + " " + tail, Math.max(0, limit - acc.length)),
          );
        }
        var cbuf = compactInput(buffer);
        var fromP = trie.keysWithPrefix(p, PREFIX_SCAN_CAP);
        for (var j = 0; j < fromP.length && acc.length < limit; j++) {
          var kk = fromP[j];
          if (!seen[kk] && compactInput(kk).indexOf(cbuf) === 0) {
            seen[kk] = 1;
            acc.push(kk);
          }
        }
      }
    }

    return sortKeysByWeight(acc).slice(0, limit);
  }

  /**
   * When no YAML key matches the whole buffer, assume syllable boundaries and
   * combine the user's last highlighted choice for the first syllable (from
   * panel history) with second-syllable candidates (RIME-like carry).
   */
  function keysFromAssumedSegmentation(buffer, field, limit) {
    var rows = [];
    if (!buffer || buffer.length < 2 || !field || !lookup) return rows;
    var tb = tonelessLetters(buffer);
    if (!tb.length) return rows;

    for (var split = 1; split < buffer.length; split++) {
      var P = buffer.slice(0, split);
      var T = buffer.slice(split);
      var tP = tonelessLetters(P);
      var tT = tonelessLetters(T);
      if (!tP.length || !tT.length) continue;
      if (tP + tT !== tb) continue;

      var pKeys = keysForTypedBufferCore(P, 32).filter(function (k) {
        return tonelessLetters(k) === tP;
      });
      if (!pKeys.length) continue;
      var tKeys = keysForTypedBufferCore(T, 32).filter(function (k) {
        return tonelessLetters(k) === tT;
      });
      if (!tKeys.length) continue;

      var k1 = pickPreferredFirstKey(field, P, pKeys);
      if (!k1) continue;
      var tSorted = sortKeysByWeight(tKeys);
      for (var ti = 0; ti < Math.min(tSorted.length, 20); ti++) {
        var k2 = tSorted[ti];
        var e1 = lookup.get(k1);
        var e2 = lookup.get(k2);
        if (!e1 || !e2) continue;
        var w = (e1.weight || 0) + (e2.weight || 0);
        rows.push({
          type: "seg",
          k1: k1,
          k2: k2,
          label: k1 + " · " + k2,
          w: w,
        });
      }
    }

    rows.sort(function (a, b) {
      return b.w - a.w;
    });
    var out = [];
    var seen = Object.create(null);
    for (var r = 0; r < rows.length && out.length < limit; r++) {
      var id = rows[r].k1 + "\n" + rows[r].k2;
      if (seen[id]) continue;
      seen[id] = 1;
      out.push(rows[r]);
    }
    return out;
  }

  function buildMenuRows(buffer, limit, field) {
    if (!buffer || !trie) return [];
    var core = keysForTypedBufferCore(buffer, limit);
    if (core.length) {
      return core.map(function (k) {
        return { type: "dict", key: k };
      });
    }
    if (field && buffer.length >= 2) {
      return keysFromAssumedSegmentation(buffer, field, limit);
    }
    return [];
  }

  function menuRowLabel(row) {
    return row.type === "dict" ? row.key : row.label;
  }

  /** Selected dict key matches what the user typed (literal or space-insensitive). */
  function keyMatchesTypedBuffer(key, buf) {
    if (!buf.length) return false;
    if (key.length >= buf.length && key.slice(0, buf.length) === buf) return true;
    return compactInput(key) === compactInput(buf);
  }

  /** Allow committing a longer phrase key when the typed buffer is a compact prefix. */
  function keyMatchesTypedBufferIncomplete(key, buf) {
    if (keyMatchesTypedBuffer(key, buf)) return true;
    var ck = compactInput(key);
    var cb = compactInput(buf);
    if (ck.length >= cb.length && ck.slice(0, cb.length) === cb) return true;
    var tk = tonelessLetters(key);
    var tb = tonelessLetters(buf);
    if (tk === tb) return true;
    if (tk.length >= tb.length && tk.slice(0, tb.length) === tb) return true;
    return false;
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
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey)
      return e.key;
    return null;
  }

  async function loadLexicon() {
    if (extensionContextDead) return;
    ready = false;
    loadError = null;
    hideMenu();
    tlRoot = null;
    try {
      var stored;
      try {
        stored = await chrome.storage.local.get({ outputMode: "font" });
      } catch (err) {
        if (isInvalidatedError(err)) {
          handleInvalidatedContext(err);
          return;
        }
        throw err;
      }
      var mode = stored.outputMode === "font" ? "font" : "web";
      lookup = await JyutcitziParser.loadDictionaryBundle(mode);
      trie = new JyutcitziTrie();
      var allKeys = Array.from(lookup.keys());
      trie.addAll(allKeys);
      tlRoot = makeTlNode();
      for (var ki = 0; ki < allKeys.length; ki++) tlTrieAdd(allKeys[ki]);
      ready = true;
    } catch (err) {
      loadError = err;
      console.error("[Jyutcitzi] load failed", err);
      ready = false;
      tlRoot = null;
    }
  }

  function onKeyDown(e) {
    if (extensionContextDead) return;
    if (!imeEnabled) return;

    /**
     * Escape in a text field toggles extension pause (normal typing ↔ Jyutcitzi).
     * Runs before the paused guard so a second Esc resumes. Consumes the key.
     */
    if (e.key === "Escape" && resolvePauseToggleField(e)) {
      var nextPaused = !extensionPaused;
      if (!safeStorageLocalSet({ extensionPaused: nextPaused })) return;
      extensionPaused = nextPaused;
      notifyToolbarIconSync();
      if (menuOpen && menuField && isTextField(menuField)) {
        resetState(menuField);
      } else if (menuOpen) {
        hideMenu();
      }
      var escAct = document.activeElement;
      if (escAct && isTextField(escAct)) resetState(escAct);
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    if (extensionPaused) {
      if (menuOpen && menuField && isTextField(menuField)) {
        resetState(menuField);
      } else if (menuOpen) {
        hideMenu();
      }
      return;
    }

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

    /**
     * Space must be handled BEFORE syncBufferFromField: sync calls resetState →
     * hideMenu() when it thinks the field desynced, which clears menuRows and
     * makes the menu branch a no-op (common on search boxes / racey caret).
     */
    if (isSpaceKey(e)) {
      var stEarly = fieldState(el);
      var bufEarly = stEarly.buffer;
      if (
        bufEarly.length &&
        menuOpen &&
        menuField === el &&
        menuRows.length > 0
      ) {
        var posE = el.selectionStart;
        if (posE === el.selectionEnd && posE >= bufEarly.length) {
          var fromE = posE - bufEarly.length;
          if (el.value.slice(fromE, posE) === bufEarly) {
            var hi = Math.max(0, Math.min(menuHighlight, menuRows.length - 1));
            var rowEarly = menuRows[hi];
            var okEarly = false;
            if (rowEarly.type === "dict") {
              if (keyMatchesTypedBufferIncomplete(rowEarly.key, bufEarly)) {
                okEarly = commitCandidateChoice(el, rowEarly.key);
              }
            } else if (
              tonelessLetters(rowEarly.k1) + tonelessLetters(rowEarly.k2) ===
              tonelessLetters(bufEarly)
            ) {
              okEarly = commitSegmentedChoice(el, rowEarly.k1, rowEarly.k2);
            }
            if (okEarly) {
              e.preventDefault();
              e.stopImmediatePropagation();
              hideMenu();
              return;
            }
          }
        }
      }
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
      if (isSpaceKey(e)) {
        e.preventDefault();
        if (menuRows.length) {
          commitPick(el, menuHighlight);
        }
        return;
      }
      if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        var n = parseInt(e.key, 10) - 1;
        if (n < menuRows.length) {
          e.preventDefault();
          commitPick(el, n);
        }
        return;
      }
      if ((e.key === "Enter" || e.key === "Tab") && menuRows.length) {
        e.preventDefault();
        commitPick(el, menuHighlight);
        return;
      }
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

    if (isSpaceKey(e) && st.buffer.length) {
      if (menuVisible() && menuField === el) {
        e.preventDefault();
        if (menuRows.length) {
          commitPick(el, menuHighlight);
        }
        return;
      }
      if (e.shiftKey) {
        e.preventDefault();
        insertAtCaret(el, " ");
        resetState(el);
        return;
      }
      if (!menuVisible() || menuField !== el) {
        var spaceRows = buildMenuRows(st.buffer, MAX_CANDIDATES, el);
        if (spaceRows.length > 0) {
          e.preventDefault();
          if (commitPickFromRow(el, spaceRows[0])) hideMenu();
          return;
        }
        e.preventDefault();
        insertAtCaret(el, " ");
        resetState(el);
        return;
      }
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

    if (ch === " ") return;

    var lower = ch >= "A" && ch <= "Z" ? ch.toLowerCase() : ch;
    var newBuf = st.buffer + lower;

    if (trie.follow(newBuf) || tlFollowString(tonelessLetters(newBuf))) {
      e.preventDefault();
      insertAtCaret(el, lower);
      st.buffer = newBuf;
      scheduleMenuUpdate(el);
      return;
    }

    if (st.buffer.length) {
      e.preventDefault();
      insertAtCaret(el, lower);
      st.buffer = newBuf;
      scheduleMenuUpdate(el);
      return;
    }

    if (trie.follow(lower) || tlFollowString(tonelessLetters(lower))) {
      e.preventDefault();
      insertAtCaret(el, lower);
      st.buffer = lower;
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
      if (extensionContextDead) return;
      if (ignoreNextFieldBlur) {
        ignoreNextFieldBlur = false;
        return;
      }
      hideMenu();
      resetState(field);
    }, 0);
  }

  function onStorageChangedForIme(changes, area) {
    if (extensionContextDead) return;
    if (area !== "local") return;
    if (changes.imeEnabled) {
      imeEnabled = changes.imeEnabled.newValue !== false;
      if (!imeEnabled) {
        extensionPaused = false;
        if (!safeStorageLocalSet({ extensionPaused: false })) return;
        notifyToolbarIconSync();
        hideMenu();
        var a = document.activeElement;
        if (a && isTextField(a)) resetState(a);
      }
    }
    if (changes.extensionPaused) {
      extensionPaused = changes.extensionPaused.newValue === true;
      if (extensionPaused) {
        hideMenu();
        var ap = document.activeElement;
        if (ap && isTextField(ap)) resetState(ap);
      }
    }
    if (changes.globalPuaFontRendering) {
      globalPuaFontRendering = changes.globalPuaFontRendering.newValue === true;
      syncGlobalPuaRenderingStyle();
    }
    if (changes.outputMode) {
      loadLexicon().catch(function (err) {
        console.error("[Jyutcitzi] reload failed", err);
      });
    }
  }

  chrome.storage.onChanged.addListener(onStorageChangedForIme);

  safeStorageLocalGet(
    {
      imeEnabled: true,
      globalPuaFontRendering: true,
      extensionPaused: false,
    },
    function (r) {
      imeEnabled = r.imeEnabled !== false;
      globalPuaFontRendering = r.globalPuaFontRendering === true;
      extensionPaused = imeEnabled && r.extensionPaused === true;
      syncGlobalPuaRenderingStyle();
    },
  );

  function onSelectionChangeForIme() {
    if (extensionContextDead) return;
    var a = document.activeElement;
    if (a && isTextField(a)) syncBufferFromField(a);
  }

  function onDocumentClickForIme(e) {
    if (extensionContextDead) return;
    if (!isTextField(e.target)) return;
    requestAnimationFrame(function () {
      if (extensionContextDead) return;
      syncBufferFromField(e.target);
    });
  }

  window.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("selectionchange", onSelectionChangeForIme);
  document.addEventListener("click", onDocumentClickForIme, true);
  document.addEventListener("blur", onBlur, true);
  window.addEventListener("scroll", onScrollOrResize, true);
  window.addEventListener("resize", onScrollOrResize);
  document.addEventListener("mousedown", onDocMouseDown, true);

  loadPreviewFontIntoDocument().catch(function () {});

  loadLexicon().catch(function (err) {
    console.error("[Jyutcitzi] init failed", err);
  });
})();
