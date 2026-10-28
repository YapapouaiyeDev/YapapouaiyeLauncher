'use strict';
const byId = id => document.getElementById(id);
let state = {phase: 'initializing', busy: true, queued: false};
let initialized = false;
let catalogKey = '';
let accessKey = '';
function page(name) {
  for (const item of ['accueil', 'parametres']) byId(item).hidden = item !== name;
  for (const tab of document.querySelectorAll('[data-page]')) {
    const selected = tab.dataset.page === name;
    tab.classList.toggle('selected', selected);
    if (selected) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
  }
  callNative('pageChanged', name);
}
function callNative(method, ...args) {
  if (window.YapaNative && typeof window.YapaNative[method] === 'function') window.YapaNative[method](...args);
}
function memoryValue() { return byId('memory-auto').checked ? 0 : Number(byId('memory').value); }
function updateMemory() {
  byId('memory-manual').hidden = byId('memory-auto').checked;
  byId('memory-value').textContent = `${byId('memory').value} Go`;
}
window.launcherState = next => {
  state = next;
  const profileLocked = Boolean(state.queued || state.authenticating || ['launching', 'running'].includes(state.phase));
  const settingsLocked = Boolean(state.busy || state.queued);
  byId('auth-mode').value = state.authMode || 'offline';
  byId('auth-mode').disabled = settingsLocked || state.authenticating;
  const microsoft = state.authMode === 'microsoft';
  byId('offline-profile').hidden = microsoft;
  byId('microsoft-profile').hidden = !microsoft;
  byId('microsoft-status').textContent = state.authenticating ? 'Connexion Microsoft en cours…' : state.microsoftConfigured === false ? 'La connexion Microsoft n’est pas encore activée dans cette version du launcher.' : state.microsoftName ? `Connecté : ${state.microsoftName}` : 'Aucun compte Microsoft connecté.';
  byId('microsoft-button').textContent = state.microsoftName ? 'Ajouter un compte Microsoft' : 'Se connecter avec Microsoft';
  byId('microsoft-button').disabled = settingsLocked || state.authenticating || state.microsoftConfigured === false;
  byId('account-button').hidden = !state.microsoftName;
  byId('account-button').disabled = settingsLocked || state.authenticating;
  byId('graphics-preset').value = state.preset || 'custom';
  byId('hide-cursor').checked = Boolean(state.hideCursor);
  byId('auto-updates').checked = state.autoUpdates !== false;
  for (const id of ['graphics-preset', 'hide-cursor', 'auto-updates', 'memory-auto', 'memory']) byId(id).disabled = settingsLocked;
  byId('update-status').textContent = state.updateMessage || '';
  byId('update-notice').hidden = !state.updateAvailable;
  byId('update-notice-text').textContent = state.updateMessage || 'Une mise à jour du launcher est disponible.';
  byId('check-update-button').disabled = Boolean(state.updateBusy);
  byId('update-button').hidden = !state.updateAvailable;
  byId('update-button').disabled = Boolean(state.updateBusy || settingsLocked || state.authenticating);
  byId('update-button').textContent = state.updateReady ? 'Installer la mise à jour' : 'Télécharger la mise à jour';
  if (!initialized) {
    if (!byId('username').value) byId('username').value = state.username || '';
    byId('memory').max = String(state.maxRam || 6);
    byId('memory-auto').checked = !state.ram;
    byId('memory').value = String(state.ram || Math.min(3, state.maxRam || 6));
    initialized = true;
    updateMemory();
  }
  byId('status').textContent = state.message || 'Préparation du jeu…';
  byId('app-version').textContent = state.version ? `v${state.version} · Android` : 'Android';
  const servers = state.servers || [];
  const key = JSON.stringify(servers.map(s => [s.id, s.name]));
  if (key !== catalogKey) {
    byId('server-select').replaceChildren();
    for (const server of servers) {
      const option = document.createElement('option'); option.value = server.id; option.textContent = server.name;
      byId('server-select').append(option);
    }
    catalogKey = key;
  }
  byId('server-select').value = state.selectedId || '';
  byId('server-select').disabled = Boolean(state.busy || state.queued || !servers.length);
  byId('refresh-button').disabled = Boolean(state.busy || state.queued);
  byId('catalog-hint').textContent = servers.length ? `${servers.length} serveur${servers.length > 1 ? 's' : ''} disponible${servers.length > 1 ? 's' : ''} · Catalogue actualisé à l’ouverture et avant de jouer.` : 'Aucun serveur chargé. Vérifie ta connexion puis appuie sur Actualiser.';
  byId('server-name').textContent = state.serverName || 'Tes serveurs';
  byId('server-description').textContent = servers.find(s => s.id === state.selectedId)?.description || 'Retrouve ton serveur, tes mods et ton aventure, sur mobile.';
  byId('server-address').textContent = state.address || 'Choisis un serveur dans le catalogue';
  byId('game-version').textContent = state.minecraft ? `Minecraft ${state.minecraft}` : 'Minecraft Java';
  byId('loader-name').textContent = ({neoforge: 'NeoForge', fabric: 'Fabric', forge: 'Forge', vanilla: 'Vanilla'})[state.loader] || 'Installation automatique';
  byId('join-hint').textContent = state.selectedId ? `Connexion automatique à ${state.serverName}` : 'Connexion automatique au serveur choisi';
  byId('access-form').hidden = !state.codesRequired || !['access', 'error'].includes(state.phase);
  const nextAccessKey = `${state.selectedId}:${state.codesCount}`;
  if (nextAccessKey !== accessKey) {
    byId('access-inputs').replaceChildren();
    for (let i = 0; i < Math.min(20, state.codesCount || 0); i++) {
      const label = document.createElement('label'); label.htmlFor = `access-${i}`; label.textContent = `Code ${i + 1}`;
      const input = document.createElement('input'); input.id = label.htmlFor; input.type = 'password'; input.required = true; input.maxLength = 128; input.autocomplete = 'off';
      byId('access-inputs').append(label, input);
    }
    accessKey = nextAccessKey;
  }
  byId('access-button').disabled = Boolean(state.busy);
  for (const input of byId('access-inputs').querySelectorAll('input')) input.disabled = Boolean(state.busy);
  byId('progress').hidden = !state.busy || state.phase === 'running';
  document.querySelector('.preparation').setAttribute('aria-busy', String(Boolean(state.busy)));
  byId('cancel-button').hidden = !state.busy || ['launching', 'running', 'cancelling'].includes(state.phase);
  byId('play-button').disabled = !state.selectedId || ['initializing', 'loading', 'access', 'launching', 'running', 'cancelling'].includes(state.phase) || state.queued || state.authenticating || (microsoft && (!state.microsoftName || state.microsoftConfigured === false));
  byId('play-label').textContent = state.phase === 'running' ? 'JEU EN COURS' : state.phase === 'launching' ? 'LANCEMENT…' : state.queued ? 'LANCEMENT PRÉVU' : state.busy ? 'JOUER APRÈS L’INSTALLATION' : 'JOUER';
  byId('play-button').setAttribute('aria-label', state.busy ? 'Jouer à la fin de l’installation' : `Jouer sur ${state.serverName || 'le serveur choisi'}`);
  byId('username').disabled = profileLocked;
  byId('advanced-button').disabled = Boolean(state.busy);
  byId('download-hint').hidden = state.ready;
  byId('step-game').classList.toggle('done', state.gameInstalled || state.ready);
  byId('step-mods').classList.toggle('done', Boolean(state.ready));
  byId('step-game').firstElementChild.textContent = state.gameInstalled || state.ready ? '✓' : '2';
  byId('step-mods').firstElementChild.textContent = state.ready ? '✓' : '3';
  byId('error-box').hidden = !state.error;
  byId('error-message').textContent = state.error || '';
  byId('retry-button').disabled = Boolean(state.busy);
};
document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => page(button.dataset.page)));
document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); page('accueil'); });
byId('play-form').addEventListener('submit', event => {
  event.preventDefault();
  const username = byId('username').value.trim();
  const valid = state.authMode === 'microsoft' ? Boolean(state.microsoftName) : /^[A-Za-z0-9_]{3,16}$/.test(username);
  byId('username-error').hidden = valid;
  byId('username').setAttribute('aria-invalid', String(!valid));
  if (!valid) {
    byId('username-error').textContent = 'Choisis un pseudo de 3 à 16 lettres, chiffres ou tirets bas.';
    byId('username').focus();
    return;
  }
  if (!byId('play-button').disabled) callNative('play', username, memoryValue());
});
byId('retry-button').addEventListener('click', () => callNative('prepare'));
byId('refresh-button').addEventListener('click', () => callNative('refresh'));
byId('server-select').addEventListener('change', () => callNative('selectServer', byId('server-select').value));
byId('access-form').addEventListener('submit', event => {
  event.preventDefault();
  callNative('access', JSON.stringify([...byId('access-inputs').querySelectorAll('input')].map(input => input.value.trim())));
});
byId('cancel-button').addEventListener('click', () => callNative('cancel'));
byId('advanced-button').addEventListener('click', () => callNative('advanced'));
byId('license-button').addEventListener('click', () => callNative('licenses'));
byId('auth-mode').addEventListener('change', () => callNative('auth', byId('auth-mode').value));
byId('microsoft-button').addEventListener('click', () => callNative('microsoft'));
byId('account-button').addEventListener('click', () => callNative('chooseMicrosoft'));
byId('check-update-button').addEventListener('click', () => callNative('checkUpdate'));
byId('update-button').addEventListener('click', () => callNative('update'));
byId('update-settings-button').addEventListener('click', () => page('parametres'));
for (const id of ['graphics-preset', 'hide-cursor', 'auto-updates']) byId(id).addEventListener('change', () => {
  callNative('preferences', byId('graphics-preset').value, byId('hide-cursor').checked, byId('auto-updates').checked);
});
byId('memory-auto').addEventListener('change', () => { updateMemory(); callNative('settings', memoryValue()); });
byId('memory').addEventListener('input', updateMemory);
byId('memory').addEventListener('change', () => callNative('settings', memoryValue()));
updateMemory();
window.goHome = () => page('accueil');
callNative('ready');
