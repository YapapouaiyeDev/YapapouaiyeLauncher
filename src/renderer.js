const GAME_VERSION = '1.21.1';
const SKIN_HEAD_URL = 'https://mc-heads.net/avatar/';

let isCheckingForUpdates = false;
let systemRamGB = 16;
let ramMin = 2;
let ramMax = 16;

// RAM slider elements - declare early so initRamLimits can use them
const ramSlider = document.getElementById('input-ram');
const ramValue = document.getElementById('ram-value');
const settingsRam = document.getElementById('settings-ram');
const settingsRamValue = document.getElementById('settings-ram-value');

// Animation helpers
function staggerAnimate(container, itemSelector, delay = 60) {
  const items = container.querySelectorAll(itemSelector);
  items.forEach((item, i) => {
    item.style.animationDelay = `${i * delay}ms`;
    item.classList.add('stagger-item');
  });
}

function animateModsGrid() {
  const grid = document.getElementById('mods-list');
  if (grid && grid.children.length > 0 && !grid.querySelector('.empty-state')) {
    staggerAnimate(grid, '.mod-item', 50);
  }
}

function animateSettingsCards() {
  const cards = document.querySelectorAll('.settings-card');
  cards.forEach((card, i) => {
    card.style.animationDelay = `${i * 80}ms`;
    card.classList.add('stagger-item');
  });
}

function animateStatCards() {
  const cards = document.querySelectorAll('.stat-card');
  cards.forEach((card, i) => {
    card.style.animationDelay = `${i * 100}ms`;
    card.classList.add('stagger-item');
  });
}

// Simple toast notification system
function showToast(message, type = 'info', duration = 4000) {
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    `;
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  const colors = {
    error: { bg: '#dc2626', border: '#991b1b' },
    success: { bg: '#16a34a', border: '#166534' },
    warning: { bg: '#ea580c', border: '#9a3412' },
    info: { bg: '#2563eb', border: '#1e40af' }
  };
  const color = colors[type] || colors.info;

  toast.style.cssText = `
    background: ${color.bg};
    border: 2px solid ${color.border};
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-size: 14px;
    max-width: 350px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    pointer-events: auto;
    animation: slideIn 0.3s ease-out;
    cursor: pointer;
  `;
  toast.textContent = message;
  toast.onclick = () => toastContainer.removeChild(toast);

  toastContainer.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode === toastContainer) {
      toast.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => toastContainer.removeChild(toast), 300);
    }
  }, duration);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
`;
document.head.appendChild(style);

async function initRamLimits() {
  try {
    console.log('[RAM] Initializing RAM limits...');
    console.log('[RAM] Slider elements found:', {
      ramSlider: ramSlider ? 'YES' : 'NO',
      settingsRam: settingsRam ? 'YES' : 'NO'
    });

    systemRamGB = await window.launcher.getSystemRam();
    console.log(`[RAM] System RAM detected: ${systemRamGB} GB`);
    
    ramMin = 2;
    // Reserve 3GB for the OS, no upper limit for users with lots of RAM
    ramMax = Math.max(ramMin + 1, systemRamGB - 3);
    console.log(`[RAM] Calculated limits: min=${ramMin} GB, max=${ramMax} GB`);

    // Apply limits to both sliders
    if (ramSlider) {
      ramSlider.min = ramMin;
      ramSlider.max = ramMax;
      console.log(`[RAM] Home slider: min=${ramSlider.min}, max=${ramSlider.max}`);
    }
    
    if (settingsRam) {
      settingsRam.min = ramMin;
      settingsRam.max = ramMax;
      console.log(`[RAM] Settings slider: min=${settingsRam.min}, max=${settingsRam.max}`);
    }

    // Clamp existing values within new limits
    if (parseInt(ramSlider.value) > ramMax) ramSlider.value = ramMax;
    if (parseInt(ramSlider.value) < ramMin) ramSlider.value = ramMin;
    if (parseInt(settingsRam.value) > ramMax) settingsRam.value = ramMax;
    if (parseInt(settingsRam.value) < ramMin) settingsRam.value = ramMin;

    ramValue.textContent = `${ramSlider.value} Go`;
    settingsRamValue.textContent = `${settingsRam.value} Go`;

    console.log(`[RAM] Final slider values: home=${ramSlider.value}, settings=${settingsRam.value}`);
  } catch (error) {
    console.error('[RAM] Failed to initialize RAM limits:', error);
    showToast(`RAM error: ${error.message}`, 'error');
    // Fallback to safe defaults
    ramMin = 2;
    ramMax = 16;
    if (ramSlider) {
      ramSlider.min = ramMin;
      ramSlider.max = ramMax;
    }
    if (settingsRam) {
      settingsRam.min = ramMin;
      settingsRam.max = ramMax;
    }
  }
}

// Navigation
const navItems = document.querySelectorAll('.nav-item');
const pages = document.querySelectorAll('.page');
let isTransitioning = false;

navItems.forEach(item => {
  item.addEventListener('click', () => {
    const page = item.dataset.page;
    if (isTransitioning) return;
    
    const currentPage = document.querySelector('.page.active');
    if (currentPage) {
      isTransitioning = true;
      currentPage.classList.add('exiting');
      
      setTimeout(() => {
        currentPage.classList.remove('active', 'exiting');
        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        const nextPage = document.getElementById(`page-${page}`);
        nextPage.classList.add('active');
        
        if (page === 'accounts') loadAccountsList();
        if (page === 'mods') animateModsGrid();
        if (page === 'settings') animateSettingsCards();
        
        isTransitioning = false;
      }, 280);
    } else {
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      document.getElementById(`page-${page}`).classList.add('active');
      if (page === 'accounts') loadAccountsList();
      if (page === 'mods') animateModsGrid();
      if (page === 'settings') animateSettingsCards();
    }
  });
});

// Window controls
document.getElementById('btn-minimize').addEventListener('click', () => window.launcher.minimize());
document.getElementById('btn-maximize').addEventListener('click', () => window.launcher.maximize());
document.getElementById('btn-close').addEventListener('click', () => window.launcher.close());

// Elements
const authSection = document.getElementById('auth-section');
const playSection = document.getElementById('play-section');
const userNameEl = document.getElementById('user-name');
const userStatusEl = document.getElementById('user-status');
const userSkinHead = document.getElementById('user-skin-head');
// ramSlider, ramValue, settingsRam, settingsRamValue already declared above
const defaultSkinSrc = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect fill='%2327272a' width='32' height='32' rx='6'/%3E%3Ctext x='16' y='21' text-anchor='middle' fill='%2352525b' font-size='16' font-family='sans-serif'%3E%3F%3C/text%3E%3C/svg%3E";

function setSkinHead(uuid) {
  if (uuid) {
    userSkinHead.src = `${SKIN_HEAD_URL}${uuid}/32`;
    userSkinHead.onerror = () => { userSkinHead.src = defaultSkinSrc; };
  } else {
    userSkinHead.src = defaultSkinSrc;
  }
}

function setLoggedIn(username, uuid) {
  authSection.classList.add('hidden');
  playSection.classList.remove('hidden');
  userNameEl.textContent = username;
  userStatusEl.textContent = 'Connecte';
  userStatusEl.style.color = '#22c55e';
  setSkinHead(uuid);
  const playerNameEl = document.getElementById('player-name');
  if (playerNameEl) playerNameEl.textContent = username;
}

function setLoggedOut() {
  authSection.classList.remove('hidden');
  playSection.classList.add('hidden');
  userNameEl.textContent = 'Non connecte';
  userStatusEl.textContent = 'Hors ligne';
  userStatusEl.style.color = '';
  setSkinHead(null);
  const playerNameEl = document.getElementById('player-name');
  if (playerNameEl) playerNameEl.textContent = 'Joueur';
}

// Microsoft Auth
document.getElementById('btn-auth-microsoft').addEventListener('click', async () => {
  const btn = document.getElementById('btn-auth-microsoft');
  btn.disabled = true;
  btn.textContent = 'Connexion en cours...';
  const result = await window.launcher.authMicrosoft();
  if (result.success) setLoggedIn(result.username, result.uuid);
  else if (!result.error?.includes('annule')) {
    showToast('Connexion error: ' + (result.error || 'Unknown error'), 'error');
  }
  btn.disabled = false;
  btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="0" y="0" width="7.5" height="7.5" fill="#f25022"/><rect x="8.5" y="0" width="7.5" height="7.5" fill="#7fba00"/><rect x="0" y="8.5" width="7.5" height="7.5" fill="#00a4ef"/><rect x="8.5" y="8.5" width="7.5" height="7.5" fill="#ffb900"/></svg> Connexion Microsoft';
});

// Offline Auth
document.getElementById('btn-auth-offline').addEventListener('click', async () => {
  const username = document.getElementById('input-username').value.trim();
  if (!username) { showToast('Enter a username to play offline.', 'warning'); return; }
  const result = await window.launcher.authOffline(username);
  if (result.success) setLoggedIn(result.username, result.uuid);
  else showToast('Error: ' + result.error, 'error');
});

document.getElementById('input-username').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-auth-offline').click();
});

// Logout
document.getElementById('btn-logout').addEventListener('click', async () => {
  await window.launcher.logout();
  setLoggedOut();
});

// Click on user badge -> go to accounts page
document.getElementById('user-info').addEventListener('click', () => {
  navItems.forEach(n => n.classList.remove('active'));
  pages.forEach(p => p.classList.remove('active'));
  document.querySelector('[data-page="accounts"]').classList.add('active');
  document.getElementById('page-accounts').classList.add('active');
  loadAccountsList();
});

// RAM slider + save
ramSlider.addEventListener('input', () => {
  ramValue.textContent = `${ramSlider.value} Go`;
  window.launcher.saveConfig({ ram: parseInt(ramSlider.value) });
});

if (settingsRam) {
  settingsRam.addEventListener('input', () => {
    settingsRamValue.textContent = `${settingsRam.value} Go`;
    ramSlider.value = settingsRam.value;
    ramValue.textContent = `${settingsRam.value} Go`;
    window.launcher.saveConfig({ ram: parseInt(settingsRam.value) });
  });
}

// ============================================================
// New Settings Event Listeners
// ============================================================

// Resolution selector
const resSelect = document.getElementById('settings-resolution');
const customResRow = document.getElementById('custom-resolution-row');
const customWidth = document.getElementById('custom-width');
const customHeight = document.getElementById('custom-height');

resSelect.addEventListener('change', () => {
  const val = resSelect.value;
  if (val === 'custom') {
    customResRow.classList.remove('hidden');
    window.launcher.saveConfig({ resolution: `${customWidth.value || 1280}x${customHeight.value || 720}` });
  } else {
    customResRow.classList.add('hidden');
    window.launcher.saveConfig({ resolution: val });
  }
});

[customWidth, customHeight].forEach(input => {
  input.addEventListener('input', () => {
    if (resSelect.value === 'custom') {
      window.launcher.saveConfig({ resolution: `${customWidth.value || 1280}x${customHeight.value || 720}` });
    }
  });
});

// Fullscreen toggle
document.getElementById('settings-fullscreen').addEventListener('change', (e) => {
  window.launcher.saveConfig({ fullscreen: e.target.checked });
});

// Java path
document.getElementById('settings-java-path').addEventListener('change', (e) => {
  window.launcher.saveConfig({ javaPath: e.target.value.trim() || null });
});

document.getElementById('btn-browse-java').addEventListener('click', async () => {
  const result = await window.launcher.selectJavaPath();
  if (result.success && result.path) {
    document.getElementById('settings-java-path').value = result.path;
    window.launcher.saveConfig({ javaPath: result.path });
  }
});

// JVM args
document.getElementById('settings-jvm-args').addEventListener('change', (e) => {
  window.launcher.saveConfig({ jvmArgs: e.target.value.trim() || null });
});

// Language
document.getElementById('settings-language').addEventListener('change', (e) => {
  window.launcher.saveConfig({ language: e.target.value });
});

// Close on launch
document.getElementById('settings-close-on-launch').addEventListener('change', (e) => {
  window.launcher.saveConfig({ closeOnLaunch: e.target.checked });
});

// Launch Game
document.getElementById('btn-play').addEventListener('click', async () => {
  const ram = parseInt(ramSlider.value);
  const playBtn = document.getElementById('btn-play');
  const progressSection = document.getElementById('progress-section');
  const progressFill = document.getElementById('progress-fill');

  playBtn.classList.add('loading');
  playBtn.disabled = true;
  playBtn.innerHTML = '<svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> MISE A JOUR MODS...';
  progressSection.classList.remove('hidden');
  progressFill.classList.add('active');
  document.getElementById('progress-text').textContent = 'Synchronisation des mods...';

  const syncResult = await window.launcher.syncMods();
  if (!syncResult.success) showToast('Mod sync error: ' + syncResult.error, 'error');

  playBtn.innerHTML = '<svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> LANCEMENT...';
  loadMods();

  const result = await window.launcher.launchGame({
    version: GAME_VERSION,
    loader: 'neoforge',
    ram
  });

  if (!result.success) {
    showToast('Launch error: ' + result.error, 'error');
    resetPlayBtn();
  }
});

function resetPlayBtn() {
  const playBtn = document.getElementById('btn-play');
  const progressSection = document.getElementById('progress-section');
  const progressFill = document.getElementById('progress-fill');
  playBtn.classList.remove('loading');
  playBtn.disabled = false;
  playBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> JOUER';
  progressSection.classList.add('hidden');
  progressFill.classList.remove('active');
}

// Progress events
window.launcher.onProgress((data) => {
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  const updateStatus = document.getElementById('update-status');
  
  switch (data.type) {
    case 'download': progressFill.style.width = `${data.value}%`; progressText.textContent = `Telechargement ${data.value}%`; break;
    case 'check': progressFill.style.width = `${data.value}%`; progressText.textContent = `Verification ${data.value}%`; break;
    case 'extract': progressText.textContent = `Extraction: ${data.value}`; break;
    case 'speed': progressText.textContent = `Vitesse: ${data.value}`; break;
    case 'estimated': progressText.textContent = `Temps restant: ${data.value}`; break;
    case 'patch': progressText.textContent = `Patch: ${data.value}`; break;
    case 'mod-sync': progressText.textContent = data.value; break;
    // Update-specific events
    case 'update-checking':
      if (updateStatus) setUpdateStatus(data.message || 'Verification des mises a jour...');
      break;
    case 'update-available':
      if (updateStatus) setUpdateStatus(data.message || 'Mise a jour disponible !', 'update-available');
      break;
    case 'update-not-available':
      if (updateStatus) setUpdateStatus(data.message || 'Deja a jour');
      showToast('Vous utilisez deja la derniere version', 'info');
      break;
  }
});

window.launcher.onGameClosed(() => resetPlayBtn());
window.launcher.onGameError((err) => { showToast('Game error: ' + err, 'error'); resetPlayBtn(); });

// Mods
async function loadMods() {
  const modsList = document.getElementById('mods-list');
  const modsCountEl = document.getElementById('mods-count');
  const installedModsCountEl = document.getElementById('installed-mods-count');
  const result = await window.launcher.getMods();
  modsList.innerHTML = '';

  if (!result.success) {
    modsList.innerHTML = '<div class="empty-state"><p>Erreur de chargement des mods.</p></div>';
    if (modsCountEl) modsCountEl.textContent = '0';
    if (installedModsCountEl) installedModsCountEl.textContent = '0';
    return;
  }

  const remoteMods = result.mods || [];

  // Update counts
  if (modsCountEl) modsCountEl.textContent = remoteMods.length.toString();
  if (installedModsCountEl) installedModsCountEl.textContent = remoteMods.length.toString();

  if (remoteMods.length === 0) {
    modsList.innerHTML = '<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg><p>Aucun mod installe pour le moment.</p></div>';
    return;
  }

  // Remote mods section
  const remoteSection = document.createElement('div');
  remoteSection.className = 'mods-section';
  remoteSection.innerHTML = '<div class="mods-section-title">Mods du serveur</div>';
  const remoteGrid = document.createElement('div');
  remoteGrid.className = 'mods-grid';
  remoteMods.forEach(mod => {
    const item = createModItem(mod);
    remoteGrid.appendChild(item);
  });
  remoteSection.appendChild(remoteGrid);
  modsList.appendChild(remoteSection);
  
  // Trigger stagger animation
  requestAnimationFrame(() => {
    staggerAnimate(remoteGrid, '.mod-item', 50);
  });
}

function createModItem(mod) {
  const item = document.createElement('div');
  item.className = 'mod-item';
  const nameBase = mod.replace('.jar', '');
  item.innerHTML = `
    <div class="mod-icon">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M3 9h18"/>
      </svg>
    </div>
    <div class="mod-content">
      <div class="mod-header">
        <span class="mod-name">${escapeHtml(nameBase)}</span><span class="mod-ext">.jar</span>
      </div>
    </div>`;
  return item;
}

document.querySelector('[data-page="mods"]').addEventListener('click', loadMods);

document.getElementById('btn-sync-mods').addEventListener('click', async () => {
  const btn = document.getElementById('btn-sync-mods');
  btn.disabled = true;
  btn.innerHTML = '<svg class="spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>';
  const result = await window.launcher.syncMods();
  if (result.success) {
    showToast(`Mods synchronises (${result.count} mods, ${result.downloaded} telecharges)`, 'success');
  } else {
    showToast('Erreur: ' + (result.error || 'Inconnue'), 'error');
  }
  btn.disabled = false;
  btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>';
  loadMods();
});

// Accounts page
async function loadAccountsList() {
  const list = document.getElementById('accounts-list');
  const countEl = document.getElementById('accounts-count');
  const data = await window.launcher.getAccounts();

  // Update count
  const count = data.accounts?.length || 0;
  countEl.textContent = `${count} compte${count !== 1 ? 's' : ''}`;

  if (!data.accounts || data.accounts.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
        </svg>
        <p>Aucun compte enregistre.</p>
        <span class="empty-state-hint">Ajoute un compte pour commencer</span>
      </div>`;
    return;
  }

  list.innerHTML = '';
  data.accounts.forEach((acc, i) => {
    const item = document.createElement('div');
    item.className = 'account-item' + (acc.active ? ' account-active' : '');
    const skinUrl = acc.type === 'microsoft' ? `${SKIN_HEAD_URL}${acc.uuid}/32` : defaultSkinSrc;
    const typeBadgeClass = acc.type === 'microsoft' ? 'microsoft' : 'offline';
    const typeText = acc.type === 'microsoft' ? 'Microsoft' : 'Hors-ligne';
    const typeIcon = acc.type === 'microsoft'
      ? '<svg width="10" height="10" viewBox="0 0 16 16"><rect x="0" y="0" width="7.5" height="7.5" fill="currentColor"/><rect x="8.5" y="0" width="7.5" height="7.5" fill="currentColor"/><rect x="0" y="8.5" width="7.5" height="7.5" fill="currentColor"/><rect x="8.5" y="8.5" width="7.5" height="7.5" fill="currentColor"/></svg>'
      : '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/></svg>';

    item.innerHTML = `
      <img class="account-skin" src="${skinUrl}" onerror="this.src='${defaultSkinSrc}'" />
      <div class="account-info">
        <span class="account-name">${escapeHtml(acc.name)}</span>
        <span class="account-type">
          <span class="account-type-badge ${typeBadgeClass}">${typeIcon} ${typeText}</span>
          ${acc.active ? '' : ''}
        </span>
      </div>
      <div class="account-actions">
        ${!acc.active ? '<button class="btn-sm btn-switch" data-index="' + i + '">Utiliser</button>' : '<span class="active-badge">Actif</span>'}
        <button class="btn-sm btn-remove" data-index="${i}">Supprimer</button>
      </div>`;
    list.appendChild(item);
  });

  list.querySelectorAll('.btn-switch').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.index);
      const result = await window.launcher.switchAccount(idx);
      if (result.success) {
        setLoggedIn(result.username, result.uuid);
        loadAccountsList();
      } else {
        showToast(result.error || 'Unable to switch accounts', 'error');
      }
    });
  });

  list.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.index);
      const result = await window.launcher.removeAccount(idx);
      if (!result.success) return;

      if (result.activeIndex < 0 || !result.activeAccount) {
        // No accounts left
        setLoggedOut();
      } else {
        // Switch UI to the now-active account
        setLoggedIn(result.activeAccount.name, result.activeAccount.uuid);
      }
      loadAccountsList();
    });
  });

  // Trigger stagger animation
  requestAnimationFrame(() => {
    const items = list.querySelectorAll('.account-item');
    items.forEach((item, i) => {
      item.style.animationDelay = `${i * 80}ms`;
      item.classList.add('stagger-item');
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Offline input section toggle
const offlineInputSection = document.getElementById('offline-input-section');
const btnAddOffline = document.getElementById('btn-add-offline');
const btnCloseOfflineInput = document.getElementById('btn-close-offline-input');
const btnConfirmOffline = document.getElementById('btn-confirm-offline');
const inputNewOffline = document.getElementById('input-new-offline');

btnAddOffline.addEventListener('click', () => {
  offlineInputSection.classList.remove('hidden', 'hiding');
  setTimeout(() => inputNewOffline.focus(), 50);
});

btnCloseOfflineInput.addEventListener('click', () => {
  offlineInputSection.classList.add('hiding');
  setTimeout(() => {
    offlineInputSection.classList.add('hidden');
    offlineInputSection.classList.remove('hiding');
    inputNewOffline.value = '';
  }, 250);
});

btnConfirmOffline.addEventListener('click', async () => {
  const username = inputNewOffline.value.trim();
  if (!username) {
    inputNewOffline.focus();
    return;
  }
  const result = await window.launcher.authOffline(username);
  if (result.success) {
    setLoggedIn(result.username, result.uuid);
    inputNewOffline.value = '';
    offlineInputSection.classList.add('hidden');
    loadAccountsList();
  } else {
    showToast('Error: ' + result.error, 'error');
  }
});

inputNewOffline.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnConfirmOffline.click();
  if (e.key === 'Escape') btnCloseOfflineInput.click();
});

// Add Microsoft account from accounts page - trigger on both card and button
document.getElementById('card-add-microsoft').addEventListener('click', async (e) => {
  if (e.target.closest('button')) return; // Let button handler deal with it
  document.getElementById('btn-add-microsoft').click();
});

document.getElementById('btn-add-microsoft').addEventListener('click', async () => {
  const btn = document.getElementById('btn-add-microsoft');
  const card = document.getElementById('card-add-microsoft');
  const originalText = btn.textContent;

  btn.disabled = true;
  btn.textContent = 'Connexion...';
  card.style.opacity = '0.7';
  card.style.pointerEvents = 'none';

  const result = await window.launcher.authMicrosoft();

  btn.disabled = false;
  btn.textContent = originalText;
  card.style.opacity = '';
  card.style.pointerEvents = '';

  if (result.success) {
    setLoggedIn(result.username, result.uuid);
    loadAccountsList();
  } else if (!result.error?.includes('annule')) {
    showToast('Error: ' + (result.error || 'Unknown error'), 'error');
  }
});

// Settings
async function loadSettings() {
  const dirs = await window.launcher.getLauncherDir();
  document.getElementById('launcher-dir-path').textContent = dirs.launcherDir;
  document.getElementById('mods-dir-path').textContent = dirs.modsDir;

  // Load extended config
  const config = await window.launcher.getConfig();
  if (config) {
    // RAM
    if (config.ram) {
      const clampedRam = Math.min(Math.max(config.ram, ramMin), ramMax);
      if (settingsRam) {
        settingsRam.value = clampedRam;
        settingsRamValue.textContent = `${clampedRam} Go`;
      }
      ramSlider.value = clampedRam;
      ramValue.textContent = `${clampedRam} Go`;
    }
    // Resolution
    if (config.resolution) {
      const resSelect = document.getElementById('settings-resolution');
      const customRow = document.getElementById('custom-resolution-row');
      const [w, h] = config.resolution.split('x').map(Number);

      // Check if it matches a preset
      const presets = ['854x480', '1280x720', '1600x900', '1920x1080'];
      const presetMatch = presets.find(p => p === config.resolution);

      if (presetMatch) {
        resSelect.value = presetMatch;
        customRow.classList.add('hidden');
      } else {
        resSelect.value = 'custom';
        customRow.classList.remove('hidden');
        document.getElementById('custom-width').value = w || 1280;
        document.getElementById('custom-height').value = h || 720;
      }
    }
    // Fullscreen
    if (config.fullscreen !== undefined) {
      document.getElementById('settings-fullscreen').checked = config.fullscreen;
    }
    // Java path
    if (config.javaPath) {
      document.getElementById('settings-java-path').value = config.javaPath;
    }
    // JVM args
    if (config.jvmArgs) {
      document.getElementById('settings-jvm-args').value = config.jvmArgs;
    }
    // Language
    if (config.language) {
      document.getElementById('settings-language').value = config.language;
    }
    // Close on launch
    if (config.closeOnLaunch !== undefined) {
      document.getElementById('settings-close-on-launch').checked = config.closeOnLaunch;
    }
  }
}

// Update check button
document.getElementById('btn-check-update').addEventListener('click', async () => {
  const btn = document.getElementById('btn-check-update');
  const updateStatus = document.getElementById('update-status');

  // Prevent duplicate checks
  if (isCheckingForUpdates) {
    console.log('[UpdateCheck] Already checking, ignoring click');
    return;
  }

  isCheckingForUpdates = true;
  btn.disabled = true;
  btn.textContent = 'Vérification...';
  updateStatus.textContent = 'Vérification des mises à jour...';
  updateStatus.className = 'update-status';

  try {
    const result = await window.launcher.checkForUpdates();
    if (!result.success) {
      updateStatus.textContent = 'Erreur: ' + result.error;
      updateStatus.className = 'update-status update-error';
      // Reset button state on error
      isCheckingForUpdates = false;
      btn.disabled = false;
      btn.textContent = 'Vérifier les mises à jour';
    }
    // On success, event listeners will handle button state
  } catch (err) {
    console.error('[UpdateCheck] Error:', err);
    updateStatus.textContent = 'Erreur de vérification';
    updateStatus.className = 'update-status update-error';
    isCheckingForUpdates = false;
    btn.disabled = false;
    btn.textContent = 'Vérifier les mises à jour';
  } finally {
    // Safety timeout: reset button after 30s if events didn't fire
    setTimeout(() => {
      if (isCheckingForUpdates) {
        console.warn('[UpdateCheck] Timeout - resetting button state');
        isCheckingForUpdates = false;
        btn.disabled = false;
        btn.textContent = 'Vérifier les mises à jour';
        updateStatus.textContent = 'Erreur de vérification (timeout)';
        updateStatus.className = 'update-status update-error';
      }
    }, 30000);
  }
});

// Update status helper (accessible globally)
function setUpdateStatus(text, className = '') {
  const updateStatus = document.getElementById('update-status');
  if (!updateStatus) return;
  updateStatus.className = className ? `update-status ${className}` : 'update-status';
  const span = updateStatus.querySelector('span');
  if (span) {
    span.textContent = text;
  }
}

// Global update event listeners (registered once)
(function setupUpdateListeners() {
  const updateStatus = document.getElementById('update-status');
  const btnCheckUpdate = document.getElementById('btn-check-update');
  const updateProgressSection = document.getElementById('update-progress-section');
  const updateProgressFill = document.getElementById('update-progress-fill');
  const updateProgressText = document.getElementById('update-progress-text');

  window.launcher.onUpdateChecking(() => {
    setUpdateStatus('Verification des mises a jour...');
  });

  window.launcher.onUpdateAvailable((data) => {
    setUpdateStatus(data.message || 'Mise a jour disponible !', 'update-available');
    btnCheckUpdate.disabled = true;
    btnCheckUpdate.textContent = 'Telechargement en cours...';
    isCheckingForUpdates = false;
  });

  window.launcher.onUpdateNotAvailable(() => {
    setUpdateStatus('Deja a jour');
    showToast('Vous utilisez deja la derniere version', 'info');
    btnCheckUpdate.disabled = false;
    btnCheckUpdate.textContent = 'Verifier les mises a jour';
    isCheckingForUpdates = false;
  });

  window.launcher.onUpdateProgress((data) => {
    updateProgressSection.classList.remove('hidden');
    updateProgressFill.style.width = `${data.value}%`;
    updateProgressText.textContent = `Telechargement ${data.value}%`;
  });

  window.launcher.onUpdateDownloaded((data) => {
    setUpdateStatus(data.message || 'Installation prete', 'update-ready');
    updateProgressSection.classList.add('hidden');
    btnCheckUpdate.disabled = true;
    btnCheckUpdate.textContent = 'Redemarrage imminent...';
    isCheckingForUpdates = false;
  });

  window.launcher.onUpdateError((data) => {
    setUpdateStatus('Erreur: ' + (data.message || 'Inconnue'), 'update-error');
    btnCheckUpdate.disabled = false;
    btnCheckUpdate.textContent = 'Verifier les mises a jour';
    updateProgressSection.classList.add('hidden');
    isCheckingForUpdates = false;
  });
})();

document.querySelector('[data-page="settings"]').addEventListener('click', () => {
  loadSettings();
  loadMods(); // Refresh mods too
});

// ============================================================
// Init: load config, auto-login, load mods
// ============================================================
(async () => {
  await initRamLimits();

  const config = await window.launcher.getConfig();
  if (config && config.ram) {
    const clampedRam = Math.min(Math.max(config.ram, ramMin), ramMax);
    ramSlider.value = clampedRam;
    ramValue.textContent = `${clampedRam} Go`;
    settingsRam.value = clampedRam;
    settingsRamValue.textContent = `${clampedRam} Go`;
  }

  // Auto-login
  const login = await window.launcher.autoLogin();
  if (login.success) {
    setLoggedIn(login.username, login.uuid);
  }

  loadMods();
  loadSettings();
})();

// ============================================================
// Easter Egg: click logo 7 times
// ============================================================
(function() {
  let clickCount = 0;
  let clickTimer = null;
  const logo = document.querySelector('.logo-circle');
  if (!logo) return;

  logo.style.cursor = 'pointer';
  logo.addEventListener('click', () => {
    clickCount++;
    logo.classList.remove('easter-shake');
    void logo.offsetWidth;
    logo.classList.add('easter-shake');

    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => { clickCount = 0; }, 2000);

    if (clickCount >= 7) {
      clickCount = 0;
      triggerEasterEgg();
    }
  });

  function triggerEasterEgg() {
    const emojis = ['💀', '🧟', '🕷️', '🔥', '⛏️', '💎', '🗡️', '🏹', '🧨', '💣'];
    const overlay = document.createElement('div');
    overlay.className = 'easter-egg-overlay';
    document.body.appendChild(overlay);

    for (let i = 0; i < 40; i++) {
      const el = document.createElement('span');
      el.className = 'creeper';
      el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      el.style.left = Math.random() * 100 + '%';
      el.style.animationDuration = (2 + Math.random() * 3) + 's';
      el.style.animationDelay = (Math.random() * 1.5) + 's';
      overlay.appendChild(el);
    }

    const text = document.createElement('div');
    text.className = 'easter-egg-text';
    text.textContent = 'YAPAPOUAIYE FOREVER';
    document.body.appendChild(text);

    setTimeout(() => {
      overlay.remove();
      text.remove();
    }, 5000);
  }

  // ============================================================
  // Game Options Overlay (Right Shift)
  // ============================================================
  const gameOptionsOverlay = document.getElementById('game-options-overlay');
  const optNightVision = document.getElementById('opt-night-vision');
  const optNoFog = document.getElementById('opt-no-fog');
  const optShaders = document.getElementById('opt-shaders');

  let isOverlayVisible = false;
  let isRightShiftDown = false;

  function showGameOptionsOverlay() {
    if (isOverlayVisible) return;
    isOverlayVisible = true;
    gameOptionsOverlay.classList.remove('hidden');
  }

  function hideGameOptionsOverlay() {
    if (!isOverlayVisible) return;
    isOverlayVisible = false;
    gameOptionsOverlay.classList.add('hidden');
  }

  function toggleGameOptionsOverlay() {
    if (isOverlayVisible) {
      hideGameOptionsOverlay();
    } else {
      showGameOptionsOverlay();
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.code === 'ShiftRight' && !isRightShiftDown) {
      e.preventDefault();
      isRightShiftDown = true;
      toggleGameOptionsOverlay();
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.code === 'ShiftRight') {
      isRightShiftDown = false;
    }
  });

  gameOptionsOverlay.addEventListener('click', (e) => {
    if (e.target === gameOptionsOverlay) {
      hideGameOptionsOverlay();
    }
  });

  [optNightVision, optNoFog, optShaders].forEach(toggle => {
    toggle.addEventListener('change', () => {
      const optionName = toggle.id.replace('opt-', '');
      const isEnabled = toggle.checked;
      console.log(`[GameOptions] ${optionName}: ${isEnabled ? 'ON' : 'OFF'}`);
    });
  });
})();

// ============================================================
// Easter Egg: Konami Code (ArrowUp ArrowUp ArrowDown ArrowDown
// ArrowLeft ArrowRight ArrowLeft ArrowRight KeyB KeyA)
// ============================================================
(function () {
  const KONAMI = [
    'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
    'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
    'KeyB', 'KeyA'
  ];
  let buffer = [];
  let konamiActive = false;

  // Inject disco styles once
  const discoStyle = document.createElement('style');
  discoStyle.textContent = `
    @keyframes konami-rainbow {
      0%   { filter: hue-rotate(0deg) saturate(1.5); }
      100% { filter: hue-rotate(360deg) saturate(1.5); }
    }
    @keyframes konami-title-pulse {
      0%, 100% { transform: translate(-50%, -50%) scale(1); }
      50%      { transform: translate(-50%, -50%) scale(1.1); }
    }
    body.konami-mode {
      animation: konami-rainbow 3s linear infinite;
    }
    .konami-title {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 64px;
      font-weight: 900;
      letter-spacing: 4px;
      background: linear-gradient(90deg, #ff0080, #ff8c00, #ffd700, #00ff00, #00ffff, #8b5cf6, #ff0080);
      background-size: 200% 100%;
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      text-shadow: 0 0 40px rgba(139, 92, 246, 0.8);
      z-index: 99999;
      pointer-events: none;
      animation: konami-title-pulse 0.6s ease-in-out infinite;
      text-align: center;
      font-family: 'Inter', sans-serif;
    }
    .konami-subtitle {
      display: block;
      font-size: 20px;
      margin-top: 12px;
      letter-spacing: 2px;
      opacity: 0.9;
    }
    @keyframes konami-fall {
      0%   { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
      100% { transform: translateY(110vh) rotate(720deg); opacity: 0.3; }
    }
    .konami-particle {
      position: fixed;
      top: 0;
      font-size: 32px;
      z-index: 99998;
      pointer-events: none;
      animation: konami-fall linear forwards;
    }
  `;
  document.head.appendChild(discoStyle);

  document.addEventListener('keydown', (e) => {
    if (konamiActive) return;

    buffer.push(e.code);
    if (buffer.length > KONAMI.length) buffer.shift();

    if (buffer.length === KONAMI.length && buffer.every((k, i) => k === KONAMI[i])) {
      buffer = [];
      triggerKonami();
    }
  });

  function triggerKonami() {
    konamiActive = true;
    document.body.classList.add('konami-mode');

    const title = document.createElement('div');
    title.className = 'konami-title';
    title.innerHTML = 'YAPAPOUAIYE<br/><span class="konami-subtitle">★ CHEAT MODE ACTIVATED ★</span>';
    document.body.appendChild(title);

    const particles = ['⭐', '✨', '💫', '🌈', '🎉', '🎊', '⚡', '💥', '🔥', '🏆'];
    const particleEls = [];
    const particleInterval = setInterval(() => {
      const p = document.createElement('span');
      p.className = 'konami-particle';
      p.textContent = particles[Math.floor(Math.random() * particles.length)];
      p.style.left = Math.random() * 100 + 'vw';
      p.style.fontSize = (24 + Math.random() * 32) + 'px';
      p.style.animationDuration = (2 + Math.random() * 2) + 's';
      document.body.appendChild(p);
      particleEls.push(p);
      setTimeout(() => p.remove(), 4000);
    }, 80);

    showToast('🎮 Konami Code ! Cheat mode activated for 8s', 'success', 8000);

    setTimeout(() => {
      clearInterval(particleInterval);
      document.body.classList.remove('konami-mode');
      title.remove();
      particleEls.forEach(p => p.remove());
      konamiActive = false;
    }, 8000);
  }
})();
