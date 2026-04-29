// Genrolly onboarding wizard — collects user preferences and saves to chrome.storage.sync

const TOTAL_STEPS = 8;

const state = {
  step: 1,
  courseName: "",
  courseNiche: "",
  courseUrl: "",
  titles: [],          // custom + selected popular titles
  industries: [],      // selected industries
  locations: [],       // split from location input
  seniorities: [],     // selected seniority values
  employeeRanges: [],  // selected employee range values
  backendUrl: "http://localhost:8000",
  apiKey: "",

  // Available options (loaded from backend or fallback)
  availableTitles: [],
  availableIndustries: [],
  availableSeniorities: [],
  availableEmployeeRanges: [],
};

// ---- Fallback filter options (used if backend is unreachable) ----
const FALLBACK_OPTIONS = {
  popular_titles: [
    "Marketing Manager","Content Creator","Entrepreneur","Founder","CEO",
    "Business Coach","Consultant","Course Creator","Business Owner","Digital Marketer",
    "Social Media Manager","Product Manager","Sales Manager","Account Executive",
    "Director of Marketing","Head of Growth","Freelancer","Creative Director",
  ],
  industries: [
    "Marketing & Advertising","E-Learning","Education Management",
    "Professional Training & Coaching","Information Technology and Services",
    "Computer Software","Internet","Online Media","Financial Services",
    "Management Consulting","Health, Wellness and Fitness","Real Estate",
    "Human Resources","Media Production","Retail","Consumer Goods",
    "Hospitality","Non-profit Organization Management","Publishing","Design",
    "Arts and Crafts","Photography","Accounting","Entertainment","Sports",
  ],
  seniorities: [
    {value:"owner",label:"Owner"},{value:"founder",label:"Founder"},
    {value:"c_suite",label:"C-Suite"},{value:"partner",label:"Partner"},
    {value:"vp",label:"VP"},{value:"head",label:"Head"},
    {value:"director",label:"Director"},{value:"manager",label:"Manager"},
    {value:"senior",label:"Senior"},{value:"entry",label:"Entry Level"},
  ],
  employee_ranges: [
    {value:"1,10",label:"1–10"},{value:"11,50",label:"11–50"},
    {value:"51,200",label:"51–200"},{value:"201,500",label:"201–500"},
    {value:"501,1000",label:"501–1,000"},{value:"1001,2000",label:"1,001–2,000"},
    {value:"2001,5000",label:"2,001–5,000"},{value:"5001,10000",label:"5,001–10,000"},
    {value:"10001,99999999",label:"10,000+"},
  ],
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ---- Progress bar ----
function updateProgress() {
  const pct = ((state.step - 1) / (TOTAL_STEPS - 1)) * 100;
  $("#progress-bar").style.width = `${pct}%`;
}

// ---- Step navigation ----
function showStep(n) {
  $$(".step").forEach((s) => s.classList.toggle("active", parseInt(s.dataset.step) === n));
  const navBar = $("#nav-bar");
  // Hide nav on welcome (1) and success (8)
  navBar.classList.toggle("hidden", n === 1 || n === 8);
  $("#back-btn").style.visibility = n <= 2 ? "hidden" : "visible";
  updateProgress();
}

function goNext() {
  if (!validateStep(state.step)) return;
  collectStep(state.step);
  if (state.step === TOTAL_STEPS - 1) {
    buildSummary();
    saveAll();
  }
  state.step = Math.min(state.step + 1, TOTAL_STEPS);
  showStep(state.step);
}

function goBack() {
  state.step = Math.max(state.step - 1, 2);
  showStep(state.step);
}

// ---- Validation ----
function validateStep(step) {
  if (step === 2) {
    const niche = $("#course-niche").value.trim();
    if (!niche) {
      $("#course-niche").focus();
      $("#course-niche").style.borderColor = "#e74c3c";
      setTimeout(() => ($("#course-niche").style.borderColor = ""), 1500);
      return false;
    }
  }
  if (step === 7) {
    const url = $("#backend-url").value.trim();
    if (!url) {
      $("#backend-url").focus();
      $("#backend-url").style.borderColor = "#e74c3c";
      setTimeout(() => ($("#backend-url").style.borderColor = ""), 1500);
      return false;
    }
  }
  return true;
}

// ---- Collect values from each step ----
function collectStep(step) {
  if (step === 2) {
    state.courseName = $("#course-name").value.trim();
    state.courseNiche = $("#course-niche").value.trim();
    state.courseUrl = $("#course-url").value.trim();
  }
  if (step === 5) {
    const loc = $("#location-input").value.trim();
    state.locations = loc ? loc.split(",").map((s) => s.trim()).filter(Boolean) : [];
  }
  if (step === 7) {
    state.backendUrl = $("#backend-url").value.trim().replace(/\/$/, "");
    state.apiKey = $("#api-key").value.trim();
  }
}

// ---- Save everything to chrome.storage.sync ----
async function saveAll() {
  await chrome.storage.sync.set({
    courseName: state.courseName,
    niche: state.courseNiche,
    courseUrl: state.courseUrl,
    backendUrl: state.backendUrl,
    apiKey: state.apiKey,
    onboardingComplete: true,
    apolloFilters: {
      titles: state.titles,
      locations: state.locations,
      seniorities: state.seniorities,
      industries: state.industries,
      employee_ranges: state.employeeRanges,
    },
  });
}

// ---- Chip helpers ----
function renderChips(containerId, options, selectedArr, onToggle) {
  const container = $(`#${containerId}`);
  container.innerHTML = "";
  options.forEach((opt) => {
    const value = typeof opt === "string" ? opt : opt.value;
    const label = typeof opt === "string" ? opt : opt.label;
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (selectedArr.includes(value) ? " selected" : "");
    chip.textContent = label;
    chip.addEventListener("click", () => {
      onToggle(value);
      renderChips(containerId, options, selectedArr, onToggle);
    });
    container.appendChild(chip);
  });
}

function toggleValue(arr, value) {
  const i = arr.indexOf(value);
  if (i === -1) arr.push(value);
  else arr.splice(i, 1);
}

// ---- Titles step ----
function renderTitleChips() {
  renderChips("titles-chips", state.availableTitles, state.titles, (v) => {
    toggleValue(state.titles, v);
    renderSelectedTitles();
  });
}

function renderSelectedTitles() {
  const container = $("#selected-titles");
  container.innerHTML = "";
  // Show custom titles (not in popular list)
  const customs = state.titles.filter((t) => !state.availableTitles.includes(t));
  customs.forEach((t) => {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.innerHTML = `${escHtml(t)} <button aria-label="Remove">×</button>`;
    tag.querySelector("button").addEventListener("click", () => {
      toggleValue(state.titles, t);
      renderTitleChips();
      renderSelectedTitles();
    });
    container.appendChild(tag);
  });
}

function initTitleInput() {
  const input = $("#custom-title");
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && input.value.trim()) {
      const v = input.value.trim();
      if (!state.titles.includes(v)) state.titles.push(v);
      input.value = "";
      renderTitleChips();
      renderSelectedTitles();
    }
  });
}

// ---- Backend check ----
async function checkBackend() {
  const url = $("#backend-url").value.trim().replace(/\/$/, "");
  const key = $("#api-key").value.trim();
  const el = $("#backend-check");
  if (!url) return;
  el.textContent = "Checking connection…";
  el.style.color = "var(--muted)";
  try {
    const res = await fetch(`${url}/health`, {
      headers: key ? { "x-api-key": key } : {},
    });
    if (res.ok) {
      el.textContent = "✓ Connected successfully";
      el.style.color = "#16a34a";

      // Try loading filter options from real backend
      try {
        const optRes = await fetch(`${url}/api/apollo/filter-options`, {
          headers: key ? { "x-api-key": key } : {},
        });
        if (optRes.ok) {
          const opts = await optRes.json();
          state.availableTitles = opts.popular_titles || state.availableTitles;
          state.availableIndustries = opts.industries || state.availableIndustries;
          state.availableSeniorities = opts.seniorities || state.availableSeniorities;
          state.availableEmployeeRanges = opts.employee_ranges || state.availableEmployeeRanges;
          renderTitleChips();
          renderChips("industries-chips", state.availableIndustries, state.industries, (v) => toggleValue(state.industries, v));
          renderChips("seniority-chips", state.availableSeniorities, state.seniorities, (v) => toggleValue(state.seniorities, v));
          renderChips("employee-chips", state.availableEmployeeRanges, state.employeeRanges, (v) => toggleValue(state.employeeRanges, v));
        }
      } catch (_) {}
    } else {
      el.textContent = `⚠ HTTP ${res.status} — check your URL`;
      el.style.color = "#e67e22";
    }
  } catch {
    el.textContent = "✗ Could not reach backend";
    el.style.color = "#e74c3c";
  }
}

// ---- Summary ----
function buildSummary() {
  const el = $("#profile-summary");
  const rows = [
    ["Course", state.courseName || state.courseNiche || "—"],
    ["Niche", state.courseNiche || "—"],
    ["Job titles", state.titles.length ? state.titles.slice(0, 5).join(", ") + (state.titles.length > 5 ? ` +${state.titles.length - 5} more` : "") : "Any"],
    ["Industries", state.industries.length ? `${state.industries.length} selected` : "Any"],
    ["Locations", state.locations.length ? state.locations.join(", ") : "Anywhere"],
    ["Seniority", state.seniorities.length ? state.seniorities.join(", ") : "Any"],
    ["Company size", state.employeeRanges.length ? `${state.employeeRanges.length} range(s)` : "Any"],
    ["Backend", state.backendUrl],
  ];
  el.innerHTML = rows.map(([label, value]) => `
    <div class="summary-row">
      <span class="label">${label}</span>
      <span class="value">${escHtml(value)}</span>
    </div>
  `).join("");
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---- Init ----
async function init() {
  // Load stored settings
  const stored = await chrome.storage.sync.get(["backendUrl", "apiKey", "courseName", "niche", "courseUrl", "apolloFilters"]);
  if (stored.backendUrl) state.backendUrl = stored.backendUrl;
  if (stored.apiKey) state.apiKey = stored.apiKey;
  if (stored.courseName) state.courseName = stored.courseName;
  if (stored.niche) state.courseNiche = stored.niche;
  if (stored.courseUrl) state.courseUrl = stored.courseUrl;
  if (stored.apolloFilters) {
    const f = stored.apolloFilters;
    state.titles = f.titles || [];
    state.locations = f.locations || [];
    state.seniorities = f.seniorities || [];
    state.industries = f.industries || [];
    state.employeeRanges = f.employee_ranges || [];
  }

  // Populate form fields
  if (stored.backendUrl) $("#backend-url").value = stored.backendUrl;
  if (stored.apiKey) $("#api-key").value = stored.apiKey;
  if (stored.courseName) $("#course-name").value = stored.courseName;
  if (stored.niche) $("#course-niche").value = stored.niche;
  if (stored.courseUrl) $("#course-url").value = stored.courseUrl;
  if (stored.apolloFilters?.locations?.length) {
    $("#location-input").value = (stored.apolloFilters.locations || []).join(", ");
  }

  // Use fallback options initially
  state.availableTitles = FALLBACK_OPTIONS.popular_titles;
  state.availableIndustries = FALLBACK_OPTIONS.industries;
  state.availableSeniorities = FALLBACK_OPTIONS.seniorities;
  state.availableEmployeeRanges = FALLBACK_OPTIONS.employee_ranges;

  // Try to load real options from backend
  const url = state.backendUrl;
  const key = state.apiKey;
  try {
    const res = await fetch(`${url}/api/apollo/filter-options`, {
      headers: key ? { "x-api-key": key } : {},
    });
    if (res.ok) {
      const opts = await res.json();
      if (opts.popular_titles?.length) state.availableTitles = opts.popular_titles;
      if (opts.industries?.length) state.availableIndustries = opts.industries;
      if (opts.seniorities?.length) state.availableSeniorities = opts.seniorities;
      if (opts.employee_ranges?.length) state.availableEmployeeRanges = opts.employee_ranges;
    }
  } catch (_) {}

  // Render chips
  renderTitleChips();
  renderChips("industries-chips", state.availableIndustries, state.industries, (v) => toggleValue(state.industries, v));
  renderChips("seniority-chips", state.availableSeniorities, state.seniorities, (v) => toggleValue(state.seniorities, v));
  renderChips("employee-chips", state.availableEmployeeRanges, state.employeeRanges, (v) => toggleValue(state.employeeRanges, v));

  initTitleInput();

  // Events
  $("#start-btn").addEventListener("click", () => {
    state.step = 2;
    showStep(2);
  });

  $("#next-btn").addEventListener("click", goNext);
  $("#back-btn").addEventListener("click", goBack);

  $("#finish-btn").addEventListener("click", async () => {
    await saveAll();
    window.close();
  });

  // Backend health check on input blur
  $("#backend-url").addEventListener("blur", checkBackend);
  $("#api-key").addEventListener("blur", checkBackend);

  showStep(1);
}

init();
