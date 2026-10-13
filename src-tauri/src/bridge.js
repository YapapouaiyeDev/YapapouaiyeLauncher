(function () {
  if (window.__TAURI_BRIDGE_INITIALIZED__) return;
  if (!window.__TAURI__ && window.launcher) return;
  window.__TAURI_BRIDGE_INITIALIZED__ = true;

  function getTauri() {
    return window.__TAURI__;
  }

  function invoke(cmd, args) {
    const tauri = getTauri();
    if (tauri && tauri.core && typeof tauri.core.invoke === 'function') {
      return tauri.core.invoke(cmd, args);
    }
    return Promise.reject(new Error("Tauri core.invoke non disponible"));
  }

  function singleListener(channel, typeFilter) {
    let unlisten = null;
    return (callback) => {
      if (typeof unlisten === 'function') {
        unlisten();
        unlisten = null;
      }
      const tauri = getTauri();
      if (tauri && tauri.event && typeof tauri.event.listen === 'function') {
        tauri.event.listen(channel, (event) => {
          const data = event.payload;
          if (typeFilter && (!data || data.type !== typeFilter)) return;
          try {
            callback(data);
          } catch (e) {
            console.error(`[Event Error] ${channel}:`, e);
          }
        }).then((unsub) => {
          unlisten = unsub;
        });
      }
    };
  }

  window.launcher = {
    // Window controls
    minimize: () => invoke('minimize'),
    maximize: () => invoke('maximize'),
    close: () => invoke('close'),
    getWindowState: () => invoke('get_window_state'),

    // Auth
    getInvitationStatus: () => invoke('get_invitation_status'),
    verifyInvitation: (code) => invoke('verify_invitation', { code }),
    authMicrosoft: () => invoke('auth_microsoft'),
    authOffline: (username) => invoke('auth_offline', { username }),
    autoLogin: () => invoke('auto_login'),
    logout: () => invoke('auth_logout'),

    // Multi-account
    getAccounts: () => invoke('get_accounts'),
    switchAccount: (index) => invoke('switch_account', { index }),
    removeAccount: (index) => invoke('remove_account', { index }),

    // Config & Themes
    getSystemRam: () => invoke('get_system_ram'),
    getConfig: () => invoke('get_config'),
    saveConfig: (config) => invoke('save_config_cmd', { config }),
    getClientMods: () => invoke('get_client_mods_cmd'),
    saveClientMods: (mods) => invoke('save_client_mods_cmd', { mods }),
    applyClientMods: (mods) => invoke('apply_client_mods_cmd', { mods }),
    selectJavaPath: () => invoke('select_java_path'),
    exportCustomTheme: (theme) => invoke('export_custom_theme', { theme }),
    importCustomThemeFile: () => invoke('import_custom_theme_file'),
    selectImageFile: () => invoke('select_image_file'),
    selectAudioFile: () => invoke('select_audio_file'),

    // Game & Server
    launchGame: (options) => invoke('launch_game', { options }),
    checkServerStatus: (serverId) => invoke('check_server_status', { serverId }),
    getServers: () => invoke('get_servers'),
    setActiveServer: (serverId) => invoke('set_active_server', { serverId }),

    // Mods
    getMods: (serverId) => invoke('get_mods', { serverId }),
    getLauncherDir: () => invoke('get_launcher_dir'),
    syncMods: (serverId) => invoke('sync_mods', { serverId }),
    openCustomMods: () => invoke('open_custom_mods'),

    // Updates
    getAppVersion: () => invoke('get_app_version'),
    checkForUpdates: () => invoke('check_for_updates'),
    getLatestReleaseInfo: () => invoke('get_latest_release_info'),
    checkFirstLaunchAfterUpdate: () => invoke('check_first_launch_after_update'),
    markVersionSeen: () => invoke('mark_version_seen'),
    openExternal: (url) => invoke('open_external', { url }),

    // Events
    onProgress: singleListener('progress'),
    onUpdateChecking: singleListener('progress', 'update-checking'),
    onUpdateAvailable: singleListener('progress', 'update-available'),
    onUpdateNotAvailable: singleListener('progress', 'update-not-available'),
    onUpdateProgress: singleListener('progress', 'update-progress'),
    onUpdateDownloaded: singleListener('progress', 'update-downloaded'),
    onUpdateError: singleListener('progress', 'update-error'),
    onGameLog: singleListener('game-log'),
    onGameClosed: singleListener('game-closed'),
    onClientModsUpdated: singleListener('client-mods-updated'),
    onGameError: singleListener('game-error'),
    onWindowStateChanged: singleListener('window-state')
  };

  window.api = {
    sendOptions: (opts) => invoke('overlay_options', { opts }),
    onToggleOverlay: singleListener('overlay-toggle'),
    onShowOverlay: singleListener('overlay-show'),
    onHideOverlay: singleListener('overlay-hide'),
    onSetOptions: singleListener('overlay-set-options')
  };

  console.log("[Tauri Bridge] window.launcher et window.api initialisés avec succès");
})();
