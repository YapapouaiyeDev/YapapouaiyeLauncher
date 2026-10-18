function initServersPanel(token) {
  const tabServers = document.getElementById("tab-servers");
  if (!tabServers) return; // Panneau absent de cette page

  // ---- Tab switching ----
  document.querySelectorAll("#admin-tabs .admin-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#admin-tabs .admin-tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      for (const id of ["tab-news", "tab-servers", "tab-invitations"]) {
        document.getElementById(id)?.classList.toggle("hidden", btn.dataset.tab !== id);
      }
    });
  });

  let adminServers = [];
  let editingServerId = null;

  const tableBody = document.getElementById("admin-servers-table-body");
  const statTotal = document.getElementById("stat-servers-total");
  const statEnabled = document.getElementById("stat-servers-enabled");
  const statCodes = document.getElementById("stat-servers-codes");
  const tabCount = document.getElementById("tab-servers-count");
  const searchInput = document.getElementById("admin-search-servers");
  const btnRefresh = document.getElementById("btn-refresh-servers");
  const btnOpenCreate = document.getElementById("btn-open-create-server-modal");

  const modal = document.getElementById("admin-server-modal");
  const form = document.getElementById("admin-server-form");
  const modalTitle = document.getElementById("admin-server-modal-title");
  const btnCloseModal = document.getElementById("btn-close-server-modal");
  const btnCancelModal = document.getElementById("btn-cancel-server-modal");
  const submitBtn = document.getElementById("btn-submit-server-form");

  const F = (id) => document.getElementById(id);
  const val = (id) => (F(id)?.value ?? "").trim();

  // ---- Maintenance ----
  const maintenanceCard = document.getElementById("maintenance-card");
  const inputMaintEnabled = document.getElementById("maintenance-enabled");
  const labelMaintToggle = document.getElementById("maintenance-toggle-label");
  const inputMaintMessage = document.getElementById("maintenance-message");
  const btnSaveMaint = document.getElementById("btn-save-maintenance");
  const maintStatus = document.getElementById("maintenance-status");

  function paintMaintenance(state) {
    const on = Boolean(state?.maintenance);
    if (inputMaintEnabled) inputMaintEnabled.checked = on;
    if (inputMaintMessage) inputMaintMessage.value = state?.message || "";
    if (labelMaintToggle) {
      labelMaintToggle.textContent = on ? "Maintenance ACTIVÉE" : "Maintenance désactivée";
      labelMaintToggle.style.color = on ? "#ef4444" : "";
    }
    maintenanceCard?.classList.toggle("active", on);
  }

  async function loadMaintenance() {
    try {
      const res = await fetch("/api/admin/launcher-config", {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        paintMaintenance(data);
        if (maintStatus) maintStatus.textContent = data.maintenance ? "🔴 Le jeu est bloqué dans le launcher." : "🟢 Le launcher fonctionne normalement.";
      }
    } catch {
      if (maintStatus) maintStatus.textContent = "État de maintenance illisible (hors-ligne ?).";
    }
  }

  if (btnSaveMaint) {
    btnSaveMaint.addEventListener("click", async () => {
      btnSaveMaint.disabled = true;
      try {
        const res = await fetch("/api/admin/launcher-config", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({
            maintenance: Boolean(inputMaintEnabled?.checked),
            message: inputMaintMessage?.value ?? "",
          }),
        });
        const data = await res.json();
        if (res.ok) {
          paintMaintenance(data);
          if (maintStatus) maintStatus.textContent = data.maintenance ? "🔴 Le jeu est bloqué dans le launcher." : "🟢 Le launcher fonctionne normalement.";
          showToast(data.message || "Configuration enregistrée.", "success");
        } else {
          showToast(data.error || "Impossible d'enregistrer.", "error");
        }
      } catch {
        showToast("Erreur réseau lors de l'enregistrement.", "error");
      } finally {
        btnSaveMaint.disabled = false;
      }
    });
  }

  // ---- Servers list ----
  async function loadAdminServers() {
    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 24px;">Chargement des serveurs...</td></tr>`;
    }
    try {
      const res = await fetch(`/api/admin/servers?_t=${Date.now()}`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      adminServers = data.servers || [];
    } catch (e) {
      console.warn("Chargement serveurs impossible:", e.message);
      adminServers = [];
      showToast("Impossible de charger les serveurs (réseau ?).", "error");
    }
    renderServersTable();
    updateServersStats();
  }

  function updateServersStats() {
    if (statTotal) statTotal.textContent = adminServers.length;
    if (statEnabled) statEnabled.textContent = adminServers.filter((s) => s.enabled).length;
    if (statCodes) statCodes.textContent = adminServers.filter((s) => s.codesRequired && (s.codesCount || 0) > 0).length;
    if (tabCount) tabCount.textContent = adminServers.length;
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function renderServersTable() {
    if (!tableBody) return;
    const query = (searchInput?.value || "").trim().toLowerCase();
    const filtered = adminServers.filter((s) =>
      !query ||
      (s.name && s.name.toLowerCase().includes(query)) ||
      (s.id && s.id.toLowerCase().includes(query)) ||
      (s.host && s.host.toLowerCase().includes(query)) ||
      (s.displayIp && s.displayIp.toLowerCase().includes(query))
    );

    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; padding: 36px; color: var(--text-muted);">
            Aucun serveur enregistré. Cliquez sur <strong>"+ Ajouter un Serveur"</strong> pour en créer un.
          </td>
        </tr>`;
      return;
    }

    tableBody.innerHTML = filtered.map((s) => {
      const statusPill = s.enabled
        ? `<span class="badge badge-update">🟢 Ouvert</span>`
        : `<span class="badge" style="background:rgba(255,255,255,0.08); color:var(--text-muted); border:1px solid var(--panel-border);">⏸️ Fermé</span>`;
      const codesPill = s.codesRequired && (s.codesCount || 0) > 0
        ? `<span class="badge" style="background:rgba(245,158,11,0.2); color:#f59e0b; border:1px solid rgba(245,158,11,0.4);">🔑 ${s.codesCount} code(s)</span>`
        : `<span style="color:var(--text-faint); font-size:11px;">Libre</span>`;
      return `
        <tr>
          <td>
            <div style="font-weight:800; color:#ffffff;">${escapeHtml(s.name)}</div>
            <div style="font-size:11px; color:var(--text-faint); font-family:monospace;">${escapeHtml(s.id)}</div>
          </td>
          <td style="font-family:monospace; font-size:12px;">${escapeHtml(s.displayIp || s.host || "—")}</td>
          <td style="font-size:12px;">${escapeHtml(s.gameVersion || "")} • ${escapeHtml(s.defaultLoader || "")}</td>
          <td>${codesPill}</td>
          <td>${statusPill}</td>
          <td style="text-align:right; white-space:nowrap;">
            <button type="button" class="btn btn-secondary btn-sm" data-srv-action="edit" data-srv-id="${escapeHtml(s.id)}">✏️ Modifier</button>
            <button type="button" class="btn btn-secondary btn-sm" data-srv-action="toggle" data-srv-id="${escapeHtml(s.id)}" title="${s.enabled ? "Fermer" : "Ouvrir"} le serveur">${s.enabled ? "⏸️" : "▶️"}</button>
            <button type="button" class="btn btn-danger btn-sm" data-srv-action="delete" data-srv-id="${escapeHtml(s.id)}">🗑️</button>
          </td>
        </tr>`;
    }).join("");

    tableBody.querySelectorAll("[data-srv-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.srvAction;
        const item = adminServers.find((s) => s.id === btn.dataset.srvId);
        if (!item) return;
        if (action === "edit") openServerFormModal(item);
        else if (action === "toggle") toggleServerEnabled(item);
        else if (action === "delete") confirmDeleteServer(item);
      });
    });
  }

  // ---- Server modal ----
  function openServerFormModal(item = null) {
    editingServerId = item?.id || null;
    if (modalTitle) modalTitle.textContent = item ? `Modifier « ${item.name} »` : "Ajouter un Serveur";
    if (submitBtn) submitBtn.innerHTML = `<span>${item ? "Enregistrer les modifications" : "Enregistrer le Serveur"}</span>`;
    const set = (id, v) => { const el = F(id); if (el) el.value = v ?? ""; };
    set("srv-input-name", item?.name || "");
    set("srv-input-shortname", item?.shortName || "");
    set("srv-input-host", item?.host || "");
    set("srv-input-displayip", item?.displayIp || "");
    set("srv-input-pingport", item?.pingPort ?? "");
    set("srv-input-gameport", item?.gamePort ?? "");
    set("srv-input-version", item?.gameVersion || "1.21.1");
    set("srv-input-loader", item?.defaultLoader || "neoforge");
    set("srv-input-description", item?.description || "");
    set("srv-input-badge", item?.badgeTag || "");
    set("srv-input-sort", item?.sortOrder ?? "");
    set("srv-input-modsowner", item?.modsRepoOwner || "");
    set("srv-input-modsrepo", item?.modsRepoRepo || "");
    set("srv-input-modsbranch", item?.modsRepoBranch || "");
    set("srv-input-codes", (item?.accessCodes || []).join("\n"));
    const chkCodes = F("srv-input-codesrequired");
    if (chkCodes) chkCodes.checked = item ? Boolean(item.codesRequired) : true;
    const chkEnabled = F("srv-input-enabled");
    if (chkEnabled) chkEnabled.checked = item ? Boolean(item.enabled) : true;
    modal?.classList.remove("hidden");
  }

  function closeServerFormModal() {
    modal?.classList.add("hidden");
    editingServerId = null;
  }

  if (btnOpenCreate) btnOpenCreate.addEventListener("click", () => openServerFormModal(null));
  if (btnCloseModal) btnCloseModal.addEventListener("click", closeServerFormModal);
  if (btnCancelModal) btnCancelModal.addEventListener("click", closeServerFormModal);
  if (btnRefresh) btnRefresh.addEventListener("click", () => { loadAdminServers(); });
  if (searchInput) searchInput.addEventListener("input", renderServersTable);

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = val("srv-input-name");
      const host = val("srv-input-host");
      if (!name || !host) {
        showToast("Le nom et l'adresse du serveur sont obligatoires.", "error");
        return;
      }
      const num = (id) => { const v = val(id); return v === "" ? undefined : Number(v); };
      const payload = {
        name,
        shortName: val("srv-input-shortname"),
        host,
        displayIp: val("srv-input-displayip"),
        pingPort: num("srv-input-pingport"),
        gamePort: num("srv-input-gameport"),
        gameVersion: val("srv-input-version") || "1.21.1",
        defaultLoader: F("srv-input-loader")?.value || "neoforge",
        description: val("srv-input-description"),
        badgeTag: val("srv-input-badge"),
        sortOrder: num("srv-input-sort"),
        modsRepoOwner: val("srv-input-modsowner"),
        modsRepoRepo: val("srv-input-modsrepo"),
        modsRepoBranch: val("srv-input-modsbranch") || "main",
        accessCodes: val("srv-input-codes").split(/\r?\n/).map((c) => c.trim()).filter(Boolean),
        codesRequired: Boolean(F("srv-input-codesrequired")?.checked),
        enabled: Boolean(F("srv-input-enabled")?.checked),
      };
      const isEdit = Boolean(editingServerId);
      const endpoint = isEdit ? `/api/admin/servers/${encodeURIComponent(editingServerId)}` : "/api/admin/servers";
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span>Enregistrement...</span>`;
      }
      try {
        const res = await fetch(endpoint, {
          method: isEdit ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.ok) {
          showToast(data.message || (isEdit ? "Serveur mis à jour !" : "Serveur enregistré !"), "success");
          closeServerFormModal();
          await loadAdminServers();
        } else {
          showToast(data.error || "Impossible d'enregistrer le serveur.", "error");
        }
      } catch {
        showToast("Erreur réseau lors de l'enregistrement.", "error");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `<span>${isEdit ? "Enregistrer les modifications" : "Enregistrer le Serveur"}</span>`;
        }
      }
    });
  }

  async function toggleServerEnabled(item) {
    try {
      const res = await fetch(`/api/admin/servers/${encodeURIComponent(item.id)}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled: !item.enabled }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.server?.enabled ? `Serveur "${item.name}" ouvert.` : `Serveur "${item.name}" fermé.`, "success");
        await loadAdminServers();
      } else {
        showToast(data.error || "Impossible de changer le statut.", "error");
      }
    } catch {
      showToast("Erreur réseau.", "error");
    }
  }

  async function confirmDeleteServer(item) {
    if (!confirm(`Supprimer le serveur "${item.name}" ? Les joueurs ne pourront plus le voir dans le launcher. Action irréversible.`)) return;
    try {
      const res = await fetch(`/api/admin/servers/${encodeURIComponent(item.id)}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "Serveur supprimé.", "success");
        await loadAdminServers();
      } else {
        showToast(data.error || "Impossible de supprimer.", "error");
      }
    } catch {
      showToast("Erreur réseau lors de la suppression.", "error");
    }
  }

  loadAdminServers();
  loadMaintenance();
}


document.addEventListener("DOMContentLoaded", () => {
  const token = getAdminToken();
  if (token) initServersPanel(token);
});
