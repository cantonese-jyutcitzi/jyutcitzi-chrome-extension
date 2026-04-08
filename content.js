/**
 * Jyutcitzi: buffer → dictionary lookup → replace in input/textarea.
 */
(function () {
  var trie = null;
  var lookup = null;
  var ready = false;

  var stateMap = new WeakMap();

  function fieldState(el) {
    if (!stateMap.has(el))
      stateMap.set(el, { buffer: "" });
    return stateMap.get(el);
  }

  function resetState(el) {
    fieldState(el).buffer = "";
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

  /** Longest dictionary key that is a prefix of buf. */
  function longestTerminalPrefix(buf) {
    var best = null;
    for (var i = 1; i <= buf.length; i++) {
      var pre = buf.slice(0, i);
      if (trie.isTerminal(pre)) best = pre;
    }
    return best;
  }

  /** Replace suffix `key` before caret with output (must match field text). */
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

  /**
   * Commit longest terminal prefix of full buffer; removes mistaken tail in one step.
   * Field text before caret must equal st.buffer.
   */
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
    return true;
  }

  function tryCommitImmediate(el, buf) {
    if (!trie.exactNoExtend(buf)) return false;
    return commitKeyAtCaret(el, buf);
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
    var stored = await chrome.storage.local.get({ outputMode: "web" });
    var mode = stored.outputMode === "font" ? "font" : "web";
    lookup = await JyutcitziParser.loadDictionaryBundle(mode);
    trie = new JyutcitziTrie();
    trie.addAll(Array.from(lookup.keys()));
    ready = true;
  }

  function onKeyDown(e) {
    if (!ready || !isTextField(e.target)) return;
    var el = e.target;
    if (e.isComposing) {
      resetState(el);
      return;
    }

    var st = fieldState(el);
    syncBufferFromField(el);

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
      return;
    }

    if (e.key === "Enter" || e.key === "Tab") {
      if (!st.buffer.length) return;
      if (trie.isTerminal(st.buffer) && trie.exactAndExtend(st.buffer)) {
        e.preventDefault();
        commitKeyAtCaret(el, st.buffer);
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
      return;
    }

    if (trie.follow(lower)) {
      e.preventDefault();
      insertAtCaret(el, lower);
      st.buffer = lower;
      if (tryCommitImmediate(el, st.buffer)) return;
      return;
    }
  }

  function onSelectOrClick(e) {
    if (!isTextField(e.target)) return;
    requestAnimationFrame(function () {
      syncBufferFromField(e.target);
    });
  }

  function onBlur(e) {
    if (isTextField(e.target)) resetState(e.target);
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
  document.addEventListener("click", onSelectOrClick, true);
  document.addEventListener("blur", onBlur, true);

  loadLexicon().catch(function (err) {
    console.error("[Jyutcitzi] init failed", err);
  });
})();
