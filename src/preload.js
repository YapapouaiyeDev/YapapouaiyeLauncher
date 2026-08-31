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
  selectJavaPath: () => ipcRenderer.invoke('select-java-path'),
  exportCustomTheme: (theme) => ipcRenderer.invoke('export-custom-theme', theme),
  importCustomThemeFile: () => ipcRenderer.invoke('import-custom-theme-file'),
  selectImageFile: () => ipcRenderer.invoke('select-image-file'),
  selectAudioFile: () => ipcRenderer.invoke('select-audio-file'),

  // Game & Server
  launchGame: (options) => ipcRenderer.invoke('launch-game', options),
  checkServerStatus: (serverId) => ipcRenderer.invoke('check-server-status', serverId),
  getServers: () => ipcRenderer.invoke('get-servers'),
  setActiveServer: (serverId) => ipcRenderer.invoke('set-active-server', serverId),

  // Mods
  getMods: (serverId) => ipcRenderer.invoke('get-mods', serverId),
  getLauncherDir: () => ipcRenderer.invoke('get-launcher-dir'),
  syncMods: (serverId) => ipcRenderer.invoke('sync-mods', serverId),
  openCustomMods: () => ipcRenderer.invoke('open-custom-mods'),

  // Updates
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  getLatestReleaseInfo: () => ipcRenderer.invoke('get-latest-release-info'),
  checkFirstLaunchAfterUpdate: () => ipcRenderer.invoke('check-first-launch-after-update'),
  markVersionSeen: () => ipcRenderer.invoke('mark-version-seen'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

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
  onWindowStateChanged: singleListener('window-state')
});

// Overlay window API
contextBridge.exposeInMainWorld('api', {
  sendOptions: (opts) => ipcRenderer.send('overlay-options', opts),
  onToggleOverlay: (cb) => ipcRenderer.on('overlay-toggle', () => cb()),
  onShowOverlay: (cb) => ipcRenderer.on('overlay-show', () => cb()),
  onHideOverlay: (cb) => ipcRenderer.on('overlay-hide', () => cb()),
  onSetOptions: (cb) => ipcRenderer.on('overlay-set-options', (_, opts) => cb(opts)),
});
