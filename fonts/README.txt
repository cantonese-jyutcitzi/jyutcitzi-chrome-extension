Candidate panel preview needs this file next to manifest.json:

  JyutcitziWithSourceHanSansHCRegular.ttf

From the jyutcitzi-fonts submodule (Jyutcitzi + Source Han Sans HC), create a symlink:

  cd /path/to/jyutcitzi-chrome-extension
  mkdir -p fonts
  ln -sf ../submodules/jyutcitzi-fonts/SourceHanSansHC/JyutcitziWithSourceHanSansHCRegular.ttf \
    fonts/JyutcitziWithSourceHanSansHCRegular.ttf

Or copy the TTF into fonts/ if you prefer.

Include fonts/*.ttf in any .zip you upload to the Chrome Web Store.
