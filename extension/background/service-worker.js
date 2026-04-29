// Genrolly background service worker (MV3).

const BUILD_ENV = "development"; // Set to "production" for deployed builds
const PROD_BACKEND_URL = "https://your-production-backend.up.railway.app";
const DEV_BACKEND_URL = "http://localhost:8000";
const DEFAULT_BACKEND_URL = BUILD_ENV === "production" ? PROD_BACKEND_URL : DEV_BACKEND_URL;

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    const existing = await chrome.storage.sync.get(["backendUrl"]);
    if (!existing.backendUrl) {
      await chrome.storage.sync.set({ backendUrl: DEFAULT_BACKEND_URL });
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
