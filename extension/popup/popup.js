// Genrolly popup — orchestrates UI, talks to backend, imports leads from Apollo.

const BUILD_ENV = "development"; // Set to "production" for deployed builds
const PROD_BACKEND_URL = "https://your-production-backend.up.railway.app";
const DEV_BACKEND_URL = "http://localhost:8000";

const DEFAULTS = {
  backendUrl: BUILD_ENV === "production" ? PROD_BACKEND_URL : DEV_BACKEND_URL,
};

const FILTER_LABELS = {
  titles: "Titles",
  industries: "Industries",
  seniorities: "Seniority",
  locations: "Locations",
  employee_ranges: "Company size",
};

const state = {
  niche: "",
  leads: [],
  backendUrl: DEFAULTS.backendUrl,
  apiKey: "",
  apolloFilters: null,
  contactedLeadIds: new Set(),
  contactedEmails: new Set(),
  template: {
    custom_subject: "",
    custom_message: "",
    course_link: "",
    image_urls: [],
  },
  account: {
    tier: "Free",
    status: "Not connected",
    created_at: null,
    quota: "n/a",
  },
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get([
    "backendUrl",
    "apiKey",
    "niche",
    "apolloFilters",
    "template",
  ]);
  state.backendUrl = stored.backendUrl || DEFAULTS.backendUrl;
  state.apiKey = stored.apiKey || "";
  state.niche = stored.niche || "";
  state.apolloFilters = stored.apolloFilters || null;
  state.template = stored.template || {
    custom_subject: "",
    custom_message: "",
    course_link: "",
    image_urls: [],
  };
  const nicheInput = $("#niche");
  if (nicheInput) nicheInput.value = state.niche;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleDateString();
}

function showDevUI() {
  if (BUILD_ENV === "production") {
    $$(".dev-only").forEach((el) => el.remove());
  } else {
    $$(".dev-only").forEach((el) => {
      el.style.display = "inline-flex";
    });
  }
}

async function backendHealth() {
  const el = $("#backend-status");
  if (!el) return;
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

async function callBackend(path, body = null, method = "POST") {
  const options = {
    method,
    headers: {},
  };
  if (state.apiKey) options.headers["x-api-key"] = state.apiKey;
  if (body) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const res = await fetch(`${state.backendUrl}${path}`, options);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Backend ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

async function checkGmailStatus() {
  const dot = $("#settings-gmail-dot");
  const label = $("#settings-gmail-label");
  const btn = $("#settings-gmail-connect-btn");
  if (!dot || !label || !btn) return;

  try {
    const res = await fetch(`${state.backendUrl}/auth/gmail/status`, {
      headers: state.apiKey ? { "x-api-key": state.apiKey } : {},
    });
    if (res.ok) {
      const data = await res.json();
      if (data.connected) {
        dot.className = "dot ok";
        label.textContent = `Connected: ${data.email}`;
        btn.textContent = "Disconnect Gmail";
      } else {
        dot.className = "dot warn";
        label.textContent = "Not connected";
        btn.textContent = "Connect Gmail";
      }
    } else {
      dot.className = "dot warn";
      label.textContent = "Status unknown";
      btn.textContent = "Connect Gmail";
    }
  } catch {
    dot.className = "dot warn";
    label.textContent = "Connection error";
    btn.textContent = "Connect Gmail";
  }
}

async function connectGmail() {
  const btn = $("#settings-gmail-connect-btn");
  if (!btn) return;

  if (btn.textContent === "Disconnect Gmail") {
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
    const width = 600;
    const height = 700;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;
    window.open(data.auth_url, "Gmail OAuth", `width=${width},height=${height},left=${left},top=${top}`);

    const poll = setInterval(async () => {
      const statusCheck = await fetch(`${state.backendUrl}/auth/gmail/status`, {
        headers: state.apiKey ? { "x-api-key": state.apiKey } : {},
      });
      if (statusCheck.ok) {
        const statusData = await statusCheck.json();
        if (statusData.connected) {
          clearInterval(poll);
          await checkGmailStatus();
        }
      }
    }, 2000);

    setTimeout(() => clearInterval(poll), 300000);
  } catch (e) {
    alert(`Connection failed: ${e.message || e}`);
  } finally {
    btn.disabled = false;
  }
}

function displayApolloStatus() {
  const summary = $("#stats-summary");
  const importBtn = $("#refresh-leads-btn");
  if (!state.apolloFilters) {
    if (summary) {
      summary.textContent = "No target profile found. Set your filters in onboarding and open the Filters tab.";
    }
    if (importBtn) importBtn.disabled = true;
    return;
  }

  const activeCount = [
    ...(state.apolloFilters.titles || []),
    ...(state.apolloFilters.industries || []),
    ...(state.apolloFilters.locations || []),
    ...(state.apolloFilters.seniorities || []),
    ...(state.apolloFilters.employee_ranges || []),
  ].length;

  if (summary) {
    summary.textContent = activeCount
      ? `Using ${activeCount} active filter${activeCount !== 1 ? "s" : ""}.`
      : "No filters enabled in the current profile.";
  }
  if (importBtn) importBtn.disabled = activeCount === 0;
}

async function importFromApollo() {
  const errorField = $("#stats-summary");
  if (!state.apolloFilters) {
    if (errorField) errorField.textContent = "No Apollo profile configured. Please set filters in onboarding.";
    return;
  }

  const btn = $("#refresh-leads-btn");
  if (btn) btn.disabled = true;
  try {
    const result = await callBackend("/api/apollo/search", {
      titles: state.apolloFilters.titles?.length ? state.apolloFilters.titles : undefined,
      locations: state.apolloFilters.locations?.length ? state.apolloFilters.locations : undefined,
      seniorities: state.apolloFilters.seniorities?.length ? state.apolloFilters.seniorities : undefined,
      industries: state.apolloFilters.industries?.length ? state.apolloFilters.industries : undefined,
      employee_ranges: state.apolloFilters.employee_ranges?.length ? state.apolloFilters.employee_ranges : undefined,
      exclude_lead_ids: [...state.contactedLeadIds],
      exclude_emails: [...state.contactedEmails],
      per_page: 25,
    });

    const newLeads = (result.leads || []).map((lead) => ({
      ...lead,
      id: lead.id || `apollo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    }));

    const existingIds = new Set(state.leads.map((lead) => lead.id));
    const fresh = newLeads.filter(
      (lead) => !existingIds.has(lead.id) && !state.contactedLeadIds.has(lead.id)
    );

    state.leads = state.leads.concat(fresh);
    await chrome.storage.local.set({ leads: state.leads });
    renderLeads();
    renderStats();
    renderFilters();
    if (fresh.length > 0) switchTab("leads");

    if (errorField) {
      errorField.textContent = fresh.length
        ? `Imported ${fresh.length} lead${fresh.length !== 1 ? "s" : ""}.`
        : "No new leads found.";
    }
  } catch (e) {
    if (errorField) errorField.textContent = `Error: ${e.message || e}`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

function parseLeadDate(lead) {
  if (lead.created_at) {
    const date = new Date(lead.created_at);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date();
}

function renderLeads() {
  const list = $("#leads-list");
  const empty = $("#leads-empty");
  const count = $("#leads-count");
  count.textContent = `${state.leads.length} lead${state.leads.length !== 1 ? "s" : ""}`;
  empty.style.display = state.leads.length === 0 ? "block" : "none";
  list.innerHTML = "";

  for (const lead of state.leads) {
    const li = document.createElement("li");
    const location = lead.location ? ` · ${escapeHtml(lead.location)}` : "";
    li.innerHTML = `
      <div class="title">${escapeHtml(lead.name || "(unknown)")}</div>
      <div class="sub">${escapeHtml(lead.headline || "")}${location}</div>
      ${lead.snippet ? `<div class="sub">${escapeHtml(lead.snippet)}</div>` : ""}
      ${lead.email ? `<div class="sub" style="color:var(--primary);">${escapeHtml(lead.email)}</div>` : ""}
    `;
    list.appendChild(li);
  }
}

function renderStats() {
  const chart = $("#stats-chart");
  const totalEl = $("#metric-total-leads");
  const todayEl = $("#metric-new-today");
  const summary = $("#stats-summary");
  if (!chart || !totalEl || !todayEl || !summary) return;

  const now = new Date();
  const windowDays = [];
  const counts = {};
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - offset);
    const key = date.toISOString().slice(0, 10);
    windowDays.push({ key, label: date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) });
    counts[key] = 0;
  }

  for (const lead of state.leads) {
    const key = parseLeadDate(lead).toISOString().slice(0, 10);
    if (counts[key] !== undefined) counts[key] += 1;
  }

  const maxValue = Math.max(...Object.values(counts), 1);
  chart.innerHTML = "";
  windowDays.forEach(({ key, label }) => {
    const value = counts[key] || 0;
    const bar = document.createElement("div");
    bar.className = "chart-bar";
    bar.innerHTML = `
      <div class="chart-label">${escapeHtml(label)}</div>
      <div class="chart-track"><div class="chart-fill" style="width:${(value / maxValue) * 100}%"></div></div>
      <div class="chart-value">${value}</div>
    `;
    chart.appendChild(bar);
  });

  totalEl.textContent = String(state.leads.length);
  const todayKey = now.toISOString().slice(0, 10);
  todayEl.textContent = String(counts[todayKey] || 0);
  summary.textContent = `Showing lead volume for the last 7 days.`;
}

function renderFilters() {
  const chips = $("#filters-chips");
  const empty = $("#filters-empty");
  if (!chips || !empty) return;
  chips.innerHTML = "";

  if (!state.apolloFilters) {
    empty.style.display = "block";
    return;
  }

  let count = 0;
  for (const key of ["titles", "industries", "locations", "seniorities", "employee_ranges"]) {
    const values = state.apolloFilters[key] || [];
    for (const value of values) {
      count += 1;
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.innerHTML = `<span>${escapeHtml(FILTER_LABELS[key] || key)}: ${escapeHtml(value)}</span><button type="button">×</button>`;
      chip.querySelector("button").addEventListener("click", () => toggleFilter(key, value));
      chips.appendChild(chip);
    }
  }

  empty.style.display = count === 0 ? "block" : "none";
}

function toggleFilter(category, value) {
  if (!state.apolloFilters) return;
  state.apolloFilters[category] = (state.apolloFilters[category] || []).filter((item) => item !== value);
  if (!state.apolloFilters[category]?.length) {
    delete state.apolloFilters[category];
  }
  chrome.storage.sync.set({ apolloFilters: state.apolloFilters });
  renderFilters();
  displayApolloStatus();
}

function renderAccount() {
  $("#account-tier").textContent = state.account.tier;
  $("#account-status").textContent = state.account.status;
  $("#account-created").textContent = state.account.created_at ? formatDate(state.account.created_at) : "Not available";
  $("#account-quota").textContent = state.account.quota;
}

function renderSettings() {
  if ($("#settings-backend-url")) $("#settings-backend-url").textContent = state.backendUrl || "Not set";
  if ($("#settings-api-key")) $("#settings-api-key").textContent = state.apiKey ? "Configured" : "Not configured";
}

function fillTemplate(template, lead) {
  const subject = template.custom_subject && template.custom_subject.trim()
    ? template.custom_subject
    : `Quick question about ${lead.company}`;

  const bodyTemplate = template.custom_message && template.custom_message.trim()
    ? template.custom_message
    : `Hi ${lead.name},\n\nI help course creators like you grow enrollments with a better outreach strategy. I noticed your work in ${lead.headline} and wanted to share a fast way to get more students for ${template.course_link || "your course"}.\n\nWould you like to see a quick plan?`;

  const body = bodyTemplate
    .replace(/{{\s*name\s*}}/gi, lead.name)
    .replace(/{{\s*headline\s*}}/gi, lead.headline)
    .replace(/{{\s*company\s*}}/gi, lead.company)
    .replace(/{{\s*link\s*}}/gi, template.course_link || "your course");

  return { subject, body };
}

function renderTemplatePreview() {
  const subject = $("#preview-subject");
  const body = $("#preview-body");
  if (!subject || !body) return;
  if (!state.template.course_link?.trim()) {
    subject.textContent = "Add your course link to see a live preview.";
    body.textContent = "The course link is required for a complete email preview.";
    return;
  }
  const preview = fillTemplate(state.template, { name: "Alex", headline: "Course Creator", company: "Growth Academy" });
  subject.textContent = preview.subject;
  body.textContent = `${preview.body}\n\nLearn more: ${state.template.course_link}`;
}

function saveTemplate() {
  state.template.custom_subject = $("#template-subject").value.trim();
  state.template.custom_message = $("#template-message").value.trim();
  state.template.course_link = $("#template-course-link").value.trim();
  chrome.storage.sync.set({ template: state.template });
  renderTemplatePreview();
}

function loadTemplateUI() {
  if ($("#template-subject")) $("#template-subject").value = state.template.custom_subject || "";
  if ($("#template-message")) $("#template-message").value = state.template.custom_message || "";
  if ($("#template-course-link")) $("#template-course-link").value = state.template.course_link || "";
  renderImageUrls();
  renderTemplatePreview();
}

function renderImageUrls() {
  const list = $("#image-urls-list");
  if (!list) return;
  list.innerHTML = "";
  state.template.image_urls.forEach((url, index) => {
    const li = document.createElement("li");
    li.style.padding = "8px";
    li.style.display = "flex";
    li.style.alignItems = "center";
    li.style.justifyContent = "space-between";
    li.style.gap = "10px";
    li.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;max-width:220px;overflow:hidden;">
        <img src="${escapeHtml(url)}" alt="Image preview" style="width:40px;height:40px;border-radius:8px;object-fit:cover;" />
        <span style="font-size:11px;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Image ${index + 1}</span>
      </div>
      <button class="secondary small" type="button">Remove</button>
    `;
    li.querySelector("button").addEventListener("click", () => removeTemplateImage(index));
    list.appendChild(li);
  });
}

window.removeTemplateImage = function(index) {
  state.template.image_urls.splice(index, 1);
  chrome.storage.sync.set({ template: state.template });
  renderImageUrls();
  renderTemplatePreview();
};

async function handleImageFiles(event) {
  const files = Array.from(event.target.files || []);
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const reader = new FileReader();
    await new Promise((resolve) => {
      reader.onload = () => {
        if (typeof reader.result === "string") {
          state.template.image_urls.push(reader.result);
        }
        resolve();
      };
      reader.readAsDataURL(file);
    });
  }
  chrome.storage.sync.set({ template: state.template });
  renderImageUrls();
  renderTemplatePreview();
}

async function importGmailTemplate() {
  if (!state.apiKey || !state.backendUrl) {
    alert("Set your backend URL and API key first.");
    return;
  }

  try {
    const res = await fetch(`${state.backendUrl}/auth/gmail/import-template`, {
      headers: state.apiKey ? { "x-api-key": state.apiKey } : {},
    });
    if (!res.ok) {
      if (res.status === 404) {
        alert("Gmail template import is not yet supported on the current backend.");
        return;
      }
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    state.template.custom_subject = data.subject || state.template.custom_subject;
    state.template.custom_message = data.body || state.template.custom_message;
    chrome.storage.sync.set({ template: state.template });
    loadTemplateUI();
    alert("Imported Gmail draft template.");
  } catch (e) {
    alert(`Import failed: ${e.message || e}`);
  }
}

function exportLeads(format) {
  if (!state.leads.length) {
    alert("No leads to export.");
    return;
  }

  if (format === "json") {
    const blob = new Blob([JSON.stringify(state.leads, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `genrolly-leads-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  const header = ["name", "headline", "location", "email", "source", "url", "snippet", "created_at"];
  const rows = state.leads.map((lead) => header.map((key) => `"${String(lead[key] || "").replace(/"/g, '""')}"`).join(","));
  const csv = [header.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `genrolly-leads-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function fetchSubscriptionStatus() {
  if (!state.apiKey || !state.backendUrl) return;
  try {
    const data = await callBackend("/api/stripe/subscription-status", null, "GET");
    state.account = {
      tier: data.has_subscription ? "Premium" : "Free",
      status: data.status || (data.has_subscription ? "Active" : "None"),
      created_at: data.created_at || null,
      quota: data.has_subscription ? "Higher" : "Standard",
    };
  } catch {
    state.account = {
      tier: "Free",
      status: "Unknown",
      created_at: null,
      quota: "n/a",
    };
  }
  renderAccount();
}

async function saveNiche() {
  state.niche = $("#niche").value.trim();
  chrome.storage.sync.set({ niche: state.niche });
}

async function clearLeads() {
  if (!confirm("Clear all leads?")) return;
  state.leads = [];
  await chrome.storage.local.set({ leads: [] });
  renderLeads();
  renderStats();
}

function switchTab(name) {
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  $$(".panel").forEach((p) => p.classList.toggle("active", p.dataset.panel === name));
}

async function init() {
  await loadSettings();
  const stored = await chrome.storage.local.get(["leads"]);
  state.leads = stored.leads || [];

  renderLeads();
  renderStats();
  renderFilters();
  renderAccount();
  renderSettings();
  loadTemplateUI();
  showDevUI();
  displayApolloStatus();
  backendHealth();
  checkGmailStatus();
  fetchSubscriptionStatus();

  const nicheInput = $("#niche");
  if (nicheInput) nicheInput.addEventListener("input", saveNiche);
  const refreshButton = $("#refresh-leads-btn");
  if (refreshButton) refreshButton.addEventListener("click", importFromApollo);
  const importButton = $("#import-leads-btn");
  if (importButton) importButton.addEventListener("click", importFromApollo);
  const clearButton = $("#clear-leads-btn");
  if (clearButton) clearButton.addEventListener("click", clearLeads);
  const subjectInput = $("#template-subject");
  const messageInput = $("#template-message");
  const courseLinkInput = $("#template-course-link");
  if (subjectInput) subjectInput.addEventListener("input", saveTemplate);
  if (messageInput) messageInput.addEventListener("input", saveTemplate);
  if (courseLinkInput) courseLinkInput.addEventListener("input", saveTemplate);
  const imageInput = $("#image-input");
  if (imageInput) imageInput.addEventListener("change", handleImageFiles);
  const importGmailButton = $("#import-gmail-template");
  if (importGmailButton) importGmailButton.addEventListener("click", importGmailTemplate);
  const gmailButton = $("#settings-gmail-connect-btn");
  if (gmailButton) gmailButton.addEventListener("click", connectGmail);
  const exportJson = $("#export-json-btn");
  const exportCsv = $("#export-csv-btn");
  if (exportJson) exportJson.addEventListener("click", () => exportLeads("json"));
  if (exportCsv) exportCsv.addEventListener("click", () => exportLeads("csv"));

  const editProfile = $("#edit-profile-btn");
  if (editProfile) {
    editProfile.addEventListener("click", (event) => {
      event.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL("onboarding/onboarding.html") });
    });
  }

  $$(".tab").forEach((t) => t.addEventListener("click", () => switchTab(t.dataset.tab)));

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.apolloFilters) {
      state.apolloFilters = changes.apolloFilters.newValue;
      displayApolloStatus();
      renderFilters();
    }
    if (changes.niche) {
      state.niche = changes.niche.newValue;
      if (nicheInput) nicheInput.value = state.niche;
    }
    if (changes.template) {
      state.template = changes.template.newValue;
      loadTemplateUI();
    }
    if (changes.backendUrl) {
      state.backendUrl = changes.backendUrl.newValue;
      renderSettings();
      backendHealth();
    }
    if (changes.apiKey) {
      state.apiKey = changes.apiKey.newValue;
      renderSettings();
      checkGmailStatus();
    }
  });
}

init();
