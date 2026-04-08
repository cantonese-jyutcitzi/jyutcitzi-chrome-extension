Jyutcitzi Chrome extension — direct YAML lookup (canonical plan)

## Install (unpacked)

1. Ensure dictionaries are present: the whole **`yaml/`** directory must live next to `manifest.json` (files or symlinks). Run `git submodule update --init --recursive` if you use a submodule for RIME data.
2. Chrome → **Extensions** → enable **Developer mode** → **Load unpacked** → choose the **folder that contains `manifest.json`** (not a parent directory).
3. Optional: use the toolbar popup to switch **Web** vs **Font** dictionary output.
4. Focus a normal `input` or `textarea`, type Jyutping letters. A **scrollable candidate panel** appears under the field (up to 800 matches). **↑↓** move, **Enter** / **Tab** confirm, **1–9** pick the first nine, **Esc** closes the panel (or clears the pending buffer if the panel is already closed). If the key is unique with no longer matches, it may commit immediately without needing the panel.

### Packing / Chrome Web Store zip

The extension loads dictionaries with `fetch(chrome.runtime.getURL("yaml/…"))`. Your **`.zip` must include the entire `yaml/` tree** (all `.dict.yaml` files the extension expects). If `yaml/` is missing from the zip, the lexicon never loads (`[Jyutcitzi] load failed` in the page console) and neither replacement nor the dropdown will work.

Do **not** rely on `.gitignore` when zipping: confirm the archive actually contains `yaml/jyutcitzi_web.dict.yaml` etc. before upload.

---

One-sentence goal

Build a minimal Chrome extension that directly consumes the existing Jyutcitzi RIME YAML dictionaries and performs raw input-string → output-string substitution in browser text fields. The extension will not implement phonology, parsing, glyph composition, schema transpilation, or a separate IME logic layer. It treats the YAML dictionaries as the complete canonical mapping source. At runtime it maintains a typed buffer, checks that buffer against the dictionary key set and prefix set derived from the YAML files, and replaces matching romanized input with the corresponding Jyutcitzi output from the selected dictionary family (jyutcitzi*web* or jyutcitzi*font*). Initial scope is **inputandtextarea; **contenteditable is deferred. This architecture is \*\*intentionally dumb, direct, and faithful to the existing YAML.

Product goal (checklist)

Load existing Jyutcitzi YAML dictionary files.

Read them as raw lookup tables (no RIME engine).

Watch user typing in text fields.

Match the current Latin buffer against dictionary keys.

Replace the typed key sequence with the mapped Jyutcitzi output.

Output web-form or font-form Jyutcitzi depending on which dictionary bundle is selected.

That is the whole product for this track.

Architecture

keystrokes
→ raw buffer
→ direct dictionary lookup against existing YAML entries
→ if exact match: replace typed text with mapped Jyutcitzi output
→ if current buffer is a prefix of a longer key: wait
→ if buffer no longer matches anything: flush/reset (with last-exact fallback when implemented)

No Jyutping parser (as a phonology module).

No phonology engine.

No syllable analysis.

No composer.

No generated intermediate schema / transpilation project.

No phase-2 candidate bar in v1.

No SVG rendering project.

flowchart LR
keys[keystrokes]
buf[raw buffer]
yaml[YAML dict rows]
lut[lookup map]
pfx[prefix index]
rep[replace in field]
yaml --> lut
keys --> buf
buf --> lut
buf --> pfx
lut --> rep
pfx --> rep

Canonical files (packaged under yaml/)

Web output mode (default)

jyutcitzi_web.dict.yaml

jyutcitzi_web.lettered.dict.yaml

jyutcitzi_web.compound.dict.yaml

jyutcitzi_web.jyutcit_phrases.dict.yaml

jyutcitzi_web.phrase.dict.yaml

jyutcitzi_web.schema.yaml (reference for which dicts exist; not executed as RIME at runtime)

Font output mode

jyutcitzi_font.dict.yaml

jyutcitzi_font.lettered.dict.yaml

jyutcitzi_font.compound.dict.yaml

jyutcitzi_font.jyutcit_phrases.dict.yaml

jyutcitzi_font.phrase.dict.yaml

jyutcitzi_font.schema.yaml

default.custom.yaml (where you maintain it) shows active schemas include jyutcitzi_web and jyutcitzi_font — aligns with the two-mode plan.

Runtime modes

Mode A (web): jyutcitzi_web — outputs visible Jyutcitzi-style strings (e.g. entries like web output for baa1).

Mode B (font): jyutcitzi_font — outputs font glyph characters for the same keys.

Default: web mode unless you know the target page uses the font.

Minimal repo layout

chrome-extension-jyutcitzi/
├── manifest.json
├── content.js # typing hook, buffer, commit/replace rules
├── parser.js # YAML dict reader + row extraction only
├── trie.js # optional but small — prefix / exact support
├── yaml/
│ ├── jyutcitzi_web.dict.yaml
│ ├── jyutcitzi_web.lettered.dict.yaml
│ ├── jyutcitzi_web.compound.dict.yaml
│ ├── jyutcitzi_web.jyutcit_phrases.dict.yaml
│ ├── jyutcitzi_web.phrase.dict.yaml
│ ├── jyutcitzi_font.dict.yaml
│ ├── jyutcitzi_font.lettered.dict.yaml
│ ├── jyutcitzi_font.compound.dict.yaml
│ ├── jyutcitzi_font.jyutcit_phrases.dict.yaml
│ ├── jyutcitzi_font.phrase.dict.yaml
│ └── ...
├── vendor/
│ └── js-yaml.min.js
└── README.md

No TypeScript required.

No bundler required.

No build system unless you add one later.

Implementation logic

Step 1 — Load YAML as-is

At extension startup, read all chosen YAML files and extract RIME dict rows:

OUTPUT<TAB>INPUT<TAB>WEIGHT

Examples already in your data:

output for single syllable key baa1

output for phrase key aa1 ban6

Invert into:

lookup[input] = output;

That is the entire data model. parser.js is only file format + YAML parsing, not linguistic parsing.

Step 2 — Prefix set

From every input key, register prefixes so longer phrase keys do not get cut off.

Example keys:

aa1

aa1 ban6

aa1 pin3 mau6 jik6

Then aa1 is an exact key; aa1 (with space) is a prefix path; aa1 ban6 is an exact key, etc. — implement concretely to match how keys appear in the dicts.

Step 3 — Capture typing

For input, textarea, and optionally later contenteditable: append allowed keypresses to a buffer (including spaces for phrase keys).

Step 4 — Lookup policy

On each keypress:

Exact match and also prefix of a longer key → wait until more input (or delimiter rule) resolves ambiguity.

Exact match and not a prefix → replace immediately.

Prefix only → wait.

Neither exact nor prefix → fall back to last exact match if you track one; otherwise reset buffer.

Step 5 — Replacement

Replace the typed Latin sequence in the active field with lookup[buffer] (for the committed key). Manage caret (selectionStart / selectionEnd for native fields).

Scope: ship today vs later

Must-have (today)

input, textarea

Web mode (jyutcitzi_web)

Exact / prefix matching

Backspace

Space-separated phrase input

Plain text field replacement

Can wait

contenteditable

Font mode toggle

Popup UI, site exclusions, hotkey toggle, settings sync

Delivery phases

Phase

Deliverable

1

Loads jyutcitzi_web; maps romanization to Jyutcitzi; phrases; works in normal text inputs

2

Same codepath; add jyutcitzi_font as alternate output mode

3

contenteditable and hostile-site handling

Explicit non-goals

The extension will not:

parse Jyutping as phonology

infer syllables

normalize tones beyond what keys already are

generate glyphs or compose radicals

reinterpret YAML semantics

rebuild RIME

invent separate candidate semantics (only exact/prefix timing, not ranking UI in v1)

It only uses the YAML mappings you already have.

Rejected / out of scope (do not add to this plan)

These were wrong for this product and must not reappear:

jyutpingParser.ts / INITIALS-FINALS phonology tables

composer.ts / PUA mapping stubs as a composition layer

“validate body against VALID_SYLLABLES”

Syllable → string as a core type

schema.json extraction / schema transpilation pipelines

“RIME-lite candidate engine”

“future SVG composer” as part of core architecture

Note: parser.js here means YAML + dict row extraction, not Jyutping linguistic parsing.

Optional follow-up (execution)

A literal file-by-file checklist: manifest.json script order, parser.js row extraction for real \*.dict.yaml structure, and content.js replacement snippet.

Repo note

The workspace may currently only have [README.md](/Users/hongjan/Documents/chrome-extension-jyutcitzi/README.md) until YAML files are added under yaml/.
