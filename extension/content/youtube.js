// Genrolly YouTube content script.
// Scrapes commenters from a video page (DOM-based, what the user already sees).
//
// For scale, prefer the official YouTube Data API on the backend (videos.list +
// commentThreads.list). The DOM scraper here is great for one-off, niche-rich
// videos and avoids quota costs.

(function () {
  if (window.__genrollyYoutube) return;
  window.__genrollyYoutube = true;

  function scrapeComments() {
    const leads = [];
    const seen = new Set();

    // Comment threads
    document.querySelectorAll("ytd-comment-thread-renderer").forEach((thread) => {
      const main = thread.querySelector("ytd-comment-renderer, ytd-comment-view-model");
      if (!main) return;

      const nameEl = main.querySelector("#author-text, a#author-text, h3 a");
      const textEl = main.querySelector("#content-text, yt-formatted-string#content-text");
      const channelHref =
        main.querySelector("#author-text")?.getAttribute("href") ||
        main.querySelector("a#author-text")?.getAttribute("href") ||
        "";

      const name = (nameEl?.textContent || "").trim();
      const text = (textEl?.textContent || "").trim();
      if (!name || !text) return;

      const key = `${name}::${text.slice(0, 60)}`;
      if (seen.has(key)) return;
      seen.add(key);

      leads.push({
        name,
        headline: "YouTube commenter",
        url: channelHref ? `https://www.youtube.com${channelHref}` : "",
        snippet: text.slice(0, 600),
      });
    });

    return leads;
  }

  // Helpful: auto-scroll a few times so YouTube lazy-loads more comments before we scrape.
  async function loadMore(rounds = 4) {
    for (let i = 0; i < rounds; i++) {
      window.scrollTo(0, document.documentElement.scrollHeight);
      await new Promise((r) => setTimeout(r, 700));
    }
    window.scrollTo(0, 0);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "GENROLLY_SCRAPE" || msg.source !== "youtube") return false;
    (async () => {
      try {
        await loadMore(4);
        const leads = scrapeComments();
        sendResponse({ ok: true, leads });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true; // async response
  });
})();
