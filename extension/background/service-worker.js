// Genrolly background service worker (MV3).
// Mostly a relay between popup and content scripts, plus install hooks.

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    // Set sane defaults the first time the extension is installed.
    const existing = await chrome.storage.sync.get(["backendUrl"]);
    if (!existing.backendUrl) {
      await chrome.storage.sync.set({ backendUrl: "http://localhost:8000" });
    }
    chrome.runtime.openOptionsPage?.();
  }
});

// Relay handler: popup may send GENROLLY_PING to confirm the extension is healthy.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "GENROLLY_PING") {
    sendResponse({ ok: true, t: Date.now() });
    return true;
  }
  return false;
});
