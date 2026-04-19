# Jyutcitzi (Chrome extension)

Type Jyutping-style keys in normal web **`<input>`** and **`<textarea>`** fields. The extension loads the bundled Jyutcitzi RIME dictionaries as flat lookup tables, shows a **candidate panel** with previews, and replaces your typed Latin buffer with the chosen entry’s output (web-style characters or private-use font glyphs, depending on mode).

This is **not** a full RIME/Squirrel port: there is no separate RIME engine, only dictionary lookup, prefix/toneless matching, and a small amount of auxiliary logic when the whole string has no YAML key.

---

## Install (from GitHub Releases)

**Always install from [Releases](https://github.com/cantonese-jyutcitzi/jyutcitzi-chrome-extension/releases), not from the green “Code” button.**

1. Open **[Releases](https://github.com/cantonese-jyutcitzi/jyutcitzi-chrome-extension/releases)** and download **`jyutcitzi-chrome-extension-dist.zip`** from the latest release (or another version you want). That file is the **built extension** with real `yaml/` and `fonts/` inside.
2. Unzip it. You should see a folder that contains **`manifest.json`** at its top level (along with `content.js`, `yaml/`, `fonts/`, etc.).
3. Open **`chrome://extensions`**, turn **Developer mode** on, click **Load unpacked**, and select **that folder** (the one that directly contains `manifest.json` — not the `.zip`, and not a parent of that folder).

**Do not use GitHub’s “Code → Download ZIP”** for installing or testing the extension. That archive is **source code** (often with **symlinks** into `submodules/`). Chrome needs a package of **real files**; otherwise dictionary/font `fetch` fails (`Failed to fetch`). If you are a maintainer building a release yourself, see below.

---

## GitHub Releases (for maintainers)

Use **Releases** to ship **`jyutcitzi-chrome-extension-dist.zip`** so testers and the Chrome Web Store get a complete package.

### 1. Build the distributable ZIP

From the repo root (with **submodules** checked out):

```bash
./scripts/build-extension-dist.sh
```

You should get **`dist/`** and **`jyutcitzi-chrome-extension-dist.zip`** at the repo root. Confirm the zip exists.

### 2. Push and tag

```bash
git add .
git commit -m "Prepare release"
git push origin main
git tag v0.1.0-test1
git push origin v0.1.0-test1
```

Use a clear version or prerelease tag (examples: `v0.1.0-test1`, `v0.1.0-beta`). Stable public builds might use `v1.0.0`.

### 3. Create the release on GitHub

1. Repo → **Releases** → **Draft a new release**
2. **Choose a tag:** e.g. `v0.1.0-test1`
3. **Release title:** e.g. `Jyutcitzi Chrome Extension v0.1.0-test1`
4. **Describe** what changed; you can paste the same install steps as in **Install** above for testers.
5. For tester builds, turn **on** **“This is a pre-release”**; for a stable public release, leave it off.
6. **Attach** `jyutcitzi-chrome-extension-dist.zip` (drag-and-drop), then **Publish release**.

**Always attach this built zip** — never attach only the source tree zip.

### 4. What to tell testers

Point them to the **Releases** page and ask them to download **`jyutcitzi-chrome-extension-dist.zip`**, unzip, then **Load unpacked** on the extracted folder as in **Install** above.

### Repeatable shortcut

```bash
./scripts/build-extension-dist.sh
git push
git tag v0.1.0-test2
git push origin v0.1.0-test2
```

Then draft the release and attach the new zip.

### Automation (optional)

Pushing a **published** GitHub Release can run [`.github/workflows/release-dist.yml`](.github/workflows/release-dist.yml) to build with submodules and attach **`jyutcitzi-chrome-extension-dist.zip`** automatically; you can still do manual releases as above.

### Why the build script exists

In a dev clone, `yaml/*.yaml` and `fonts/*.ttf` are often **symlinks** into `submodules/`. **`rsync -aL`** in [`scripts/build-extension-dist.sh`](scripts/build-extension-dist.sh) copies **real files** into `dist/` and the zip so Chrome can load assets from **`chrome-extension://…`**. Upload **that** zip to the Web Store or Releases. More detail: [`fonts/README.txt`](fonts/README.txt).

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

**Toolbar icon:** grey = extension off; **green** = Jyutcitzi on (intercepting keys); **pink** = on but **paused** (normal keyboard; press Esc in a text field again to resume).

You can type **without tones** in many cases; tone variants often appear as separate rows. Longer phrases in the YAML use **spaces** in the key; the extension also matches **concatenated** toneless input where possible. If the full string has **no** dictionary key, the extension may offer **segmented** rows (first syllable from your last highlight or top weight, second syllable from the remainder) — a lightweight stand-in for RIME-style carry, not a full segmenter.

---

## Global PUA glyph rendering

**Font** output mode writes private-use codepoints; pages may show tofu unless a font covers those ranges. **Global PUA glyph rendering** is **on by default** for new installs: the content script injects a stylesheet that registers the bundled TTF as a **fallback** family scoped with **`unicode-range`** to PUA blocks, and appends it to a broad `font-family` stack (with simple exclusions for `code`, `pre`, and common icon-class heuristics). Turn it off in the popup if you prefer not to inject that stack.

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
- **Google Docs** (`docs.google.com`) is **intentionally unsupported** for now (no content script there). Use **Google Sheets**, **Gmail**, or other sites until a future Docs-specific adapter exists.

If something fails on a specific site, check the page **console** for `[Jyutcitzi]` messages and confirm `yaml/` and `fonts/` are present in the loaded extension directory.

### Troubleshooting

- If the console shows **`Extension context invalidated`**, you reloaded or updated the extension while this tab was still open. **Reload the tab** (refresh the page); open tabs keep the old content script until then.
- After **Load unpacked** or **Reload** on `chrome://extensions`, refresh any tabs where you want to use the IME.
- Do not use **`google.com/sorry/`** (CAPTCHA / anti-bot interstitial) to judge whether the extension works; the content script does not run there by design.
- **Chrome Web Store:** if **Load unpacked** works but a store upload fails with missing assets, the zip likely has **symlinks or missing submodule files**. Run [`scripts/build-extension-dist.sh`](scripts/build-extension-dist.sh) and upload the generated **`jyutcitzi-chrome-extension-dist.zip`**, or use a **[Releases](https://github.com/cantonese-jyutcitzi/jyutcitzi-chrome-extension/releases)** asset built the same way.
