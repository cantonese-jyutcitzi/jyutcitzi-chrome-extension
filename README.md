# Jyutcitzi (Chrome extension)

Type Jyutping-style keys in normal web **`<input>`** and **`<textarea>`** fields. The extension loads the bundled Jyutcitzi RIME dictionaries as flat lookup tables, shows a **candidate panel** with previews, and replaces your typed Latin buffer with the chosen entry’s output (web-style characters or private-use font glyphs, depending on mode).

This is **not** a full RIME/Squirrel port: there is no separate RIME engine, only dictionary lookup, prefix/toneless matching, and a small amount of auxiliary logic when the whole string has no YAML key.

---

## Install

### A. Download the ZIP (easiest)

1. Open **[Releases](https://github.com/cantonese-jyutcitzi/jyutcitzi-chrome-extension/releases)** for this repo.
2. Download the latest **`.zip`** attached to the release (e.g. `jyutcitzi-chrome-extension-v….zip`).
   - That zip is meant to include **`manifest.json`**, the full **`yaml/`** folder, **`fonts/`**, scripts, etc. Chrome will not load a zip that is missing `yaml/`.
3. **Extract** the zip somewhere permanent (Desktop, `Documents`, …). You must end up with a **folder** that **directly contains** `manifest.json` and a **`yaml`** subfolder.
   - **Wrong:** pointing Chrome at the `.zip` file.
   - **Wrong:** choosing a parent folder so Chrome does not see `manifest.json`.
   - **Right:** select the **inner** folder that looks like the project root (same level as `manifest.json`).
4. [Load in Chrome](#load-in-chrome) (same steps as for a git clone).

**Sanity check before Load unpacked:** open the folder you’re about to select. You should see `manifest.json`, `content.js`, `yaml/`, etc. If `yaml/` is missing or empty, the extension will not work—use a release zip or see [From git](#b-from-git-developers) below.

**GitHub “Code → Download ZIP”** on the main repo page often **does not** fill git submodules; you can get an incomplete tree. Prefer a **Release** zip, or clone with submodules.

### B. From git (developers)

```bash
git clone https://github.com/cantonese-jyutcitzi/jyutcitzi-chrome-extension.git
cd jyutcitzi-chrome-extension
git submodule update --init --recursive
```

Submodules supply fonts and any linked RIME data; the runtime still requires a populated **`yaml/`** next to `manifest.json`. Then [Load in Chrome](#load-in-chrome).

### Load in Chrome

1. Open **`chrome://extensions`**.
2. Turn **Developer mode** on.
3. Click **Load unpacked**.
4. Select the **folder that contains `manifest.json`** (the extension root), not a parent directory.

### Preview font

The panel uses **`fonts/JyutcitziWithSourceHanSansHCRegular.ttf`**. If it’s missing, previews may be tofu boxes; release zips should include it.

### First run

Open the extension **toolbar popup**:

- **Web** vs **Font** — dictionary bundle and output form.
- **Enable Jyutcitzi in text fields** — master switch.
- **Global PUA glyph rendering** (optional) — see below.

Focus a page **`input`** / **`textarea`**, type letters; the candidate panel should show when there are matches.

---

## Packing a `.zip` (for maintainers / Chrome Web Store)

When you cut a release, attach a zip that already contains:

- The **entire `yaml/`** tree (see [Bundled dictionary files](#bundled-dictionary-files)).
- **`fonts/*.ttf`** for previews.

Open your zip and confirm **`yaml/jyutcitzi_web.dict.yaml`** (and siblings) exist. Do **not** rely on `.gitignore` when building the archive—missing `yaml/` means a broken install for everyone who only downloads the zip.

---

## Usage

| Action                                        | Behavior                                                                                                                                                                                                       |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type `a–z` (and digits if you use toned keys) | Builds a composition buffer; panel lists matches (literal + tone-stripped + fallbacks).                                                                                                                        |
| **↑** / **↓**                                 | Move highlight in the panel.                                                                                                                                                                                   |
| **Space**                                     | While the panel is open: **confirm** the highlighted row (plain and Shift+Space both confirm — no literal space is inserted with the panel open).                                                              |
| **Shift+Space**                               | When the panel is **closed** and you still have a pending buffer: insert a normal space and end that composition.                                                                                              |
| **Enter** / **Tab**                           | Confirm highlighted candidate when the panel is open.                                                                                                                                                          |
| **1–9**                                       | Pick rows 1–9.                                                                                                                                                                                                 |
| **Backspace**                                 | Deletes within the pending buffer.                                                                                                                                                                             |
| **Escape**                                    | In a focused **text field**, **each press** toggles pause (normal typing ↔ Jyutcitzi). The key is consumed (`preventDefault`). Press again to resume. Panel and composition buffer are cleared on each toggle. |

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
No i
