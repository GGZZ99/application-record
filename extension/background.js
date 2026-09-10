const PROFILE_URL = "http://127.0.0.1:8787/api/profile";
const emptyProfile = () => ({ version: 1, entries: [] });

let initializing;

function initialize() {
  if (!initializing) {
    initializing = (async () => {
      const { profile } = await chrome.storage.local.get("profile");
      if (!profile) await chrome.storage.local.set({ profile: emptyProfile() });
      await syncProfile();
    })().finally(() => {
      initializing = null;
    });
  }
  return initializing;
}

async function syncProfile() {
  try {
    const res = await fetch(PROFILE_URL);
    if (!res.ok) return false;
    const profile = await res.json();
    if (!profile || profile.version !== 1 || !Array.isArray(profile.entries)) return false;
    await chrome.storage.local.set({ profile });
    return true;
  } catch {
    return false;
  }
}

chrome.runtime.onInstalled.addListener(() => initialize());
chrome.runtime.onStartup.addListener(() => initialize());

chrome.action.onClicked.addListener(async (tab) => {
  const opening = chrome.sidePanel.open({ windowId: tab.windowId });
  try {
    await opening;
    await initialize();
    await syncProfile();
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["engine.js", "content.js"],
    });
    await chrome.storage.session.set({
      pageStatus: "已在当前网页启用，资料已从应聘记录同步",
      context: "",
    });
  } catch {
    await chrome.storage.session.set({
      pageStatus: "此页面无法启用。请打开普通网申网页后再点击扩展图标。",
      context: "",
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.tab && message.type === "context") {
    chrome.storage.session.set({ context: String(message.text).slice(0, 300), dateField: !!message.date });
  }
  if (message.type === "sync-profile") {
    syncProfile().then((ok) => sendResponse({ ok }));
    return true;
  }
  if (message.type === "ping") {
    sendResponse({ installed: true });
  }
});
