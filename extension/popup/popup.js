// Genrolly popup — orchestrates UI, talks to backend, imports leads via Apollo.

const DEFAULTS = {
  backendUrl: "http://localhost:8000",
};

const FILTER_LABELS = {
  titles: "job titles",
  industries: "industries",
  seniorities: "seniority levels",
  locations: "locations",
  employee_ranges: "company sizes",
};

const state = {
  niche: "",
  leads: [],
  emails: [],
  backendUrl: DEFAULTS.backendUrl,
  apiKey: "",
  apolloFilters: null,
  // Deduplication: set of lead IDs + emails already contacted this session
  contactedLeadIds: new Set(),
  contactedEmails: new Set(),
  // Email template customization
  template: {
    custom_subject: "",
    custom_message: "",
    image_urls: [],
  },
};

// ---------- Helpers ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function setStatus(el, msg, kind = "") {
  el.textContent = msg;
  el.className = "status" + (kind ? " " + kind : "");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// ---------- Settings & state loading ----------
async function loadSettings() {
  const stored = await chrome.storage.sync.get([
    "backendUrl", "apiKey", "niche", "apolloFilters", "template",
  ]);
  state.backendUrl = stored.backendUrl || DEFAULTS.backendUrl;
  state.apiKey = stored.apiKey || "";
  state.niche = stored.niche || "";
  state.apolloFilters = stored.apolloFilters || null;
  state.template = stored.template || { custom_subject: "", custom_message: "", image_urls: [] };
  $("#niche").value = state.niche;
}

async function loadContactedIds() {
  // Load locally cached contacted IDs
  const stored = await chrome.storage.local.get(["contactedLeadIds", "contactedEmails"]);
  state.contactedLeadIds = new Set(stored.contactedLeadIds || []);
  state.contactedEmails = new Set((stored.contactedEmails || []).map((e) => e.toLowerCase()));

  // Sync with backend (best-effort — backend is authoritative)
  try {
    const res = await fetch(`${state.backendUrl}/api/leads/contacted-ids`, {
      headers: state.apiKey ? { "x-api-key": state.apiKey } : {},
    });
    if (res.ok) {
      const data = await res.json();
      for (const id of data.ids || []) state.contactedLeadIds.add(id);
      // Persist merged set locally
      await chrome.storage.local.set({
        contactedLeadIds: [...state.contactedLeadIds],
      });
    }
  } catch (_) { /* offline or not configured — local cache is sufficient */ }
}

async function recordContacted(leads) {
  for (const l of leads) {
    state.contactedLeadIds.add(l.id);
    if (l.email) state.contactedEmails.add(l.email.toLowerCase());
  }
  await chrome.storage.local.set({
    contactedLeadIds: [...state.contactedLeadIds],
    contactedEmails: [...state.contactedEmails],
  });
}

async function saveNiche() {
  state.niche = $("#niche").value.trim();
  await chrome.storage.sync.set({ niche: state.niche });
}

// ---------- Apollo status display ----------
function displayApolloStatus() {
  const dot = $("#apollo-dot");
  const label = $("#apollo-label");
  const btn = $("#scrape-btn");
  const summary = $("#apollo-filters-summary");

  if (!state.apolloFilters) {
    dot.className = "dot warn";
    label.textContent = "No target profile set — click 'Targets' to configure.";
    btn.disabled = true;
    summary.textContent = "";
    return;
  }

  const f = state.apolloFilters;
  const hasFilters = (
    f.titles?.length || f.industries?.length || f.locations?.length ||
    f.seniorities?.length || f.employee_ranges?.length
  );

  dot.className = hasFilters ? "dot ok" : "dot warn";
  label.textContent = hasFilters ? "Target profile configured" : "Profile is empty — add filters in Targets.";
  btn.disabled = !hasFilters;

  const parts = [];
  if (f.titles?.length) parts.push(`${f.titles.length} title${f.titles.length > 1 ? "s" : ""}`);
  if (f.industries?.length) parts.push(`${f.industries.length} industr${f.industries.length > 1 ? "ies" : "y"}`);
  if (f.locations?.length) parts.push(f.locations.slice(0, 2).join(", "));
  if (f.seniorities?.length) parts.push(f.seniorities.join(", "));
  summary.textContent = parts.length ? parts.join(" · ") : "";
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
        dot.className = "dot ok";
        label.textContent = `Connected: ${data.email}`;
        btn.textContent = "Disconnect";
        btn.classList.remove("primary");
        btn.classList.add("secondary");
      } else {
        dot.className = "dot warn";
        label.textContent = "Not connected";
        btn.textContent = "Connect Gmail";
        btn.classList.add("primary");
        btn.classList.remove("secondary");
      }
    } else {
      dot.className = "dot warn";
      label.textContent = "Status unknown";
    }
  } catch {
    dot.className = "dot warn";
    label.textContent = "Connection error";
  }
}

async function connectGmail() {
  const btn = $("#gmail-connect-btn");

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

  btn.disabled = true;
  btn.textContent = "Opening...";

  try {
    const res = await fetch(`${state.backendUrl}/auth/gmail/authorize`, {
      headers: state.apiKey ? { "x-api-key": state.apiKey } : {},
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const width = 600, height = 700;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;
    window.open(data.auth_url, "Gmail OAuth", `width=${width},height=${height},left=${left},top=${top}`);

    const poll = setInterval(async () => {
      const s = await fetch(`${state.backendUrl}/auth/gmail/status`, {
        headers: state.apiKey ? { "x-api-key": state.apiKey } : {},
      });
      if (s.ok) {
        const d = await s.json();
        if (d.connected) { clearInterval(poll); await checkGmailStatus(); }
      }
    }, 2000);
    setTimeout(() => clearInterval(poll), 300000);
  } catch (e) {
    alert(`Connection failed: ${e.message || e}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "Connect Gmail";
  }
}

// ---------- Apollo Lead Import ----------
async function importFromApollo() {
  const btn = $("#scrape-btn");
  const statusEl = $("#scrape-status");
  const f = state.apolloFilters;
  if (!f) return;

  btn.disabled = true;
  setStatus(statusEl, "Searching Apollo…");

  try {
    const result = await callBackend("/api/apollo/search", {
      titles: f.titles?.length ? f.titles : undefined,
      locations: f.locations?.length ? f.locations : undefined,
      seniorities: f.seniorities?.length ? f.seniorities : undefined,
      industries: f.industries?.length ? f.industries : undefined,
      employee_ranges: f.employee_ranges?.length ? f.employee_ranges : undefined,
      // Pass local contacted IDs so the backend can merge with its own list
      exclude_lead_ids: [...state.contactedLeadIds],
      exclude_emails: [...state.contactedEmails],
      per_page: 25,
    });

    const relaxed = result.relaxed_filters || [];
    const newLeads = (result.leads || []).map((l) => ({
      ...l,
      id: l.id || `apollo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    }));

    // Client-side dedup (belt + suspenders)
    const existingIds = new Set(state.leads.map((l) => l.id));
    const fresh = newLeads.filter(
      (l) => !existingIds.has(l.id) && !state.contactedLeadIds.has(l.id)
    );

    state.leads = state.leads.concat(fresh);
    await chrome.storage.local.set({ leads: state.leads });

    // Build status message
    let msg = `Found ${fresh.length} new lead${fresh.length !== 1 ? "s" : ""}`;
    if (result.total) msg += ` (${result.total.toLocaleString()} total in Apollo)`;
    if (relaxed.length) {
      const names = relaxed.map((k) => FILTER_LABELS[k] || k).join(", ");
      msg += `. Filters relaxed to get results: ${names} removed.`;
    }
    setStatus(statusEl, msg, fresh.length > 0 ? "ok" : "");

    if (fresh.length > 0) {
      renderLeads();
      switchTab("leads");
    }
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

  count.textContent = `${state.leads.length} lead${state.leads.length !== 1 ? "s" : ""}`;
  genBtn.disabled = state.leads.length === 0;
  empty.style.display = state.leads.length === 0 ? "block" : "none";

  list.innerHTML = "";
  for (const lead of state.leads) {
    const li = document.createElement("li");
    const location = lead.location ? ` · ${escapeHtml(lead.location)}` : "";
    const emailRow = lead.email
      ? `<div class="sub" style="color:var(--primary);">${escapeHtml(lead.email)}</div>`
      : "";
    li.innerHTML = `
      <div class="title">${escapeHtml(lead.name || "(unknown)")}</div>
      <div class="sub">${escapeHtml(lead.headline || "")}${location}</div>
      ${lead.snippet ? `<div class="sub">${escapeHtml(lead.snippet)}</div>` : ""}
      ${emailRow}
    `;
    list.appendChild(li);
  }
}

function renderEmails() {
  const list = $("#emails-list");
  const empty = $("#emails-empty");
  const count = $("#emails-count");
  const sendBtn = $("#send-btn");

  count.textContent = `${state.emails.length} draft${state.emails.length !== 1 ? "s" : ""}`;
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

// ---------- Generate emails ----------
async function generateEmails() {
  const btn = $("#generate-btn");
  if (state.leads.length === 0) return;
  btn.disabled = true;
  btn.textContent = "Generating…";
  try {
    const template = await getTemplate();
    const result = await callBackend("/api/emails/generate", {
      niche: state.niche,
      leads: state.leads,
      template: template,
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

    // Record successfully sent leads so they're never emailed again
    const sentLeadIds = (result.details || [])
      .filter((d) => d.ok)
      .map((d) => d.leadId);
    const sentLeads = state.leads.filter((l) => sentLeadIds.includes(l.id));
    if (sentLeads.length) await recordContacted(sentLeads);

    alert(`Sent: ${result.sent}, failed: ${result.failed}`);

    // Clear sent drafts from state
    const sentSet = new Set(sentLeadIds);
    state.emails = state.emails.filter((e) => !sentSet.has(e.leadId));
    state.leads = state.leads.filter((l) => !sentSet.has(l.id));
    await chrome.storage.local.set({ leads: state.leads, emails: state.emails });
    renderLeads();
    renderEmails();
  } catch (e) {
    alert(`Send failed: ${e.message || e}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "Send all";
  }
}

// ---------- Clear leads ----------
async function clearLeads() {
  if (!confirm("Clear all leads and drafts?")) return;
  state.leads = [];
  state.emails = [];
  await chrome.storage.local.set({ leads: [], emails: [] });
  renderLeads();
  renderEmails();
}

// ---------- Tabs ----------
function switchTab(name) {
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  $$(".panel").forEach((p) => p.classList.toggle("active", p.dataset.panel === name));
}

// ---------- Init ----------
async function init() {
  await loadSettings();
  const stored = await chrome.storage.local.get(["leads", "emails"]);
  state.leads = stored.leads || [];
  state.emails = stored.emails || [];
  renderLeads();
  renderEmails();
  loadTemplateUI();

  displayApolloStatus();
  backendHealth();
  checkGmailStatus();
  loadContactedIds(); // async, non-blocking

  $("#niche").addEventListener("input", saveNiche);
  $("#gmail-connect-btn").addEventListener("click", connectGmail);
  $("#scrape-btn").addEventListener("click", importFromApollo);
  $("#generate-btn").addEventListener("click", generateEmails);
  $("#send-btn").addEventListener("click", sendEmails);
  $("#clear-leads-btn").addEventListener("click", clearLeads);

  // Template event listeners
  $("#template-subject").addEventListener("change", saveTemplate);
  $("#template-message").addEventListener("change", saveTemplate);
  $("#add-image-btn").addEventListener("click", promptAddImageUrl);

  $("#open-options").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  $("#open-onboarding").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL("onboarding/onboarding.html") });
  });

  $("#edit-targets").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL("onboarding/onboarding.html") });
  });

  $$(".tab").forEach((t) =>
    t.addEventListener("click", () => switchTab(t.dataset.tab))
  );

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.apolloFilters) {
      state.apolloFilters = changes.apolloFilters.newValue;
      displayApolloStatus();
    }
    if (changes.niche) {
      state.niche = changes.niche.newValue;
      $("#niche").value = state.niche;
    }
    if (changes.template) {
      state.template = changes.template.newValue;
      loadTemplateUI();
    }
  });
}

// ---------- Template management ----------
function saveTemplate() {
  state.template.custom_subject = $("#template-subject").value;
  state.template.custom_message = $("#template-message").value;
  chrome.storage.sync.set({ template: state.template });
}

function loadTemplateUI() {
  $("#template-subject").value = state.template.custom_subject || "";
  $("#template-message").value = state.template.custom_message || "";
  renderImageUrls();
}

function renderImageUrls() {
  const list = $("#image-urls-list");
  list.innerHTML = "";
  for (const url of state.template.image_urls) {
    const li = document.createElement("li");
    li.style.padding = "6px";
    li.style.fontSize = "11px";
    li.innerHTML = `
      <div style="word-break:break-all;margin-bottom:4px;">${escapeHtml(url)}</div>
      <button class="secondary small" style="width:auto;" onclick="window.removeImageUrl('${escapeHtml(url)}')">Remove</button>
    `;
    list.appendChild(li);
  }
}

window.removeImageUrl = function(url) {
  state.template.image_urls = state.template.image_urls.filter(u => u !== url);
  saveTemplate();
  renderImageUrls();
}

function promptAddImageUrl() {
  const url = prompt("Enter image URL:");
  if (url && url.trim()) {
    if (!state.template.image_urls.includes(url.trim())) {
      state.template.image_urls.push(url.trim());
      saveTemplate();
      renderImageUrls();
    }
  }
}

async function getTemplate() {
  saveTemplate();
  return {
    custom_subject: state.template.custom_subject || null,
    custom_message: state.template.custom_message || null,
    image_urls: state.template.image_urls.length > 0 ? state.template.image_urls : null,
  };
}

init();
