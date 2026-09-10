document.documentElement.setAttribute("data-ar-helper", "1");
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.data?.type === "ar-profile-saved" || event.data?.type === "ar-sync-helper") {
    try {
      chrome.runtime.sendMessage({ type: "sync-profile" });
    } catch {}
  }
});
