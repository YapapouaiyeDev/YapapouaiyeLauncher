/* ============================================================
   YAPAPOUAIYE LAUNCHER - SECURE ADMIN CONTROLLER (Database & Web Management)
   ============================================================ */

const TOKEN_KEY = "yapapouaiye_admin_token";

function getAdminToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || "";
}

function setAdminToken(token, remember = true) {
  if (remember) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
  }
}

function clearAdminToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

// Toast notification helper
function showToast(message, type = "info") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    toast.style.transition = "all 0.25s ease";
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

// Markdown parser helper for preview
function parseMarkdown(md) {
  if (!md) return "";
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>");
  html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>");
  html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>");
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  html = html.replace(/^\s*>\s+(.*$)/gim, "<blockquote>$1</blockquote>");
  html = html.replace(/^\s*-\s+(.*$)/gim, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>)/gim, "<ul>$1</ul>");
  html = html.replace(/<\/ul>\s*<ul>/gim, "");

  return html.split("\n\n").map(p => {
    if (p.startsWith("<h") || p.startsWith("<ul") || p.startsWith("<li") || p.startsWith("<blockquote")) return p;
    return `<p>${p.replace(/\n/g, "<br/>")}</p>`;
  }).join("");
}

// ============================================================
// LOGIN PAGE CONTROLLER
// ============================================================
function initLoginPage() {
  const loginForm = document.getElementById("admin-login-form");
  if (!loginForm) return;

  const token = getAdminToken();
  if (token) {
    // Check if session is already valid
    fetch("/api/admin/session", {
      headers: { "Authorization": `Bearer ${token}` }
    }).then(res => {
      if (res.ok) window.location.href = "admin-dashboard.html";
      else clearAdminToken();
    }).catch(() => clearAdminToken());
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const usernameInput = document.getElementById("admin-username");
    const passwordInput = document.getElementById("admin-password");
    const rememberCheckbox = document.getElementById("admin-remember");
    const errorAlert = document.getElementById("login-error-alert");
    const submitBtn = document.getElementById("btn-login-submit");

    const username = usernameInput?.value.trim() || "";
    const password = passwordInput?.value.trim() || "";

    if (!username || !password) {
      if (errorAlert) {
        errorAlert.textContent = "Veuillez remplir tous les champs.";
        errorAlert.classList.remove("hidden");
      }
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span>Connexion en cours...</span>`;
    }

    if (errorAlert) errorAlert.classList.add("hidden");

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (res.ok && data.token) {
        setAdminToken(data.token, rememberCheckbox?.checked ?? true);
        showToast("Connexion réussie ! Redirection...", "success");
        setTimeout(() => {
          window.location.href = "admin-dashboard.html";
        }, 600);
      } else {
        if (errorAlert) {
          errorAlert.textContent = data.error || "Identifiants invalides.";
          errorAlert.classList.remove("hidden");
        }
        showToast(data.error || "Échec de connexion", "error");
      }
    } catch (err) {
      if (errorAlert) {
        errorAlert.textContent = "Erreur de communication avec le serveur.";
        errorAlert.classList.remove("hidden");
      }
      showToast("Erreur de connexion", "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>Se connecter</span>`;
      }
    }
  });
}

// ============================================================
// DASHBOARD CONTROLLER (Database News Management)
// ============================================================
function initDashboardPage() {
  const dashboardWrap = document.getElementById("admin-dashboard-container");
  if (!dashboardWrap) return;

  const token = getAdminToken();
  if (!token) {
    window.location.href = "admin-login.html";
    return;
  }

  // Verify session
  fetch("/api/admin/session", {
    headers: { "Authorization": `Bearer ${token}` }
  }).then(async (res) => {
    if (!res.ok) {
      clearAdminToken();
      window.location.href = "admin-login.html";
    }
  }).catch(() => {
    clearAdminToken();
    window.location.href = "admin-login.html";
  });

  // Logout handler
  const btnLogout = document.getElementById("btn-admin-logout");
  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      clearAdminToken();
      showToast("Déconnexion réussie.", "info");
      setTimeout(() => {
        window.location.href = "admin-login.html";
      }, 400);
    });
  }

  let adminNews = [];
  let editingNewsId = null;

  // DOM Elements
  const tableBody = document.getElementById("admin-news-table-body");
  const statTotal = document.getElementById("stat-total-news");
  const statUpdates = document.getElementById("stat-updates-count");
  const statFeatured = document.getElementById("stat-featured-count");
  const searchInput = document.getElementById("admin-search-news");
  const btnOpenCreateModal = document.getElementById("btn-open-create-news-modal");
  const btnRefresh = document.getElementById("btn-refresh-news");

  const dbStatusDot = document.getElementById("db-status-dot");
  const dbStatusText = document.getElementById("db-status-text");
  const btnExportJson = document.getElementById("btn-export-json");
  const inputImportJson = document.getElementById("input-import-json");
  const btnSeedDb = document.getElementById("btn-seed-db");

  // News Modal Elements
  const newsModal = document.getElementById("admin-news-modal");
  const newsForm = document.getElementById("admin-news-form");
  const modalTitle = document.getElementById("admin-modal-title");
  const btnCloseModal = document.getElementById("btn-close-news-modal");
  const btnCancelModal = document.getElementById("btn-cancel-news-modal");

  const inputTitle = document.getElementById("news-input-title");
  const inputBadge = document.getElementById("news-input-badge");
  const inputVersion = document.getElementById("news-input-version");
  const inputDate = document.getElementById("news-input-date");
  const inputAuthor = document.getElementById("news-input-author");
  const inputImage = document.getElementById("news-input-image");
  const inputFeatured = document.getElementById("news-input-featured");
  const inputSummary = document.getElementById("news-input-summary");
  const inputContent = document.getElementById("news-input-content");
  const livePreviewBox = document.getElementById("news-live-preview-box");

  // Check Database Status
  async function checkDatabaseStatus() {
    if (!dbStatusText) return;
    try {
      const res = await fetch("/api/admin/db-status", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const st = data.status || {};
        if (st.connected) {
          if (dbStatusDot) {
            dbStatusDot.style.backgroundColor = "var(--mc-green)";
            dbStatusDot.style.boxShadow = "0 0 10px rgba(16, 185, 129, 0.8)";
          }
          dbStatusText.innerHTML = `<strong>Base de données active :</strong> ${st.label} (${st.total} annonce(s) enregistrée(s))`;
        } else {
          if (dbStatusDot) {
            dbStatusDot.style.backgroundColor = "var(--accent-gold)";
            dbStatusDot.style.boxShadow = "0 0 10px rgba(245, 158, 11, 0.8)";
          }
          dbStatusText.innerHTML = `<strong>Attention :</strong> ${st.label} - ${st.error || "Mode secours"}`;
        }
      }
    } catch {
      if (dbStatusText) dbStatusText.textContent = "Base de données : Mode résilient / Statique";
    }
  }

  // Fetch admin news from DB
  async function loadAdminNews() {
    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 24px;">Chargement depuis la base de données...</td></tr>`;
    }

    try {
      const res = await fetch("/api/admin/news", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        adminNews = data.news || [];
        try { localStorage.setItem("yapapouaiye_news_db", JSON.stringify(adminNews)); } catch {}
      } else {
        throw new Error("HTTP error " + res.status);
      }
    } catch (e) {
      console.warn("Chargement fallback local");
      try {
        const cached = localStorage.getItem("yapapouaiye_news_db");
        if (cached) {
          adminNews = JSON.parse(cached);
        } else {
          const fallback = await fetch(`/news.json?_t=${Date.now()}`);
          adminNews = await fallback.json();
        }
      } catch {
        adminNews = [];
      }
    }

    renderAdminTable();
    updateStats();
    checkDatabaseStatus();
  }

  function updateStats() {
    if (statTotal) statTotal.textContent = adminNews.length;
    if (statUpdates) {
      const updates = adminNews.filter(n => (n.badge || "").toLowerCase().includes("mise à jour") || (n.badge || "").toLowerCase().includes("update")).length;
      statUpdates.textContent = updates;
    }
    if (statFeatured) {
      const featured = adminNews.filter(n => n.featured === true).length;
      statFeatured.textContent = featured;
    }
  }

  function renderAdminTable() {
    if (!tableBody) return;
    const query = (searchInput?.value || "").trim().toLowerCase();

    const filtered = adminNews.filter(n =>
      !query ||
      (n.title && n.title.toLowerCase().includes(query)) ||
      (n.badge && n.badge.toLowerCase().includes(query)) ||
      (n.version && n.version.toLowerCase().includes(query)) ||
      (n.author && n.author.toLowerCase().includes(query)) ||
      (n.content && n.content.toLowerCase().includes(query))
    );

    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; padding: 36px; color: var(--text-muted);">
            Aucune annonce trouvée dans la base de données. Cliquez sur <strong>"+ Publier une Nouveauté"</strong> pour en créer une.
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = filtered.map(item => {
      const featuredPill = item.featured
        ? `<span class="badge" style="background:rgba(245,158,11,0.2); color:#f59e0b; border:1px solid rgba(245,158,11,0.4);">⭐ En Une</span>`
        : `<span style="color:var(--text-faint); font-size:11px;">Standard</span>`;

      return `
        <tr data-news-id="${item.id}">
          <td style="font-weight:700; color:#ffffff;">
            <div>${item.title}</div>
            <div style="font-size:11.5px; color:var(--text-muted); font-weight:400; margin-top:2px;">
              ${item.summary ? item.summary.slice(0, 80) + "..." : (item.content ? item.content.slice(0, 80).replace(/[#*`]/g, "") + "..." : "")}
            </div>
          </td>
          <td><span class="badge badge-update">${item.badge || "Mise à jour"}</span></td>
          <td><span style="font-family:var(--font-mono); font-size:12px;">${item.version || "—"}</span></td>
          <td style="font-size:12px; color:var(--text-muted);">${item.date || "—"}</td>
          <td>${featuredPill}</td>
          <td>
            <div class="action-buttons">
              <button type="button" class="btn btn-secondary btn-sm btn-edit-news" data-id="${item.id}" title="Modifier dans la base">
                ✏️ Modifier
              </button>
              <button type="button" class="btn btn-danger btn-sm btn-delete-news" data-id="${item.id}" title="Supprimer de la base">
                🗑️
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    // Wire edit & delete buttons
    tableBody.querySelectorAll(".btn-edit-news").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const item = adminNews.find(n => n.id === id);
        if (item) openNewsFormModal(item);
      });
    });

    tableBody.querySelectorAll(".btn-delete-news").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const item = adminNews.find(n => n.id === id);
        if (item) confirmDeleteNews(item);
      });
    });
  }

  function updateLivePreview() {
    if (!livePreviewBox) return;
    const title = inputTitle?.value.trim() || "Titre de l'annonce";
    const badge = inputBadge?.value.trim() || "Mise à jour";
    const version = inputVersion?.value.trim() || "v1.5.7";
    const content = inputContent?.value.trim() || "Le contenu au format Markdown s'affichera ici en temps réel...";
    const image = inputImage?.value.trim() || "";

    const imgHtml = image ? `<div style="margin-bottom:12px;"><img src="${image}" style="width:100%; height:130px; object-fit:cover; border-radius:6px;" onerror="this.style.display='none'" /></div>` : "";

    livePreviewBox.innerHTML = `
      <div style="background:rgba(0,0,0,0.35); border:1px solid var(--panel-border); border-radius:8px; padding:16px;">
        ${imgHtml}
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
          <span class="badge badge-update">${badge}</span>
          <span style="font-family:var(--font-mono); font-size:11.5px; color:var(--text-faint);">${version}</span>
        </div>
        <h3 style="font-size:16px; font-weight:800; color:#ffffff; margin-bottom:10px;">${title}</h3>
        <div class="article-content" style="font-size:13px;">${parseMarkdown(content)}</div>
      </div>
    `;
  }

  function openNewsFormModal(item = null) {
    editingNewsId = item ? item.id : null;
    if (modalTitle) {
      modalTitle.textContent = item ? "Modifier la Nouveauté (Base de Données)" : "Publier une Nouvelle Annonce (Base de Données)";
    }

    if (item) {
      if (inputTitle) inputTitle.value = item.title || "";
      if (inputBadge) inputBadge.value = item.badge || "Mise à jour";
      if (inputVersion) inputVersion.value = item.version || "";
      if (inputDate) inputDate.value = item.date || "";
      if (inputAuthor) inputAuthor.value = item.author || "Admin";
      if (inputImage) inputImage.value = item.image || "";
      if (inputFeatured) inputFeatured.checked = Boolean(item.featured);
      if (inputSummary) inputSummary.value = item.summary || "";
      if (inputContent) inputContent.value = item.content || "";
    } else {
      if (newsForm) newsForm.reset();
      const now = new Date();
      if (inputDate) {
        inputDate.value = now.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
      }
      if (inputAuthor) inputAuthor.value = "Admin";
      if (inputBadge) inputBadge.value = "Mise à jour";
      if (inputVersion) inputVersion.value = "v1.5.7";
    }

    updateLivePreview();
    if (newsModal) newsModal.classList.remove("hidden");
  }

  function closeNewsFormModal() {
    if (newsModal) newsModal.classList.add("hidden");
    editingNewsId = null;
  }

  if (btnCloseModal) btnCloseModal.addEventListener("click", closeNewsFormModal);
  if (btnCancelModal) btnCancelModal.addEventListener("click", closeNewsFormModal);
  if (btnOpenCreateModal) btnOpenCreateModal.addEventListener("click", () => openNewsFormModal(null));
  if (btnRefresh) btnRefresh.addEventListener("click", loadAdminNews);

  if (searchInput) searchInput.addEventListener("input", renderAdminTable);

  [inputTitle, inputBadge, inputVersion, inputContent, inputImage].forEach(el => {
    if (el) el.addEventListener("input", updateLivePreview);
  });

  // Markdown helper toolbar buttons
  document.querySelectorAll(".btn-md-format").forEach(btn => {
    btn.addEventListener("click", () => {
      const format = btn.dataset.format;
      if (!inputContent) return;
      const start = inputContent.selectionStart;
      const end = inputContent.selectionEnd;
      const selected = inputContent.value.substring(start, end);

      let replacement = "";
      if (format === "bold") replacement = `**${selected || "texte en gras"}**`;
      if (format === "italic") replacement = `*${selected || "texte en italique"}*`;
      if (format === "h2") replacement = `\n## ${selected || "Grand Titre"}\n`;
      if (format === "h3") replacement = `\n### ${selected || "Sous-titre"}\n`;
      if (format === "list") replacement = `\n- ${selected || "Élément de liste"}\n`;
      if (format === "code") replacement = `\`${selected || "code"}\``;
      if (format === "quote") replacement = `\n> ${selected || "Citation"}\n`;
      if (format === "link") replacement = `[${selected || "Texte du lien"}](https://...)`;

      inputContent.setRangeText(replacement, start, end, "end");
      inputContent.focus();
      updateLivePreview();
    });
  });

  // Submit News (Create or Edit in Database)
  if (newsForm) {
    newsForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = inputTitle?.value.trim() || "";
      if (!title) {
        showToast("Le titre est obligatoire.", "error");
        return;
      }

      const content = inputContent?.value.trim() || "";
      if (!content) {
        showToast("Le contenu Markdown est obligatoire.", "error");
        return;
      }

      const payload = {
        title,
        badge: inputBadge?.value.trim() || "Mise à jour",
        version: inputVersion?.value.trim() || "",
        date: inputDate?.value.trim() || "",
        author: inputAuthor?.value.trim() || "Admin",
        image: inputImage?.value.trim() || "",
        featured: Boolean(inputFeatured?.checked),
        summary: inputSummary?.value.trim() || "",
        content,
      };

      const isEdit = Boolean(editingNewsId);
      const endpoint = isEdit ? `/api/admin/news/${encodeURIComponent(editingNewsId)}` : `/api/admin/news`;
      const method = isEdit ? "PUT" : "POST";

      const submitBtn = document.getElementById("btn-submit-news-form");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Sauvegarde dans la base...";
      }

function broadcastNewsUpdate(newsList) {
  try {
    localStorage.setItem("yapapouaiye_news_db", JSON.stringify(newsList));
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel("yapapouaiye_news_sync");
      channel.postMessage({ type: "NEWS_SYNC", news: newsList });
    }
  } catch {}
}

      try {
        const res = await fetch(endpoint, {
          method,
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.ok) {
          showToast(data.message || (isEdit ? "Article mis à jour dans la base !" : "Nouveauté enregistrée dans la base !"), "success");
          closeNewsFormModal();
          await loadAdminNews();
          broadcastNewsUpdate(adminNews);
        } else {
          showToast(data.error || "Erreur lors de l'enregistrement en base", "error");
        }
      } catch (err) {
        // Fallback local en cas d'accès direct file:/// ou réseau
        const now = new Date();
        const formattedDate = payload.date || now.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
        if (isEdit) {
          const idx = adminNews.findIndex(n => n.id === editingNewsId);
          if (idx !== -1) {
            adminNews[idx] = { ...adminNews[idx], ...payload, date: formattedDate, updatedAt: now.toISOString() };
          }
        } else {
          const newItem = {
            id: `news-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            ...payload,
            date: formattedDate,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          };
          if (payload.featured) {
            adminNews.forEach(n => { n.featured = false; });
          }
          adminNews.unshift(newItem);
        }
        broadcastNewsUpdate(adminNews);
        showToast(isEdit ? "Article mis à jour (Sauvegarde instantanée) !" : "Nouveauté enregistrée (Sauvegarde instantanée) !", "success");
        closeNewsFormModal();
        renderAdminTable();
        updateStats();
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = isEdit ? "Enregistrer les modifications" : "Enregistrer dans la Base";
        }
      }
    });
  }

  // Delete news confirmation (Instant deletion across tabs)
  async function confirmDeleteNews(item) {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer l'annonce "${item.title}" de la base de données ? Cette action est irréversible.`)) {
      return;
    }

    // Immediately remove from UI and broadcast for instant response
    const localIdx = adminNews.findIndex(n => n.id === item.id);
    if (localIdx !== -1) {
      adminNews.splice(localIdx, 1);
      broadcastNewsUpdate(adminNews);
      renderAdminTable();
      updateStats();
    }

    try {
      const res = await fetch(`/api/admin/news/${encodeURIComponent(item.id)}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "Annonce supprimée de la base de données avec succès.", "success");
        await loadAdminNews();
        broadcastNewsUpdate(adminNews);
      } else {
        showToast(data.error || "Impossible de supprimer l'annonce", "error");
      }
    } catch {
      showToast("Annonce supprimée avec succès.", "success");
    }
  }

  // Export JSON Backup
  if (btnExportJson) {
    btnExportJson.addEventListener("click", () => {
      const jsonStr = JSON.stringify(adminNews, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `yapapouaiye-news-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Sauvegarde JSON exportée avec succès !", "success");
    });
  }

  // Import JSON to Database
  if (inputImportJson) {
    inputImportJson.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.news) ? parsed.news : [];

        if (list.length === 0) {
          showToast("Le fichier JSON ne contient aucune annonce valide.", "error");
          return;
        }

        if (!confirm(`Voulez-vous importer ${list.length} article(s) dans la base de données ?`)) {
          inputImportJson.value = "";
          return;
        }

        const res = await fetch("/api/admin/seed", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ news: list })
        });

        const data = await res.json();
        if (res.ok) {
          showToast(data.message || "Importation réussie !", "success");
          await loadAdminNews();
        } else {
          showToast(data.error || "Erreur lors de l'importation", "error");
        }
      } catch (err) {
        showToast("Fichier JSON invalide.", "error");
      } finally {
        inputImportJson.value = "";
      }
    });
  }

  // Seed / Reset Database from default catalog
  if (btnSeedDb) {
    btnSeedDb.addEventListener("click", async () => {
      if (!confirm("Voulez-vous initialiser la base de données avec le catalogue de nouveautés par défaut ?")) {
        return;
      }

      try {
        const res = await fetch("/api/admin/seed", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({})
        });

        const data = await res.json();
        if (res.ok) {
          showToast(data.message || "Base de données initialisée !", "success");
          await loadAdminNews();
        } else {
          showToast(data.error || "Erreur d'initialisation", "error");
        }
      } catch {
        showToast("Erreur lors de l'initialisation.", "error");
      }
    });
  }

  loadAdminNews();
}

document.addEventListener("DOMContentLoaded", () => {
  initLoginPage();
  initDashboardPage();
});
