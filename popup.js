document.addEventListener("DOMContentLoaded", function () {
  chrome.storage.local.get(
    { outputMode: "font", imeEnabled: true, globalPuaFontRendering: true },
    function (r) {
      var v = r.outputMode === "font" ? "font" : "web";
      var input = document.querySelector('input[name="mode"][value="' + v + '"]');
      if (input) input.checked = true;
      var imeCb = document.getElementById("imeEnabled");
      if (imeCb) imeCb.checked = r.imeEnabled !== false;
      var globalPuaCb = document.getElementById("globalPuaFontRendering");
      if (globalPuaCb) globalPuaCb.checked = r.globalPuaFontRendering === true;
    },
  );

  var imeCb = document.getElementById("imeEnabled");
  if (imeCb) {
    imeCb.addEventListener("change", function () {
      if (imeCb.checked) {
        chrome.storage.local.set({ imeEnabled: true });
      } else {
        chrome.storage.local.set({ imeEnabled: false, extensionPaused: false });
      }
    });
  }

  var globalPuaCb = document.getElementById("globalPuaFontRendering");
  if (globalPuaCb) {
    globalPuaCb.addEventListener("change", function () {
      chrome.storage.local.set({ globalPuaFontRendering: globalPuaCb.checked });
    });
  }

  document.querySelectorAll('input[name="mode"]').forEach(function (el) {
    el.addEventListener("change", function () {
      if (!el.checked) return;
      chrome.storage.local.set({ outputMode: el.value });
    });
  });
});
