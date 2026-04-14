const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const os = require("os");
const { Launch, Microsoft } = require("minecraft-java-core");
const { autoUpdater } = require("electron-updater");
const fs = require("fs");
const https = require("https");

// Load environment variables from .env file
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

// ============================================================
// CONFIGURATION
// ============================================================
// Mods repository on GitLab
const GITLAB_PROJECT_PATH = "yapapouaiyedev%2FModYapapouaiyeLauncher";
const GITLAB_BRANCH = "main";
const GITLAB_TOKEN = process.env.GITLAB_TOKEN || ""; // Loaded from .env
// Launcher auto-updates are configured in package.json "build.publish" section
// GitHub token (GH_TOKEN) is automatically used by electron-updater from env
const GITHUB_OWNER_LAUNCHER = "yapapouaiyestudios";
const GITHUB_REPO_LAUNCHER = "YapapouaiyeLauncher";
const SERVER_IP = "yapapouaiyelive.falixsrv.me";
const SERVER_PORT = 25565;
// ============================================================

const rootPath = app.getPath("appData");
const launcherDir = path.join(rootPath, ".yapapouaiye-launcher");
const gameDir = path.join(launcherDir, "minecraft");
const modsDir = path.join(launcherDir, "mods");
const customModsDir = path.join(launcherDir, "mods-custom");
const accountsFile = path.join(launcherDir, "accounts.json");
const configFile = path.join(launcherDir, "config.json");
const modsHashFile = path.join(launcherDir, "mods-hash.json");

if (!fs.existsSync(launcherDir)) fs.mkdirSync(launcherDir, { recursive: true });
if (!fs.existsSync(gameDir)) fs.mkdirSync(gameDir, { recursive: true });
if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true });
if (!fs.existsSync(customModsDir)) fs.mkdirSync(customModsDir, { recursive: true });

let mainWindow;
let overlayWindow;
let authAccount = null;
let gameOptions = { nightVision: false, noFog: false, shaders: false };
let gameProcess = null;

// ============================================================
// Config (saves RAM etc.)
// ============================================================
function loadConfig() {
  try {
    if (fs.existsSync(configFile)) return JSON.parse(fs.readFileSync(configFile, "utf-8"));
  } catch {}
  return { ram: 4 };
}

function saveConfig(config) {
  const existing = loadConfig();
  const merged = { ...existing, ...config };
  fs.writeFileSync(configFile, JSON.stringify(merged, null, 2));
}

// ============================================================
// Multi-account storage
// ============================================================
function loadAccounts() {
  try {
    if (fs.existsSync(accountsFile)) return JSON.parse(fs.readFileSync(accountsFile, "utf-8"));
  } catch {}
  return { accounts: [], activeIndex: -1 };
}

function saveAccounts(data) {
  fs.writeFileSync(accountsFile, JSON.stringify(data, null, 2));
}

// ============================================================
// Window
// ============================================================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, "..", "assets", "logo.png"),
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

function createOverlayWindow(resolution) {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
  }

  const [w, h] = resolution.split("x").map(Number);

  overlayWindow = new BrowserWindow({
    width: w,
    height: h,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.loadFile(path.join(__dirname, "overlay.html"));

  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });
}

function destroyOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
    overlayWindow = null;
  }
}

app.whenReady().then(() => {
  createWindow();
  
  // ============================================================
  // Auto-update : check GitHub releases on every startup
  // ============================================================
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // Force update checks in development mode (unpacked app)
  autoUpdater.forceDevUpdateConfig = true;
  
  // Explicitly set the dev update config file path
  autoUpdater.updateConfigPath = path.join(__dirname, "..", "dev-app-update.yml");

  // Fix: Override GitHubProvider to use REST API instead of atom feed
  const { GitHubProvider } = require("electron-updater/out/providers/GitHubProvider");

  // Store original method
  const originalGetLatestVersion = GitHubProvider.prototype.getLatestVersion;

  GitHubProvider.prototype.getLatestVersion = async function() {
    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    const headers = { "User-Agent": "electron-updater" };
    if (token) headers.Authorization = `token ${token}`;

    // Fetch ALL releases (not just /latest) to find the actual highest semver
    const url = `https://api.github.com/repos/${this.options.owner}/${this.options.repo}/releases?per_page=100`;

    console.log("[AutoUpdater] Fetching all releases from:", url);

    // Use Node.js https directly
    const https = require("https");
    const allReleases = await new Promise((resolve, reject) => {
      https.get(url, { headers }, (res) => {
        let body = "";
        res.on("data", (chunk) => body += chunk);
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`GitHub API returned ${res.statusCode}: ${body}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      }).on("error", reject);
    });

    if (!allReleases || allReleases.length === 0) {
      throw new Error("No release data received from GitHub");
    }

    console.log(`[AutoUpdater] Found ${allReleases.length} releases on GitHub`);

    // Filter only non-draft releases with assets
    const validReleases = allReleases.filter(r => !r.draft && r.assets && r.assets.length > 0);

    if (validReleases.length === 0) {
      throw new Error("No valid releases found (all are drafts or have no assets)");
    }

    // Find the release with the highest semver
    const semver = require("semver");
    let latestRelease = validReleases[0];

    for (const release of validReleases) {
      const rawVersion = release.tag_name.replace(/^v/, "");
      const parts = rawVersion.split(".");
      while (parts.length < 3) parts.push("0");
      const normalizedVersion = parts.join(".");

      if (semver.valid(normalizedVersion) && semver.gt(normalizedVersion, getReleaseVersion(latestRelease))) {
        latestRelease = release;
      }
    }

    // Helper function to get version string
    function getReleaseVersion(release) {
      const raw = release.tag_name.replace(/^v/, "");
      const parts = raw.split(".");
      while (parts.length < 3) parts.push("0");
      return parts.join(".");
    }

    const rawVersion = latestRelease.tag_name.replace(/^v/, "");
    const parts = rawVersion.split(".");
    while (parts.length < 3) parts.push("0");
    const semverVersion = parts.join(".");

    console.log(`[AutoUpdater] Latest version: ${semverVersion} (tag: ${latestRelease.tag_name})`);

    // Check if release has downloadable assets
    const assets = latestRelease.assets || [];
    if (assets.length === 0) {
      console.warn("[AutoUpdater] Release has no assets (files). Notes:", latestRelease.body);
      throw new Error("No files provided");
    }

    // Find Windows installer asset
    const winAssets = assets.filter((a) => a.name && (a.name.endsWith(".exe") || a.name.endsWith(".nsis")));

    if (winAssets.length === 0) {
      console.warn("[AutoUpdater] No Windows installer found. Available assets:", assets.map(a => a.name));
      throw new Error("No Windows installer found in release");
    }

    console.log("[AutoUpdater] Assets:", winAssets.map(a => a.name));

    // Fetch latest.yml from release assets for proper checksums
    let checksums = {};
    const ymlAsset = assets.find((a) => a.name === "latest.yml");
    if (ymlAsset) {
      try {
        console.log("[AutoUpdater] Fetching checksums from latest.yml asset");
        const ymlData = await httpGet(ymlAsset.browser_download_url, false, false);
        const yaml = require("js-yaml");
        const parsed = yaml.load(ymlData.toString());
        if (parsed && parsed.files) {
          parsed.files.forEach((f) => {
            checksums[f.url] = f.sha512 || "";
          });
        }
        console.log("[AutoUpdater] Loaded checksums:", Object.keys(checksums));
      } catch (err) {
        console.warn("[AutoUpdater] Could not fetch checksums from latest.yml:", err.message);
      }
    }

    // If we still don't have checksums, try fetching from the version-specific YAML
    const versionYmlName = `${semverVersion}.yml`;
    const versionYmlAsset = assets.find((a) => a.name === versionYmlName);
    if (Object.keys(checksums).length === 0 && versionYmlAsset) {
      try {
        console.log("[AutoUpdater] Fetching checksums from version YAML:", versionYmlName);
        const ymlData = await httpGet(versionYmlAsset.browser_download_url, false, false);
        const yaml = require("js-yaml");
        const parsed = yaml.load(ymlData.toString());
        if (parsed && parsed.files) {
          parsed.files.forEach((f) => {
            checksums[f.url] = f.sha512 || "";
          });
        }
        console.log("[AutoUpdater] Loaded checksums from version YAML:", Object.keys(checksums));
      } catch (err) {
        console.warn("[AutoUpdater] Could not fetch checksums from version YAML:", err.message);
      }
    }

    // Return in the format GitHubProvider expects
    return {
      version: semverVersion,
      tag: latestRelease.tag_name, // CRITICAL: GitHubProvider needs this to construct download URLs
      releaseName: latestRelease.name || semverVersion,
      releaseNotes: latestRelease.body,
      releaseDate: latestRelease.published_at,
      files: winAssets.map((a) => ({
        url: a.name, // Just the filename - GitHubProvider will construct the full URL
        sha512: checksums[a.name] || "", // Empty string is OK, will skip checksum validation
        size: a.size,
        name: a.name
      }))
    };
  };

  // CRITICAL FIX: Override resolveFiles to construct proper download URLs
  // GitHub download URLs use github.com, NOT api.github.com
  GitHubProvider.prototype.resolveFiles = function(updateInfo) {
    const owner = this.options.owner;
    const repo = this.options.repo;
    
    // FIX: Extract tag_name directly since updateInfo.tag is undefined
    const tag_name = updateInfo.tag || updateInfo.releaseTag || 'v' + updateInfo.version;
    const tag = tag_name.replace(/^v/, ''); // Use raw tag for URL

    console.log("[AutoUpdater] resolveFiles - tag_name:", tag_name);
    console.log("[AutoUpdater] resolveFiles - tag:", tag);
    console.log("[AutoUpdater] resolveFiles - files:", updateInfo.files?.length || 0, "files");

    if (!tag_name) {
      console.error("[AutoUpdater] ERROR: tag_name is undefined!");
      throw new Error("Cannot resolve files: tag_name is undefined");
    }

    if (!updateInfo.files || updateInfo.files.length === 0) {
      console.error("[AutoUpdater] ERROR: no files provided!");
      throw new Error("No files provided");
    }

    // Build ResolvedUpdateFileInfo array directly
    return updateInfo.files.map((fileInfo) => {
      const fileName = (fileInfo.url || fileInfo.name || "").replace(/ /g, "-");
      // Correct GitHub download URL format: https://github.com/owner/repo/releases/download/tag_name/filename
      const downloadUrl = `https://github.com/${owner}/${repo}/releases/download/${tag_name}/${fileName}`;

      console.log("[AutoUpdater] Resolved file:", {
        name: fileName,
        url: downloadUrl,
        sha512: fileInfo.sha512 ? fileInfo.sha512.substring(0, 20) + "..." : "(empty)",
        size: fileInfo.size
      });

      return {
        url: new URL(downloadUrl),
        info: fileInfo
      };
    });
  };

  // Debug logging
  console.log("[AutoUpdater] Config path:", autoUpdater.updateConfigPath);
  if (process.env.GH_TOKEN) {
    console.log("[AutoUpdater] GH_TOKEN loaded (length:", process.env.GH_TOKEN.length + ")");
  } else {
    console.warn("[AutoUpdater] No GH_TOKEN found - public repo access only");
  }

  autoUpdater.on("checking-for-update", () => {
    console.log("[AutoUpdater] Checking for updates...");
    if (mainWindow) mainWindow.webContents.send("progress", { type: "update-checking", message: "Verification des mises a jour..." });
  });

  autoUpdater.on("update-available", (info) => {
    console.log("[AutoUpdater] Update available:", info.version);
    if (mainWindow) mainWindow.webContents.send("progress", { type: "update-available", message: `Mise a jour ${info.version} disponible !`, version: info.version });
  });

  autoUpdater.on("update-not-available", () => {
    console.log("[AutoUpdater] Already up to date.");
    if (mainWindow) mainWindow.webContents.send("progress", { type: "update-not-available", message: "Deja a jour" });
  });

  autoUpdater.on("download-progress", (progress) => {
    const percent = Math.round(progress.percent);
    console.log(`[AutoUpdater] Download: ${percent}%`);
    if (mainWindow) mainWindow.webContents.send("progress", {
      type: "update-progress",
      value: percent,
      speed: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log("[AutoUpdater] Update downloaded:", info.version);
    if (mainWindow) mainWindow.webContents.send("progress", { type: "update-downloaded", message: `v${info.version} prete ! Redemarrage dans 5s...` });
    setTimeout(() => autoUpdater.quitAndInstall(false, true), 5000);
  });

  autoUpdater.on("error", (err) => {
    console.error("[AutoUpdater] Error:", err.message);
    if (mainWindow) mainWindow.webContents.send("progress", { type: "update-error", message: err.message });
  });

  // Check for updates at startup
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error("[AutoUpdater] Failed to check for updates:", err.message);
  });
});
app.on("window-all-closed", () => app.quit());

// ============================================================
// HTTP helper
// ============================================================
function httpGet(url, binary = false, useGitLabToken = false) {
  return new Promise((resolve, reject) => {
    const headers = { "User-Agent": "YapapouaiyeLauncher" };
    if (useGitLabToken && GITLAB_TOKEN && GITLAB_TOKEN !== "YOUR_GITLAB_TOKEN_HERE") {
      headers["PRIVATE-TOKEN"] = GITLAB_TOKEN;
    }
    if (!binary && !useGitLabToken) headers["Accept"] = "application/vnd.github.v3+json";
    https.get(url, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location, binary, useGitLabToken).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

// ============================================================
// Remote mods
// ============================================================
async function fetchRemoteModsList() {
  try {
    const url = `https://gitlab.com/api/v4/projects/${GITLAB_PROJECT_PATH}/repository/tree?ref=${GITLAB_BRANCH}&per_page=100`;
    const data = await httpGet(url, false, true);
    const files = JSON.parse(data.toString());
    return files
      .filter((f) => f.name.endsWith(".jar") && f.type === "blob")
      .map((f) => ({
        name: f.name,
        sha: f.id,
        size: f.size,
        download_url: `https://gitlab.com/api/v4/projects/${GITLAB_PROJECT_PATH}/repository/files/${encodeURIComponent(f.name)}/raw?ref=${GITLAB_BRANCH}`
      }));
  } catch (err) {
    console.error("Failed to fetch mods list from GitLab:", err.message);
    return null;
  }
}

async function downloadFile(url, destPath) {
  const isGitLabUrl = url.includes("gitlab.com");
  const data = await httpGet(url, true, isGitLabUrl);
  fs.writeFileSync(destPath, data);
}

async function syncModsFromRemote() {
  const remoteMods = await fetchRemoteModsList();
  if (!remoteMods) return { updated: false, count: 0, error: "Impossible de contacter GitLab." };

  let localHashes = {};
  if (fs.existsSync(modsHashFile)) {
    try { localHashes = JSON.parse(fs.readFileSync(modsHashFile, "utf-8")); } catch {}
  }

  const remoteNames = remoteMods.map((m) => m.name);
  let downloaded = 0;

  for (const mod of remoteMods) {
    const destPath = path.join(modsDir, mod.name);
    if (!fs.existsSync(destPath) || localHashes[mod.name] !== mod.sha) {
      try {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("progress", { type: "mod-sync", value: `Telechargement: ${mod.name}` });
        await downloadFile(mod.download_url, destPath);
        localHashes[mod.name] = mod.sha;
        downloaded++;
      } catch (err) {
        console.error(`Failed to download ${mod.name}:`, err.message);
      }
    }
  }

  // Only delete remote mods that are no longer in the remote list
  // Custom mods in mods-custom/ are never touched
  const localMods = fs.readdirSync(modsDir).filter((f) => f.endsWith(".jar"));
  for (const local of localMods) {
    if (!remoteNames.includes(local)) {
      fs.unlinkSync(path.join(modsDir, local));
      delete localHashes[local];
    }
  }

  fs.writeFileSync(modsHashFile, JSON.stringify(localHashes, null, 2));
  return { updated: downloaded > 0, count: remoteNames.length, downloaded };
}

// ============================================================
// Server list injection (servers.dat)
// ============================================================
function ensureServerInList() {
  try {
    const serversDir = gameDir;
    const serversDat = path.join(serversDir, "servers.dat");

    // servers.dat is NBT, but we can write a simple servers.dat with our server
    // Minecraft also reads server-list from servers.dat, but easiest is to just
    // ensure we auto-connect via GAME_ARGS. We'll also write a servers.json for the UI.
    // For actual servers.dat NBT injection we use a simpler approach:
    // Create a "servers.dat" only if it does not exist, using raw NBT bytes.

    // Instead, let's ensure the server appears by using the simpler approach:
    // We put a file in the game directory that Minecraft reads.
    // Actually the most reliable way is GAME_ARGS which we already do.
    // But let's also ensure it shows in the multiplayer menu.

    // Minimal servers.dat NBT for one server entry
    if (!fs.existsSync(serversDat)) {
      // Compound tag "": { List "servers": [ Compound { String "ip", String "name", Byte "hideAddress" } ] }
      const serverName = "Yapapouaiye Server";
      const serverIp = `${SERVER_IP}:${SERVER_PORT}`;
      const nbt = buildServersNBT(serverName, serverIp);
      fs.writeFileSync(serversDat, nbt);
    }
  } catch (err) {
    console.error("Failed to write servers.dat:", err.message);
  }
}

function buildServersNBT(name, ip) {
  const buffers = [];

  function writeByte(v) { const b = Buffer.alloc(1); b.writeInt8(v); buffers.push(b); }
  function writeShort(v) { const b = Buffer.alloc(2); b.writeInt16BE(v); buffers.push(b); }
  function writeString(s) { const sb = Buffer.from(s, "utf-8"); writeShort(sb.length); buffers.push(sb); }

  // Root compound tag (type 10, name "")
  writeByte(10); writeString("");

  // List tag "servers" (type 9)
  writeByte(9); writeString("servers");
  writeByte(10); // list contains compounds
  const countBuf = Buffer.alloc(4); countBuf.writeInt32BE(1); buffers.push(countBuf);

  // Server entry compound
  writeByte(8); writeString("ip"); writeString(ip);
  writeByte(8); writeString("name"); writeString(name);
  writeByte(1); writeString("hideAddress"); writeByte(0);
  writeByte(0); // end of server compound

  writeByte(0); // end of root compound

  return Buffer.concat(buffers);
}

// ============================================================
// Updates IPC
// ============================================================
ipcMain.handle("get-app-version", () => app.getVersion());

ipcMain.handle("check-for-updates", async () => {
  try {
    // Use checkForUpdates() for manual checks (gives better control over events)
    // checkForUpdatesAndNotify() is only used at startup
    const result = await autoUpdater.checkForUpdates();
    const latestVersion = result?.updateInfo?.version || null;
    const currentVersion = app.getVersion();
    
    console.log(`[UpdateCheck] Current: ${currentVersion}, Latest: ${latestVersion}`);
    
    // Use semver comparison for accurate version checking
    const semver = require("semver");
    const updateAvailable = latestVersion && semver.valid(latestVersion) 
      ? semver.gt(latestVersion, currentVersion) 
      : latestVersion !== currentVersion;
    
    return {
      success: true,
      version: latestVersion,
      updateAvailable: updateAvailable
    };
  } catch (err) {
    console.error("[AutoUpdater] Manual check failed:", err.message);

    // Handle "No files provided" error gracefully
    let errorMsg = err.message;
    if (errorMsg.includes("No files provided")) {
      errorMsg = "Mise a jour disponible mais aucun fichier d'installation n'a ete uploadé. Contactez l'administrateur.";
    }

    return { success: false, error: errorMsg };
  }
});

// ============================================================
// Window controls
// ============================================================
ipcMain.on("minimize", () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize(); });
ipcMain.on("maximize", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on("close", () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close(); });

// ============================================================
// Config IPC
// ============================================================
ipcMain.handle("get-system-ram", () => Math.floor(os.totalmem() / (1024 * 1024 * 1024)));
ipcMain.handle("get-config", () => loadConfig());
ipcMain.handle("save-config", (_, config) => { saveConfig(config); return { success: true }; });
ipcMain.handle("select-java-path", async () => {
  const { dialog } = require("electron");
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Selectionner l'executable Java",
    properties: ["openFile"],
    filters: [
      { name: "Executables", extensions: ["exe"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return { success: true, path: result.filePaths[0] };
  }
  return { success: false };
});

// ============================================================
// Authentication (multi-account)
// ============================================================
// minecraft-java-core v4.x sets meta.type to "Xbox" (not "microsoft")
function isMicrosoftAccount(account) {
  const t = account?.meta?.type?.toLowerCase();
  return t === "microsoft" || t === "xbox" || !!account?.refresh_token;
}
ipcMain.handle("auth-microsoft", async () => {
  try {
    const microsoft = new Microsoft();
    const account = await microsoft.getAuth();

    // Check if auth was cancelled or failed
    if (!account || account.error) {
      const msg = account?.message || "Authentification annulee";
      return { success: false, error: msg };
    }

    authAccount = account;

    // Ensure meta.type is set
    if (!account.meta) account.meta = {};
    if (!account.meta.type) account.meta.type = "microsoft";

    // Save to accounts list
    const data = loadAccounts();
    const existingIdx = data.accounts.findIndex((a) => a.uuid === account.uuid);
    if (existingIdx >= 0) {
      data.accounts[existingIdx] = account;
      data.activeIndex = existingIdx;
    } else {
      data.accounts.push(account);
      data.activeIndex = data.accounts.length - 1;
    }
    saveAccounts(data);

    return { success: true, username: account.name, uuid: account.uuid };
  } catch (error) {
    console.error("Microsoft auth error:", error);
    const errorMsg = error?.message || error?.toString() || "Erreur d'authentification";
    // User-friendly message for cancelled auth
    if (errorMsg.includes("cancel") || errorMsg.includes("annul") || errorMsg.includes("close") || errorMsg.includes("ferm")) {
      return { success: false, error: "Connexion annulee" };
    }
    return { success: false, error: errorMsg };
  }
});

ipcMain.handle("auth-offline", async (_, username) => {
  if (!username || username.trim().length < 3) {
    return { success: false, error: "Le pseudo doit faire au moins 3 caracteres." };
  }

  const crypto = require("crypto");
  const hash = crypto.createHash("md5").update("OfflinePlayer:" + username.trim()).digest("hex");
  const uuid = [
    hash.substring(0, 8), hash.substring(8, 12),
    "3" + hash.substring(13, 16), hash.substring(16, 20), hash.substring(20, 32),
  ].join("-");

  authAccount = {
    access_token: uuid, client_token: uuid, uuid: uuid,
    name: username.trim(), user_properties: "{}",
    meta: { type: "offline", demo: false },
  };

  const data = loadAccounts();
  const existingIdx = data.accounts.findIndex((a) => a.uuid === uuid);
  if (existingIdx >= 0) {
    data.accounts[existingIdx] = authAccount;
    data.activeIndex = existingIdx;
  } else {
    data.accounts.push(authAccount);
    data.activeIndex = data.accounts.length - 1;
  }
  saveAccounts(data);

  return { success: true, username: username.trim(), uuid };
});

// Try to restore saved session on startup
ipcMain.handle("auto-login", async () => {
  const data = loadAccounts();

  // If there's an active account, try to restore it
  if (data.activeIndex >= 0 && data.accounts[data.activeIndex]) {
    const saved = data.accounts[data.activeIndex];

    // Normalize legacy accounts without meta
    // For Microsoft/Xbox accounts, try to refresh
    if (isMicrosoftAccount(saved)) {
      try {
        const microsoft = new Microsoft();
        const refreshed = await microsoft.refresh(saved);
        if (!refreshed.error) {
          // Preserve meta.type on refreshed account
          if (!refreshed.meta) refreshed.meta = {};
          if (!refreshed.meta.type) refreshed.meta.type = "microsoft";
          authAccount = refreshed;
          data.accounts[data.activeIndex] = refreshed;
          saveAccounts(data);
          return { success: true, username: refreshed.name, uuid: refreshed.uuid };
        }
      } catch {}

      // Refresh failed — token is expired, force re-authentication
      // Do NOT use expired token: it causes "Session non valide" on online servers
      console.warn("[AutoLogin] Microsoft token refresh failed for", saved.name, "— re-auth required");
      return { success: false, error: "Session expiree, reconnecte-toi via Microsoft." };
    }

    // For offline accounts, just restore
    if (!isMicrosoftAccount(saved) && saved.name && saved.uuid) {
      authAccount = saved;
      saveAccounts(data);
      return { success: true, username: saved.name, uuid: saved.uuid };
    }
  }

  // If no active account but there are saved accounts, try the last Microsoft account with a refresh_token
  if (data.accounts.length > 0) {
    for (let i = 0; i < data.accounts.length; i++) {
      const saved = data.accounts[i];
      if (isMicrosoftAccount(saved)) {
        try {
          const microsoft = new Microsoft();
          const refreshed = await microsoft.refresh(saved);
          if (!refreshed.error) {
            if (!refreshed.meta) refreshed.meta = {};
            if (!refreshed.meta.type) refreshed.meta.type = "microsoft";
            authAccount = refreshed;
            data.accounts[i] = refreshed;
            data.activeIndex = i;
            saveAccounts(data);
            return { success: true, username: refreshed.name, uuid: refreshed.uuid };
          }
        } catch {}

        // Refresh failed — skip this account, token is expired
        console.warn("[AutoLogin] Microsoft token refresh failed for", saved.name, "— skipping");
        continue;
      }
    }

    // Try offline accounts
    for (let i = 0; i < data.accounts.length; i++) {
      const saved = data.accounts[i];
      if (saved.name && saved.uuid) {
        authAccount = saved;
        data.activeIndex = i;
        saveAccounts(data);
        return { success: true, username: saved.name, uuid: saved.uuid };
      }
    }
  }

  return { success: false };
});

// Get all saved accounts
ipcMain.handle("get-accounts", () => {
  const data = loadAccounts();
  return {
    accounts: data.accounts.map((a, i) => ({
      name: a.name,
      uuid: a.uuid,
      type: isMicrosoftAccount(a) ? "microsoft" : "offline",
      active: i === data.activeIndex,
    })),
    activeIndex: data.activeIndex,
  };
});

// Switch to a different saved account
ipcMain.handle("switch-account", async (_, index) => {
  const data = loadAccounts();
  if (index < 0 || index >= data.accounts.length) return { success: false };

  const account = data.accounts[index];

  // Normalize legacy accounts without meta
  if (isMicrosoftAccount(account)) {
    try {
      const microsoft = new Microsoft();
      const refreshed = await microsoft.refresh(account);
      if (!refreshed.error) {
        // Preserve meta.type on refreshed account
        if (!refreshed.meta) refreshed.meta = {};
        if (!refreshed.meta.type) refreshed.meta.type = "microsoft";
        authAccount = refreshed;
        data.accounts[index] = refreshed;
        data.activeIndex = index;
        saveAccounts(data);
        return { success: true, username: refreshed.name, uuid: refreshed.uuid };
      }
    } catch {}

    // Refresh failed — do NOT use expired token
    return { success: false, error: "Session expiree, reconnecte-toi via Microsoft." };
  }

  if (!isMicrosoftAccount(account) && account.name && account.uuid) {
    authAccount = account;
    data.activeIndex = index;
    saveAccounts(data);
    return { success: true, username: account.name, uuid: account.uuid };
  }

  return { success: false, error: "Session expiree, reconnecte-toi." };
});

// Remove account
ipcMain.handle("remove-account", async (_, index) => {
  const data = loadAccounts();
  if (index < 0 || index >= data.accounts.length) return { success: false };

  const wasActive = data.activeIndex === index;
  data.accounts.splice(index, 1);

  if (data.accounts.length === 0) {
    // No more accounts
    data.activeIndex = -1;
    authAccount = null;
  } else if (wasActive) {
    // Active account was removed: switch to last account in list
    data.activeIndex = data.accounts.length - 1;
    authAccount = data.accounts[data.activeIndex];
  } else if (data.activeIndex > index) {
    // Active account shifted down by one
    data.activeIndex -= 1;
    authAccount = data.accounts[data.activeIndex];
  }
  // else: active account index is before removed one, nothing changes

  saveAccounts(data);
  return {
    success: true,
    activeIndex: data.activeIndex,
    activeAccount: data.activeIndex >= 0 ? { name: authAccount.name, uuid: authAccount.uuid } : null,
  };
});

ipcMain.handle("auth-logout", async () => {
  authAccount = null;
  const data = loadAccounts();
  data.activeIndex = -1;
  saveAccounts(data);
  return { success: true };
});

// ============================================================
// Launch Minecraft
// ============================================================
ipcMain.handle("launch-game", async (_, options) => {
  if (!authAccount) return { success: false, error: "Non connecte." };

  try {
    const { version, loader, ram } = options;
    const launcher = new Launch();

    // Save RAM to config
    saveConfig({ ram });

    // Force refresh Microsoft token before launch to avoid "Session non valide"
    if (isMicrosoftAccount(authAccount)) {
      console.log("[Launch] Refreshing Microsoft token before launch...");
      try {
        const microsoft = new Microsoft();
        const refreshed = await microsoft.refresh(authAccount);
        if (refreshed && !refreshed.error) {
          if (!refreshed.meta) refreshed.meta = {};
          if (!refreshed.meta.type) refreshed.meta.type = "microsoft";
          authAccount = refreshed;
          // Save refreshed token
          const data = loadAccounts();
          if (data.activeIndex >= 0) {
            data.accounts[data.activeIndex] = refreshed;
            saveAccounts(data);
          }
          console.log("[Launch] Microsoft token refreshed successfully");
        } else {
          console.error("[Launch] Token refresh returned error, session may be invalid");
          return { success: false, error: "Session expiree. Reconnecte-toi via Microsoft." };
        }
      } catch (refreshErr) {
        console.error("[Launch] Token refresh failed:", refreshErr.message);
        return { success: false, error: "Session expiree. Reconnecte-toi via Microsoft." };
      }
    }

    // Ensure server is in multiplayer list
    ensureServerInList();

    // Load full config for user settings
    const config = loadConfig();

    // Apply resolution from config
    const resolution = config.resolution || "1280x720";
    const [screenW, screenH] = resolution.split("x").map(Number);

    const launchConfig = {
      authenticator: authAccount,
      path: gameDir,
      version: version || "latest_release",
      memory: { max: `${ram || 4}G`, min: "1G" },
      screen: { width: screenW || 1280, height: screenH || 720, fullscreen: config.fullscreen || false },
      java: config.javaPath ? { path: config.javaPath } : { type: "jre" },
      GAME_ARGS: ["--quickPlayMultiplayer", `${SERVER_IP}:${SERVER_PORT}`],
    };

    if (config.jvmArgs) {
      launchConfig.JVM_ARGS = config.jvmArgs.split(" ").filter(Boolean);
    }

    if (loader && loader !== "vanilla") {
      launchConfig.loader = { type: loader, build: "latest", enable: true };
    }

    const send = (ch, d) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(ch, d); };
    launcher.on("extract", (extract) => send("progress", { type: "extract", value: extract }));
    launcher.on("progress", (progress) => send("progress", { type: "download", value: Math.round(progress) }));
    launcher.on("speed", (speed) => send("progress", { type: "speed", value: speed }));
    launcher.on("estimated", (time) => send("progress", { type: "estimated", value: time }));
    launcher.on("patch", (patch) => send("progress", { type: "patch", value: patch }));
    launcher.on("data", (data) => send("game-log", data));
    launcher.on("close", () => send("game-closed", 0));
    launcher.on("error", (err) => send("game-error", err.message || String(err)));

    await launcher.Launch(launchConfig);

    if (config.closeOnLaunch && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }

    return { success: true };
  } catch (error) {
    console.error("Launch error:", error);
    return { success: false, error: error.message };
  }
});

// ============================================================
// Mods
// ============================================================
ipcMain.handle("get-mods", async () => {
  try {
    const remoteMods = fs.existsSync(modsDir)
      ? fs.readdirSync(modsDir).filter((f) => f.endsWith(".jar"))
      : [];
    const customMods = fs.existsSync(customModsDir)
      ? fs.readdirSync(customModsDir).filter((f) => f.endsWith(".jar"))
      : [];
    return { success: true, mods: remoteMods, customMods };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("get-launcher-dir", () => ({ modsDir, gameDir, launcherDir, customModsDir }));

ipcMain.handle("sync-mods", async () => {
  try {
    const result = await syncModsFromRemote();
    const gameModsDir = path.join(gameDir, "mods");
    if (!fs.existsSync(gameModsDir)) fs.mkdirSync(gameModsDir, { recursive: true });

    // Clear existing mods in game directory
    for (const old of fs.readdirSync(gameModsDir).filter((f) => f.endsWith(".jar"))) {
      fs.unlinkSync(path.join(gameModsDir, old));
    }

    // Copy remote mods
    const remoteMods = fs.readdirSync(modsDir).filter((f) => f.endsWith(".jar"));
    for (const mod of remoteMods) {
      fs.copyFileSync(path.join(modsDir, mod), path.join(gameModsDir, mod));
    }

    // Copy custom mods (user-added mods that persist)
    const customMods = fs.existsSync(customModsDir)
      ? fs.readdirSync(customModsDir).filter((f) => f.endsWith(".jar"))
      : [];
    for (const mod of customMods) {
      fs.copyFileSync(path.join(customModsDir, mod), path.join(gameModsDir, mod));
    }

    const totalMods = remoteMods.length + customMods.length;
    return { success: true, count: totalMods, downloaded: result.downloaded || 0, custom: customMods.length };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("open-custom-mods", async () => {
  try {
    if (!fs.existsSync(customModsDir)) fs.mkdirSync(customModsDir, { recursive: true });
    shell.openPath(customModsDir);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
