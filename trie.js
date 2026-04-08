/**
 * Minimal prefix trie for dictionary keys (jyutping + space-separated phrases).
 * Global: JyutcitziTrie
 */
(function () {
  function makeNode() {
    return { children: Object.create(null), terminal: false };
  }

  function JyutcitziTrie() {
    this.root = makeNode();
  }

  JyutcitziTrie.prototype.add = function (key) {
    if (!key) return;
    var node = this.root;
    for (var i = 0; i < key.length; i++) {
      var ch = key[i];
      if (!node.children[ch]) node.children[ch] = makeNode();
      node = node.children[ch];
    }
    node.terminal = true;
  };

  JyutcitziTrie.prototype.addAll = function (keys) {
    for (var i = 0; i < keys.length; i++) this.add(keys[i]);
  };

  /** Follow entire string; return node or null if path missing. */
  JyutcitziTrie.prototype.follow = function (s) {
    var node = this.root;
    for (var i = 0; i < s.length; i++) {
      var next = node.children[s[i]];
      if (!next) return null;
      node = next;
    }
    return node;
  };

  JyutcitziTrie.prototype.hasChildFromRoot = function (ch) {
    return !!this.root.children[ch];
  };

  JyutcitziTrie.prototype.isTerminal = function (s) {
    var node = this.follow(s);
    return !!(node && node.terminal);
  };

  JyutcitziTrie.prototype.hasAnyChild = function (node) {
    for (var _ in node.children) {
      if (Object.prototype.hasOwnProperty.call(node.children, _)) return true;
    }
    return false;
  };

  /** Exact key ends here and no longer key continues. */
  JyutcitziTrie.prototype.exactNoExtend = function (s) {
    var node = this.follow(s);
    return !!(node && node.terminal && !this.hasAnyChild(node));
  };

  /** Exact key but some longer key shares this prefix. */
  JyutcitziTrie.prototype.exactAndExtend = function (s) {
    var node = this.follow(s);
    return !!(node && node.terminal && this.hasAnyChild(node));
  };

  /** Incomplete but valid prefix. */
  JyutcitziTrie.prototype.prefixOnly = function (s) {
    var node = this.follow(s);
    return !!(node && !node.terminal && this.hasAnyChild(node));
  };

  /**
   * All dictionary keys starting with `buffer`, up to `limit` (DFS order then sorted).
   */
  JyutcitziTrie.prototype.keysWithPrefix = function (buffer, limit) {
    var node = this.follow(buffer);
    if (!node) return [];
    var acc = [];

    function walk(n, suffix) {
      if (acc.length >= limit) return;
      if (n.terminal) acc.push(buffer + suffix);
      var keys = Object.keys(n.children).sort();
      for (var i = 0; i < keys.length; i++) {
        if (acc.length >= limit) return;
        walk(n.children[keys[i]], suffix + keys[i]);
      }
    }

    walk(node, "");
    acc.sort(function (a, b) {
      if (a.length !== b.length) return a.length - b.length;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    return acc;
  };

  globalThis.JyutcitziTrie = JyutcitziTrie;
})();
