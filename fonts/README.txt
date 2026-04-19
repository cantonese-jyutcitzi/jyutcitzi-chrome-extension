Candidate panel preview needs this file next to manifest.json:

  JyutcitziWithSourceHanSansHCRegular.ttf

From the jyutcitzi-fonts submodule (Jyutcitzi + Source Han Sans HC), create a symlink:

  cd /path/to/jyutcitzi-chrome-extension
  mkdir -p fonts
  ln -sf ../submodules/jyutcitzi-fonts/SourceHanSansHC/JyutcitziWithSourceHanSansHCRegular.ttf \
    fonts/JyutcitziWithSourceHanSansHCRegular.ttf

Or copy the TTF into fonts/ if you prefer.

---

Chrome Web Store / release zips

Symlinks are OK for local "Load unpacked" only. The Chrome Web Store (and most zip tools) need real file bytes inside the package.

Before publishing, run from the repo root:

  ./scripts/build-extension-dist.sh

Upload the generated jyutcitzi-chrome-extension-dist.zip (or the dist/ folder zipped yourself). See README.md "Build for Chrome Web Store".

Include fonts/*.ttf in any .zip you upload to the Chrome Web Store.
