// Genrolly popup — orchestrates UI, talks to content scripts (via background) and the backend.

const DEFAULTS = {
  backendUrl: "http://localhost:8000",
};

// ---------- State ----------
const state = {
  niche: "",
  source: null,
  leads: [],     // { id, source, name, headline, url, snippet }
  emails: [],    // { leadId, subject, body, status }
  backendUrl: DEFAULTS.backendUrl,
  apiKey: "",
};

// ---------- Helpers ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function setStatus(el, msg, kind = "") {
  el.textContent = msg;
  el.className = "status" + (kind ? " " + kind : "");
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get(["backendUrl", "apiKey", "niche"]);
  state.backendUrl = stored.backendUrl || DEFAULTS.backendUrl;
  state.apiKey = stored.apiKey || "";
  state.niche = stored.niche || "";
  $("#niche").value = state.niche;
}

async function saveNiche() {
  state.niche = $("#niche").value.trim();
  await chrome.storage.sync.set({ niche: state.niche });
}

async function detectSource() {
  const dot = $("#source-detect .dot");
  const label = $("#source-label");
  const btn = $("#scrape-btn");

  dot.classList.add("warn");
  label.textContent = "Apollo lead import is not configured yet.";
  btn.disabled = true;
  btn.textContent = "Import leads via Apollo";
}

// ---------- Backend ----------
async function backendHealth() {
  const el = $("#backend-status");
  try {
    const res = await fetch(`${state.backendUrl}/health`, {
      headers: state.apiKey ? { "x-api-key": state.apiKey } : {},
    });
    if (res.ok) {
      el.textContent = "Backend: connected";
      el.style.color = "var(--success)";
    } else {
      el.textContent = `Backend: HTTP ${res.status}`;
      el.style.color = "var(--danger)";
    }
  } catch {
    el.textContent = "Backend: unreachable";
    el.style.color = "var(--danger)";
  }
}

// ---------- Gmail OAuth ----------
async function checkGmailStatus() {
  const dot = $("#gmail-status .dot");
  const label = $("#gmail-label");
  const btn = $("#gmail-connect-btn");

  try {
    const res = await fetch(`${state.backendUrl}/auth/gmail/status`, {
      headers: state.apiKey ? { "x-api-key": state.apiKey } : {},
    });

    if (res.ok) {
      const data = await res.json();
      if (data.connected) {
        dot.classList.add("ok");
        label.textContent = `Connected: ${data.email}`;
        btn.textContent = "Disconnect";
        btn.classList.remove("primary");
        btn.classList.add("secondary");
      } else {
        dot.classList.add("warn");
        label.textContent = "Not connected";
        btn.textContent = "Connect Gmail";
        btn.classList.add("primary");
        btn.classList.remove("secondary");
      }
    } else {
      dot.classList.add("warn");
      label.textContent = "Status unknown";
    }
  } catch (e) {
    dot.classList.add("warn");
    label.textContent = "Connection error";
  }
}

async function connectGmail() {
  const btn = $("#gmail-connect-btn");

  // Check if already connected (button shows "Disconnect")
  if (btn.textContent === "Disconnect") {
    if (!confirm("Disconnect Gmail? You won't be able to send emails.")) return;

    try {
      await fetch(`${state.backendUrl}/auth/gmail/disconnect`, {
        method: "POST",
        headers: state.apiKey ? { "x-api-key": state.apiKey } : {},
      });
      await checkGmailStatus();
    } catch (e) {
      alert(`Disconnect failed: ${e.message || e}`);
    }
    return;
  }

  // Start OAuth flow
  btn.disabled = true;
  btn.textContent = "Opening...";

  try {
    const res = await fetch(`${state.backendUrl}/auth/gmail/authorize`, {
      headers: state.apiKey ? { "x-api-key": state.apiKey } : {},
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    // Open OAuth URL in new window
    const width = 600;
    const height = 700;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;

    window.open(
      data.auth_url,
      "Gmail OAuth",
      `width=${width},height=${height},left=${left},top=${top}`
    );

    // Poll for connection status
    const pollInterval = setInterval(async () => {
      const statusRes = await fetch(`${state.backendUrl}/auth/gmail/status`, {
        headers: state.apiKey ? { "x-api-key": state.apiKey } : {},
      });

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData.connected) {
          clearInterval(pollInterval);
          await checkGmailStatus();
        }
      }
    }, 2000);

    // Stop polling after 5 minutes
    setTimeout(() => clearInterval(pollInterval), 300000);

  } catch (e) {
    alert(`Connection failed: ${e.message || e}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "Connect Gmail";
  }
}

async function callBackend(path, body) {
  const res = await fetch(`${state.backendUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(state.apiKey ? { "x-api-key": state.apiKey } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Backend ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

// ---------- Scrape ----------
async function scrape() {
  const btn = $("#scrape-btn");
  const statusEl = $("#scrape-status");
  if (!state.tabId || !state.source) return;

  await saveNiche();
  btn.disabled = true;
  setStatus(statusEl, "Scraping page…");

  try {
    const response = await chrome.tabs.sendMessage(state.tabId, {
      type: "GENROLLY_SCRAPE",
      source: state.source,
    });
    const leads = (response?.leads || []).map((l, i) => ({
      id: `${Date.now()}-${i}`,
      source: state.source,
      ...l,
    }));
    state.leads = state.leads.concat(leads);
    await chrome.storage.local.set({ leads: state.leads });
    setStatus(statusEl, `Found ${leads.length} leads.`, "ok");
    renderLeads();
    switchTab("leads");
  } catch (e) {
    setStatus(statusEl, `Error: ${e.message || e}`, "err");
  } finally {
    btn.disabled = false;
  }
}

// ---------- Render ----------
function renderLeads() {
  const list = $("#leads-list");
  const empty = $("#leads-empty");
  const count = $("#leads-count");
  const genBtn = $("#generate-btn");

  count.textContent = `${state.leads.length} leads`;
  genBtn.disabled = state.leads.length === 0;
  empty.style.display = state.leads.length === 0 ? "block" : "none";

  list.innerHTML = "";
  for (const lead of state.leads) {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="title">${escapeHtml(lead.name || "(unknown)")}</div>
      <div class="sub">${escapeHtml(lead.source)} · ${escapeHtml(lead.headline || "")}</div>
      ${lead.snippet ? `<div class="body">${escapeHtml(lead.snippet)}</div>` : ""}
    `;
    list.appendChild(li);
  }
}

function renderEmails() {
  const list = $("#emails-list");
  const empty = $("#emails-empty");
  const count = $("#emails-count");
  const sendBtn = $("#send-btn");

  count.textContent = `${state.emails.length} drafts`;
  sendBtn.disabled = state.emails.length === 0;
  empty.style.display = state.emails.length === 0 ? "block" : "none";

  list.innerHTML = "";
  for (const draft of state.emails) {
    const lead = state.leads.find((l) => l.id === draft.leadId);
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="title">${escapeHtml(lead?.name || "(unknown)")}</div>
      <div class="sub">${escapeHtml(draft.subject || "")}</div>
      <div class="body">${escapeHtml(draft.body || "")}</div>
    `;
    list.appendChild(li);
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// ---------- Generate emails ----------
async function generateEmails() {
  const btn = $("#generate-btn");
  if (state.leads.length === 0) return;
  btn.disabled = true;
  btn.textContent = "Generating…";
  try {
    const result = await callBackend("/api/emails/generate", {
      niche: state.niche,
      leads: state.leads,
    });
    state.emails = result.emails || [];
    await chrome.storage.local.set({ emails: state.emails });
    renderEmails();
    switchTab("emails");
  } catch (e) {
    alert(`Generate failed: ${e.message || e}`);
  } finally {
    btn.disabled = state.leads.length === 0;
    btn.textContent = "Generate emails";
  }
}

// ---------- Send emails ----------
async function sendEmails() {
  const btn = $("#send-btn");
  if (state.emails.length === 0) return;
  if (!confirm(`Send ${state.emails.length} email(s)?`)) return;
  btn.disabled = true;
  btn.textContent = "Sending…";
  try {
    const result = await callBackend("/api/emails/send", {
      emails: state.emails,
      leads: state.leads,
    });
    alert(`Sent: ${result.sent}, failed: ${result.failed}`);
  } catch (e) {
    alert(`Send failed: ${e.message || e}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "Send all";
  }
}

// ---------- Tabs ----------
function switchTab(name) {
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  $$(".panel").forEach((p) => p.classList.toggle("active", p.dataset.panel === name));
}

// ---------- Init ----------
async function init() {
  await loadSettings();
  // Restore prior session
  const stored = await chrome.storage.local.get(["leads", "emails"]);
  state.leads = stored.leads || [];
  state.emails = stored.emails || [];
  renderLeads();
  renderEmails();

  await detectSource();
  backendHealth();
  checkGmailStatus();

  $("#niche").addEventListener("input", saveNiche);
  $("#gmail-connect-btn").addEventListener("click", connectGmail);
  $("#scrape-btn").addEventListener("click", scrape);
  $("#generate-btn").addEventListener("click", generateEmails);
  $("#send-btn").addEventListener("click", sendEmails);
  $("#open-options").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  $$(".tab").forEach((t) =>
    t.addEventListener("click", () => switchTab(t.dataset.tab))
  );
}

init();
