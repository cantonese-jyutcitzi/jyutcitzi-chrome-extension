document.addEventListener("DOMContentLoaded", function () {
  chrome.storage.local.get({ outputMode: "web" }, function (r) {
    var v = r.outputMode === "font" ? "font" : "web";
    var input = document.querySelector('input[name="mode"][value="' + v + '"]');
    if (input) input.checked = true;
  });

  document.querySelectorAll('input[name="mode"]').forEach(function (el) {
    el.addEventListener("change", function () {
      if (!el.checked) return;
      chrome.storage.local.set({ outputMode: el.value });
    });
  });
});
