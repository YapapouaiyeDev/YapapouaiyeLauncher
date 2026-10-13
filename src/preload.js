const { contextBridge, ipcRenderer } = require('electron');

function singleListener(channel, typeFilter) {
  let prev = null;
  return (callback) => {
    if (prev) ipcRenderer.removeListener(channel, prev);
    prev = (_, data) => {
      if (typeFilter && data.type !== typeFilter) return;
      callback(data);
    };
    ipcRenderer.on(channel, prev);
  };
}

contextBridge.exposeInMainWorld('launcher', {
  minimize: () => ipcRenderer.send('minimize'),
  maximize: () => ipcRenderer.send('maximize'),
  close: () => ipcRenderer.send('close'),
  getWindowState: () => ipcRenderer.invoke('get-window-state'),

  // Auth
  getInvitationStatus: () => ipcRenderer.invoke('get-invitation-status'),
  verifyInvitation: (code) => ipcRenderer.invoke('verify-invitation', code),
  authMicrosoft: () => ipcRenderer.invoke('auth-microsoft'),
  authOffline: (username) => ipcRenderer.invoke('auth-offline', username),
  autoLogin: () => ipcRenderer.invoke('auto-login'),
  logout: () => ipcRenderer.invoke('auth-logout'),

  // Multi-account
  getAccounts: () => ipcRenderer.invoke('get-accounts'),
  switchAccount: (index) => ipcRenderer.invoke('switch-account', index),
  removeAccount: (index) => ipcRenderer.invoke('remove-account', index),

  // Config & Themes
  getSystemRam: () => ipcRenderer.invoke('get-system-ram'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  getClientMods: () => ipcRenderer.invoke('get-client-mods'),
  saveClientMods: (mods) => ipcRenderer.invoke('save-client-mods', mods),
  applyClientMods: (mods) => ipcRenderer.invoke('apply-client-mods', mods),
  saveClientModsConfig: (mods) => ipcRenderer.invoke('save-client-mods', mods),
  syncClientOptions: (mods) => ipcRenderer.invoke('apply-client-mods', mods),
  selectJavaPath: () => ipcRenderer.invoke('select-java-path'),
  exportCustomTheme: (theme) => ipcRenderer.invoke('export-custom-theme', theme),
  importCustomThemeFile: () => ipcRenderer.invoke('import-custom-theme-file'),
  selectImageFile: () => ipcRenderer.invoke('select-image-file'),
  selectAudioFile: () => ipcRenderer.invoke('select-audio-file'),
  applyKeyboardLayout: (layout) => ipcRenderer.invoke('apply-keyboard-layout', layout),

  // Game & Server
  launchGame: (options) => ipcRenderer.invoke('launch-game', options),
  checkServerStatus: (serverId) => ipcRenderer.invoke('check-server-status', serverId),
  getServers: () => ipcRenderer.invoke('get-servers'),
  setActiveServer: (serverId) => ipcRenderer.invoke('set-active-server', serverId),

  // Serveurs distants + maintenance (espace admin du site)
  getLauncherConfig: () => ipcRenderer.invoke('get-launcher-config'),
  refreshRemoteServers: () => ipcRenderer.invoke('refresh-remote-servers'),
  checkServerAccess: (serverId) => ipcRenderer.invoke('check-server-access', serverId),
  verifyServerCodes: (payload) => ipcRenderer.invoke('verify-server-codes', payload),

  // Mods
  getMods: (serverId) => ipcRenderer.invoke('get-mods', serverId),
  getLauncherDir: (serverId) => ipcRenderer.invoke('get-launcher-dir', serverId),
  syncMods: (serverId) => ipcRenderer.invoke('sync-mods', serverId),
  openCustomMods: () => ipcRenderer.invoke('open-custom-mods'),
  openServerMods: (serverId) => ipcRenderer.invoke('open-server-mods', serverId),

  // État initial pré-chargé pendant le splash (auth + serveurs + mods locaux).
  // Évite le flash "Non connecté" à l'ouverture de la fenêtre.
  getInitialState: () => ipcRenderer.invoke('get-initial-state'),

  // Updates
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  getLatestReleaseInfo: () => ipcRenderer.invoke('get-latest-release-info'),
  checkFirstLaunchAfterUpdate: () => ipcRenderer.invoke('check-first-launch-after-update'),
  markVersionSeen: () => ipcRenderer.invoke('mark-version-seen'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Canal Beta Tester : versions "-beta" / "-alpha" + retour stable
  getUpdateChannel: () => ipcRenderer.invoke('get-update-channel'),
  setBetaTester: (enabled) => ipcRenderer.invoke('set-beta-tester', enabled),
  checkBetaUpdate: () => ipcRenderer.invoke('check-beta-update'),
  installUpdateVersion: (version) => ipcRenderer.invoke('install-update-version', version),

  // Verrouillage par mot de passe (lancement du jeu + PC retenu)
  getLaunchLockStatus: () => ipcRenderer.invoke('get-launch-lock-status'),
  setLaunchPassword: (payload) => ipcRenderer.invoke('set-launch-password', payload),
  verifyLaunchPassword: (payload) => ipcRenderer.invoke('verify-launch-password', payload),
  disableLaunchLock: (payload) => ipcRenderer.invoke('disable-launch-lock', payload),
  forgetTrustedPc: (payload) => ipcRenderer.invoke('forget-trusted-pc', payload),

  // Events (re-calling replaces the previous listener to prevent accumulation)
  onProgress: singleListener('progress'),
  onUpdateChecking: singleListener('progress', 'update-checking'),
  onUpdateAvailable: singleListener('progress', 'update-available'),
  onUpdateNotAvailable: singleListener('progress', 'update-not-available'),
  onUpdateProgress: singleListener('progress', 'update-progress'),
  onUpdateDownloaded: singleListener('progress', 'update-downloaded'),
  onUpdateError: singleListener('progress', 'update-error'),
  onGameLog: singleListener('game-log'),
  onGameClosed: singleListener('game-closed'),
  onGameError: singleListener('game-error'),
  onWindowStateChanged: singleListener('window-state'),
  onClientModsUpdated: singleListener('client-mods-updated')
});

// Overlay window API
contextBridge.exposeInMainWorld('api', {
  sendOptions: (opts) => ipcRenderer.send('overlay-options', opts),
  onToggleOverlay: (cb) => ipcRenderer.on('overlay-toggle', () => cb()),
  onShowOverlay: (cb) => ipcRenderer.on('overlay-show', () => cb()),
  onHideOverlay: (cb) => ipcRenderer.on('overlay-hide', () => cb()),
  onSetOptions: (cb) => ipcRenderer.on('overlay-set-options', (_, opts) => cb(opts)),
});
