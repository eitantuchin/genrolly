// Genrolly background service worker (MV3).

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    const existing = await chrome.storage.sync.get(["backendUrl"]);
    if (!existing.backendUrl) {
      await chrome.storage.sync.set({ backendUrl: "http://localhost:8000" });
    }
    // Open onboarding wizard on first install
    chrome.tabs.create({ url: chrome.runtime.getURL("onboarding/onboarding.html") });
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "GENROLLY_PING") {
    sendResponse({ ok: true, t: Date.now() });
    return true;
  }
  return false;
});
