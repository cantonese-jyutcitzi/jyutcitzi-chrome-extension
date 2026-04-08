document.addEventListener("DOMContentLoaded", function () {
  chrome.storage.local.get({ outputMode: "web", imeEnabled: true }, function (r) {
    var v = r.outputMode === "font" ? "font" : "web";
    var input = document.querySelector('input[name="mode"][value="' + v + '"]');
    if (input) input.checked = true;
    var imeCb = document.getElementById("imeEnabled");
    if (imeCb) imeCb.checked = r.imeEnabled !== false;
  });

  var imeCb = document.getElementById("imeEnabled");
  if (imeCb) {
    imeCb.addEventListener("change", function () {
      chrome.storage.local.set({ imeEnabled: imeCb.checked });
    });
  }

  document.querySelectorAll('input[name="mode"]').forEach(function (el) {
    el.addEventListener("change", function () {
      if (!el.checked) return;
      chrome.storage.local.set({ outputMode: el.value });
    });
  });
});
