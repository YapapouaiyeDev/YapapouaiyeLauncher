/* ============================================================
   YAPAPOUAIYE LAUNCHER - PUBLIC CLIENT APP
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  initNewsSystem();
});

// Markdown parser helper for simple headings, bold, italics, lists, code, links
function parseMarkdown(md) {
  if (!md) return "";
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Headers
  html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>");
  html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>");
  html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>");

  // Bold, Italics, Code
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Lists
  html = html.replace(/^\s*-\s+(.*$)/gim, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>)/gim, "<ul>$1</ul>");
  html = html.replace(/<\/ul>\s*<ul>/gim, "");

  // Paragraphs
  return html.split("\n\n").map(paragraph => {
    if (paragraph.startsWith("<h") || paragraph.startsWith("<ul") || paragraph.startsWith("<li")) {
      return paragraph;
    }
    return `<p>${paragraph.replace(/\n/g, "<br/>")}</p>`;
  }).join("");
}

// GitHub releases are patch notes, not public administration posts.
function isIndependentNewsPost(item) {
  if (!item) return false;
  const id = String(item.id || '').toLowerCase();
  return item.isGithubRelease !== true
    && String(item.isGithubRelease).toLowerCase() !== 'true'
    && !id.startsWith('gh-');
}

function filterIndependentNews(list) {
  return Array.isArray(list) ? list.filter(isIndependentNewsPost) : [];
}

// News System Controller
function initNewsSystem() {
  const gridEl = document.getElementById("news-cards-grid");
  if (!gridEl) return;

  let allNews = [];
  let currentCategory = "all";
  let searchQuery = "";

  // Modal elements
  const modal = document.getElementById("news-reader-modal");
  const modalCloseBtn = document.getElementById("btn-close-modal");
  const modalTitle = document.getElementById("modal-article-title");
  const modalBadge = document.getElementById("modal-article-badge");
  const modalDate = document.getElementById("modal-article-date");
  const modalAuthor = document.getElementById("modal-article-author");
  const modalVersion = document.getElementById("modal-article-version");
  const modalContent = document.getElementById("modal-article-content");
  const modalImage = document.getElementById("modal-article-image");

  // 0. Instant render from local cache if available
  try {
    const cached = localStorage.getItem("yapapouaiye_news_db");
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        allNews = filterIndependentNews(parsed);
        renderNews();
      }
    }
  } catch {}

  // BroadcastChannel for 0-latency inter-tab updates
  if ("BroadcastChannel" in window) {
    try {
      const syncChannel = new BroadcastChannel("yapapouaiye_news_sync");
      syncChannel.onmessage = (e) => {
        if (e.data && Array.isArray(e.data.news)) {
          allNews = filterIndependentNews(e.data.news);
          try { localStorage.setItem("yapapouaiye_news_db", JSON.stringify(allNews)); } catch {}
          renderNews();
        }
      };
    } catch {}
  }

  // Cross-tab synchronization via localStorage for older browsers
  window.addEventListener("storage", (e) => {
    if (e.key === "yapapouaiye_news_db") {
      try {
        allNews = e.newValue ? filterIndependentNews(JSON.parse(e.newValue)) : [];
        renderNews();
      } catch {}
    }
  });

  // Re-fetch immediately when the user focuses on the website tab
  window.addEventListener("focus", fetchNews);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") fetchNews();
  });

  // Background polling every 4 seconds to catch any external edits
  setInterval(fetchNews, 4000);

  // Fetch news from API or local fallback with instant cache busting
  async function fetchNews() {
    if (allNews.length === 0) {
      gridEl.innerHTML = `<div class="news-loading"><p>Chargement des nouveautés...</p></div>`;
    }
    try {
      const res = await fetch(`/api/news?_t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Pragma": "no-cache" }
      });
      if (res.ok) {
        const data = await res.json();
        allNews = filterIndependentNews(Array.isArray(data.news) ? data.news : Array.isArray(data.entries) ? data.entries : []);
        try { localStorage.setItem("yapapouaiye_news_db", JSON.stringify(allNews)); } catch {}
      } else {
        throw new Error("HTTP error " + res.status);
      }
    } catch (e) {
      try {
        const fallbackRes = await fetch(`/news.json?_t=${Date.now()}`, { cache: "no-store" });
        if (fallbackRes.ok) {
          const list = await fallbackRes.json();
          allNews = filterIndependentNews(list);
        } else {
          throw new Error("Local news.json not found");
        }
      } catch (err) {
        const cached = localStorage.getItem("yapapouaiye_news_db");
        try {
          allNews = cached ? filterIndependentNews(JSON.parse(cached)) : [];
        } catch {
          allNews = [];
        }
      }
    }

    renderNews();
  }

  function getBadgeClass(badge) {
    const b = (badge || "").toLowerCase();
    if (b.includes("modpack")) return "badge-modpack";
    if (b.includes("événement") || b.includes("evenement") || b.includes("event")) return "badge-event";
    if (b.includes("maintenance") || b.includes("important")) return "badge-maintenance";
    return "badge-update";
  }

  function renderNews() {
    let filtered = allNews.filter(item => {
      const matchesCategory =
        currentCategory === "all" ||
        (item.badge && item.badge.toLowerCase().includes(currentCategory.toLowerCase()));

      const matchesSearch =
        !searchQuery ||
        (item.title && item.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.summary && item.summary.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.content && item.content.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.version && item.version.toLowerCase().includes(searchQuery.toLowerCase()));

      return matchesCategory && matchesSearch;
    });

    if (allNews.length === 0) {
      gridEl.innerHTML = `
        <div class="empty-news-box" style="grid-column: 1 / -1; text-align: center; padding: 48px 20px; background: rgba(0,0,0,0.25); border: 1px dashed var(--panel-border); border-radius: var(--radius-md);">
          <p style="font-size: 16px; font-weight: 700; color: #ffffff; margin-bottom: 6px;">📢 Aucune annonce publiée pour le moment</p>
          <p style="font-size: 13px; color: var(--text-muted);">Les nouveautés apparaîtront ici dès leur publication depuis l'espace administration.</p>
        </div>
      `;
      return;
    }

    if (filtered.length === 0) {
      gridEl.innerHTML = `
        <div class="empty-news-box" style="grid-column: 1 / -1; text-align: center; padding: 36px 20px;">
          <p style="color: var(--text-muted);">Aucune nouveauté ne correspond à votre recherche.</p>
        </div>
      `;
      return;
    }

    gridEl.innerHTML = filtered.map(item => {
      const badgeClass = getBadgeClass(item.badge);
      const imgHtml = item.image
        ? `<div class="news-card-img-wrap"><img src="${item.image}" alt="${item.title}" class="news-card-img" loading="lazy" /></div>`
        : "";

      return `
        <article class="news-card" data-news-id="${item.id}">
          ${imgHtml}
          <div class="news-card-body">
            <div class="news-meta-row">
              <span class="badge ${badgeClass}">${item.badge || "Mise à jour"}</span>
              ${item.version ? `<span class="news-version-tag">${item.version}</span>` : ""}
            </div>
            <h3 class="news-card-title">${item.title}</h3>
            <p class="news-card-desc">${item.summary || (item.content ? item.content.slice(0, 140) + "..." : "")}</p>
            <div class="news-card-footer">
              <span>📅 ${item.date || "Récemment"}</span>
              <span class="read-more-link">Lire la suite →</span>
            </div>
          </div>
        </article>
      `;
    }).join("");

    // Wire card click events
    gridEl.querySelectorAll(".news-card").forEach(card => {
      card.addEventListener("click", () => {
        const id = card.dataset.newsId;
        const item = allNews.find(n => n.id === id);
        if (item) openNewsModal(item);
      });
    });
  }

  function openNewsModal(item) {
    if (!modal) return;
    if (modalTitle) modalTitle.textContent = item.title;
    if (modalBadge) {
      modalBadge.textContent = item.badge || "Mise à jour";
      modalBadge.className = `badge ${getBadgeClass(item.badge)}`;
    }
    if (modalDate) modalDate.textContent = item.date ? `Publié le ${item.date}` : "";
    if (modalAuthor) modalAuthor.textContent = item.author ? `par ${item.author}` : "";
    if (modalVersion) modalVersion.textContent = item.version || "";

    if (modalImage) {
      if (item.image) {
        modalImage.src = item.image;
        modalImage.classList.remove("hidden");
      } else {
        modalImage.src = "";
        modalImage.classList.add("hidden");
      }
    }

    if (modalContent) {
      modalContent.innerHTML = parseMarkdown(item.content || item.summary || "");
    }

    modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  function closeNewsModal() {
    if (!modal) return;
    modal.classList.add("hidden");
    document.body.style.overflow = "";
  }

  if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeNewsModal);
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeNewsModal();
    });
  }

  // Category filter chips
  document.querySelectorAll(".category-chips .chip-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".category-chips .chip-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentCategory = btn.dataset.category || "all";
      renderNews();
    });
  });

  // Search input
  const searchInput = document.getElementById("news-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value.trim();
      renderNews();
    });
  }

  fetchNews();
}
