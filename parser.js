/**
 * Load RIME *.dict.yaml as tab-separated rows: OUTPUT \t INPUT \t WEIGHT
 * Global: JyutcitziParser
 */
(function () {
  var WEB_FILES = [
    "jyutcitzi_web.dict.yaml",
    "jyutcitzi_web.lettered.dict.yaml",
    "jyutcitzi_web.compound.dict.yaml",
    "jyutcitzi_web.jyutcit_phrases.dict.yaml",
    "jyutcitzi_core.lettered.dict.yaml",
  ];

  var FONT_FILES = [
    "jyutcitzi_font.dict.yaml",
    "jyutcitzi_font.lettered.dict.yaml",
    "jyutcitzi_font.compound.dict.yaml",
    "jyutcitzi_font.jyutcit_phrases.dict.yaml",
    "jyutcitzi_core.lettered.dict.yaml",
  ];

  function mergeEntry(map, input, output, weight) {
    var w = typeof weight === "number" && !isNaN(weight) ? weight : 0;
    var prev = map.get(input);
    if (!prev || w >= prev.weight)
      map.set(input, { output: output, weight: w });
  }

  /**
   * Parse one file body: after first line that is exactly "..." (RIME dict end of YAML header).
   */
  function parseRimeDictText(text, map) {
    var lines = text.split(/\r?\n/);
    var bodyStart = 0;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i] === "...") {
        bodyStart = i + 1;
        break;
      }
    }
    for (var j = bodyStart; j < lines.length; j++) {
      var line = lines[j];
      if (!line || /^\s*#/.test(line)) continue;
      var parts = line.split("\t");
      if (parts.length < 3) continue;
      var output = parts[0];
      var input = parts[1];
      var weightStr = parts.slice(2).join("\t");
      var weight = parseFloat(weightStr);
      if (input === "" || output === "") continue;
      mergeEntry(map, input, output, weight);
    }
  }

  async function fetchText(path) {
    var url = chrome.runtime.getURL(path);
    var res = await fetch(url);
    if (!res.ok) throw new Error("Failed to load " + path + ": " + res.status);
    return res.text();
  }

  /**
   * @param {"web"|"font"} mode
   * @returns {Promise<Map<string, {output: string, weight: number}>>}
   */
  async function loadDictionaryBundle(mode) {
    var files = mode === "font" ? FONT_FILES : WEB_FILES;
    var map = new Map();
    for (var i = 0; i < files.length; i++) {
      var name = files[i];
      var text = await fetchText("yaml/" + name);
      parseRimeDictText(text, map);
    }
    return map;
  }

  globalThis.JyutcitziParser = {
    loadDictionaryBundle: loadDictionaryBundle,
    parseRimeDictText: parseRimeDictText,
  };
})();
