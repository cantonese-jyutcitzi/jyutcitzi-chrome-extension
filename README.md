# Jyutcitzi (Chrome extension)

Type Jyutping-style keys in normal web **`<input>`** and **`<textarea>`** fields. The extension loads the bundled Jyutcitzi RIME dictionaries as flat lookup tables, shows a **candidate panel** with previews, and replaces your typed Latin buffer with the chosen entry’s output (web-style characters or private-use font glyphs, depending on mode).

This is **not** a full RIME/Squirrel port: there is no separate RIME engine, only dictionary lookup, prefix/toneless matching, and a small amount of auxiliary logic when the whole string has no YAML key.

---

## Install (unpacked)

### 1. Get the repo and data

```bash
git clone <repository-url>
cd jyutcitzi-chrome-extension
git submodule update --init --recursive
```

Submodules supply optional assets (e.g. fonts under `submodules/jyutcitzi-fonts/`). The extension **must** still have a complete **`yaml/`** directory beside `manifest.json` (copied or symlinked RIME `*.dict.yaml` files). Without `yaml/`, the lexicon never loads.

### 2. Preview font (recommended)

The candidate panel uses **`fonts/JyutcitziWithSourceHanSansHCRegular.ttf`**. If that file is missing, previews may show replacement boxes. Ensure the font file exists (copy or symlink from your Jyutcitzi font build, or from `submodules/jyutcitzi-fonts` if you use that layout).

### 3. Load in Chrome

1. Open **`chrome://extensions`**.
2. Turn **Developer mode** on.
3. Click **Load unpacked**.
4. Select the **folder that contains `manifest.json`** (the extension root), not a parent directory.

### 4. First run

Open the extension **toolbar popup**:

- **Web** vs **Font** — which dictionary bundle and output form to use.
- **Enable Jyutcitzi in text fields** — master switch for interception.
- **Global PUA glyph rendering** (optional) — see below.

Focus a page `input`/`textarea`, type letters; the candidate panel should appear when there are matches.

---

## Packing a `.zip` (e.g. Chrome Web Store)

- Include the **entire `yaml/`** tree the runtime loads (see [Bundled dictionary files](#bundled-dictionary-files)).
- Include **`fonts/*.ttf`** if you ship previews.
- Do **not** assume `.gitignore` is enough: open the zip and confirm paths like `yaml/jyutcitzi_web.dict.yaml` exist. If `yaml/` is missing, the console will show load errors and nothing will work.

---

## Usage

| Action | Behavior |
|--------|----------|
| Type `a–z` (and digits if you use toned keys) | Builds a composition buffer; panel lists matches (literal + tone-stripped + fallbacks). |
| **↑** / **↓** | Move highlight in the panel. |
| **Space** | While the panel is open: **confirm** the highlighted row (plain and Shift+Space both confirm — no literal space is inserted with the panel open). |
| **Shift+Space** | When the panel is **closed** and you still have a pending buffer: insert a normal space and end that composition. |
| **Enter** / **Tab** | Confirm highlighted candidate when the panel is open. |
| **1–9** | Pick rows 1–9. |
| **Esc** | Close the panel, or clear the pending buffer if the panel is already closed. |
| **Backspace** | Deletes within the pending buffer. |
| **Caps Lock** | While composing: disables the extension for that session (same as turning it off in the popup). |

You can type **without tones** in many cases; tone variants often appear as separate rows. Longer phrases in the YAML use **spaces** in the key; the extension also matches **concatenated** toneless input where possible. If the full string has **no** dictionary key, the extension may offer **segmented** rows (first syllable from your last highlight or top weight, second syllable from the remainder) — a lightweight stand-in for RIME-style carry, not a full segmenter.

---

## Global PUA glyph rendering (optional)

When **Font** output mode writes private-use codepoints, pages may show tofu unless a font covers those ranges. If you enable **Global PUA glyph rendering**, the content script injects a stylesheet that registers the bundled TTF as a **fallback** family scoped with **`unicode-range`** to PUA blocks, and appends it to a broad `font-family` stack (with simple exclusions for `code`, `pre`, and common icon-class heuristics).

This only affects **rendering**, not stored text. If a site’s icons break, turn the option off.

---

## Bundled dictionary files

Loaded at runtime from `yaml/` (see `parser.js`):

**Web mode**

- `jyutcitzi_web.dict.yaml`
- `jyutcitzi_web.lettered.dict.yaml`
- `jyutcitzi_web.compound.dict.yaml`
- `jyutcitzi_web.jyutcit_phrases.dict.yaml`
- `jyutcitzi_core.lettered.dict.yaml`

**Font mode**

- `jyutcitzi_font.dict.yaml`
- `jyutcitzi_font.lettered.dict.yaml`
- `jyutcitzi_font.compound.dict.yaml`
- `jyutcitzi_font.jyutcit_phrases.dict.yaml`
- `jyutcitzi_core.lettered.dict.yaml`

Rows are read as RIME table lines after the `...` header: `output<TAB>input<TAB>weight`.

---

## Project layout (main pieces)

```
manifest.json
content.js      # IME UI, buffer, keys, commit
parser.js       # fetch + parse dict YAML → Map
trie.js         # prefix trie for keys
popup.html/js   # options
yaml/           # dictionary bundle (required)
fonts/          # preview TTF (recommended)
vendor/         # js-yaml
```

---

## Scope

- **Supported:** `input` / `textarea` on ordinary pages (subject to site focus/event quirks).
- **Not in scope here:** `contenteditable`, a full RIME engine, or linguistic Jyutping parsing beyond what the YAML keys already encode.

If something fails on a specific site, check the page **console** for `[Jyutcitzi]` messages and confirm `yaml/` and `fonts/` are present in the loaded extension directory.
