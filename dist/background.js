/**
 * Toolbar icon from bundled PNGs:
 * - imeEnabled off → icon128.png (greyed)
 * - imeEnabled on, not paused → icon128_on.png (green)
 * - imeEnabled on, paused → icon128_on_paused.png (pink)
 */
var ICON_SIZES = [16, 32, 48];
var SRC_SIZE = 128;

function iconSourcePath(imeEnabled, extensionPaused) {
  if (!imeEnabled) return "icons/icon128.png";
  if (extensionPaused) return "icons/icon128_on_paused.png";
  return "icons/icon128_on.png";
}

function titleForState(imeEnabled, extensionPaused) {
  if (!imeEnabled) return "Jyutcitzi — off";
  if (extensionPaused) return "Jyutcitzi — paused";
  return "Jyutcitzi — on";
}

async function imageDataSetFrom128Png(relativePath) {
  var url = chrome.runtime.getURL(relativePath);
  var res = await fetch(url);
  var blob = await res.blob();
  var bmp = await createImageBitmap(blob);
  var out = {};
  var j;
  var s;
  var canvas;
  var ctx;
  for (j = 0; j < ICON_SIZES.length; j++) {
    s = ICON_SIZES[j];
    canvas = new OffscreenCanvas(s, s);
    ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, SRC_SIZE, SRC_SIZE, 0, 0, s, s);
    out[String(s)] = ctx.getImageData(0, 0, s, s);
  }
  bmp.close();
  return out;
}

async function applyToolbarIcon(imeEnabled, extensionPaused) {
  var path = iconSourcePath(imeEnabled, extensionPaused);
  var imageData = await imageDataSetFrom128Png(path);
  await chrome.action.setIcon({ imageData: imageData });
  await chrome.action.setTitle({
    title: titleForState(imeEnabled, extensionPaused),
  });
}

async function syncIconFromStorage() {
  var r = await chrome.storage.local.get({
    imeEnabled: true,
    extensionPaused: false,
  });
  var enabled = r.imeEnabled !== false;
  var paused = enabled && r.extensionPaused === true;
  await applyToolbarIcon(enabled, paused);
}

function onStorageIconChange(changes, area) {
  if (area !== "local") return;
  if (!changes.imeEnabled && !changes.extensionPaused) return;
  syncIconFromStorage().catch(function (e) {
    console.error("[Jyutcitzi] setIcon failed", e);
  });
}

chrome.storage.onChanged.addListener(onStorageIconChange);

chrome.runtime.onMessage.addListener(function (msg) {
  if (msg && msg.type === "jyutcitziSyncToolbarIcon") {
    syncIconFromStorage().catch(function (e) {
      console.error("[Jyutcitzi] setIcon on message", e);
    });
  }
});

chrome.runtime.onInstalled.addListener(function () {
  syncIconFromStorage().catch(function (e) {
    console.error("[Jyutcitzi] sync icon on install", e);
  });
});

syncIconFromStorage().catch(function (e) {
  console.error("[Jyutcitzi] sync icon on startup", e);
});
