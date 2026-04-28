// Genrolly LinkedIn content script.
// Scrapes leads off LinkedIn search/people pages.
//
// IMPORTANT (legal/ToS): LinkedIn's User Agreement restricts automated scraping
// even from your own logged-in session. We only extract data the user can see
// during normal browsing, never bypass rate limits, and never persist to a
// server without the user's explicit click. This is meant to be used carefully.

(function () {
  if (window.__genrollyLinkedIn) return;
  window.__genrollyLinkedIn = true;

  function scrapeSearchResults() {
    const leads = [];
    // LinkedIn's class names change frequently. We try multiple selectors.
    const cardSelectors = [
      "li.reusable-search__result-container",
      "div.entity-result",
      "li.search-result",
    ];
    let cards = [];
    for (const sel of cardSelectors) {
      cards = document.querySelectorAll(sel);
      if (cards.length) break;
    }

    cards.forEach((card) => {
      const nameEl = card.querySelector(
        ".entity-result__title-text a, .actor-name, a.app-aware-link span[aria-hidden='true']"
      );
      const headlineEl = card.querySelector(
        ".entity-result__primary-subtitle, .subline-level-1, .entity-result__summary"
      );
      const locationEl = card.querySelector(
        ".entity-result__secondary-subtitle, .subline-level-2"
      );
      const linkEl = card.querySelector("a.app-aware-link[href*='/in/']");

      const name = (nameEl?.textContent || "").trim().split("\n")[0];
      if (!name) return;

      leads.push({
        name,
        headline: (headlineEl?.textContent || "").trim(),
        location: (locationEl?.textContent || "").trim(),
        url: linkEl?.href || "",
        snippet: "",
      });
    });

    return leads;
  }

  function scrapeProfile() {
    const name = document.querySelector("h1")?.textContent?.trim() || "";
    const headline =
      document.querySelector(".text-body-medium.break-words")?.textContent?.trim() || "";
    const about =
      document.querySelector("section[id*='about'] .display-flex span[aria-hidden='true']")
        ?.textContent?.trim() || "";
    if (!name) return [];
    return [
      {
        name,
        headline,
        location: "",
        url: location.href,
        snippet: about.slice(0, 500),
      },
    ];
  }

  function scrape() {
    const onSearch = /\/search\/results\/(people|all)/.test(location.pathname);
    if (onSearch) {
      const leads = scrapeSearchResults();
      if (leads.length) return leads;
    }
    if (/^\/in\//.test(location.pathname)) {
      return scrapeProfile();
    }
    // Fallback: try search-style scrape on any page
    return scrapeSearchResults();
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "GENROLLY_SCRAPE" || msg.source !== "linkedin") return false;
    try {
      const leads = scrape();
      sendResponse({ ok: true, leads });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
    return true;
  });
})();
