const FIELDS = ["backendUrl", "apiKey", "senderName", "senderEmail"];

async function load() {
  const stored = await chrome.storage.sync.get(FIELDS);
  for (const f of FIELDS) {
    const el = document.getElementById(f);
    if (el) el.value = stored[f] || "";
  }
}

async function save() {
  const data = {};
  for (const f of FIELDS) {
    const el = document.getElementById(f);
    if (el) data[f] = el.value.trim();
  }
  await chrome.storage.sync.set(data);
  const saved = document.getElementById("saved");
  saved.hidden = false;
  setTimeout(() => (saved.hidden = true), 1500);
}

document.getElementById("save").addEventListener("click", save);
load();
