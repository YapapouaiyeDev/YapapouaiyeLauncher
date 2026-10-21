const { app, BrowserWindow, ipcMain, shell, session } = require("electron");
const path = require("path");
const os = require("os");
const net = require("net");
const http = require("http");
const { Microsoft } = require("minecraft-java-core");
const { NetworkSessions } = require("./network-sessions");
const { ManagedLaunch } = require("./managed-launch");
const { skinForAccount } = require("./account-avatars");
const { GameSessions, accountKey, prepareAccountInstance } = require("./game-sessions");
const { autoUpdater } = require("electron-updater");
const { LauncherUpdateProvider, installRequestedUpdate, normalizeVersion } = require("./launcher-update-provider");
let requestedUpdateVersion = null;
const fs = require("fs");
const https = require("https");
const { createInvitationGate } = require("./invitations");
const { readClientOptions } = require("./client-options");
const { getServerLaunchArgs } = require("./server-launch-args");

// Load environment variables from .env file
try {
  require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
} catch {}

// Single Instance Lock: prevent multiple launcher instances from corrupting files on startup
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log("[SingleInstance] Another instance is already running. Quitting.");
  app.quit();
}

// Chromium GPU & DWM stability flags for Windows boot resilience & ultra-low latency rendering
if (process.platform === "win32") {
  app.commandLine.appendSwitch("disable-gpu-process-crash-limit");
  app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
  app.commandLine.appendSwitch("enable-gpu-rasterization");
  app.commandLine.appendSwitch("enable-zero-copy");
  app.commandLine.appendSwitch("enable-accelerated-2d-canvas");
  app.commandLine.appendSwitch("enable-native-gpu-memory-buffers");
  app.commandLine.appendSwitch("ignore-gpu-blocklist");
}

// Persistent logging for troubleshooting
function logToFile(level, message, error) {
  try {
    const logDir = path.join(app.getPath("appData"), ".yapapouaiye-launcher");
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, "launcher.log");
    const timestamp = new Date().toISOString();
    const errStr = error ? (error.stack || error.message || String(error)) : "";
    const logLine = `[${timestamp}] [${level}] ${message} ${errStr}\n`;
    fs.appendFileSync(logPath, logLine, "utf8");
  } catch {}
}

// Global exception and rejection handlers to prevent abrupt process exits
process.on("uncaughtException", (error) => {
  console.error("[Process] Uncaught Exception:", error);
  logToFile("FATAL", "Uncaught Exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[Process] Unhandled Rejection at:", promise, "reason:", reason);
  logToFile("ERROR", "Unhandled Rejection:", reason);
});

app.on("child-process-gone", (event, details) => {
  console.warn(`[App] Child process gone: type=${details.type}, reason=${details.reason}, exitCode=${details.exitCode}`);
  logToFile("WARN", `Child process gone: type=${details.type}, reason=${details.reason}, exitCode=${details.exitCode}`);
});

app.on("second-instance", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// Safe IPC sender helper
function sendToRenderer(channel, data) {
  try {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send(channel, data);
    }
  } catch (err) {
    console.warn(`[IPC] Failed to send message to renderer on channel ${channel}:`, err.message);
  }
}

// ============================================================
// CONFIGURATION
// ============================================================
// Mods repository on Gitea
const GITEA_URL = process.env.GITEA_URL || "https://gitea.com";
const GITEA_OWNER = process.env.GITEA_OWNER || "hannyvan26";
const GITEA_REPO = process.env.GITEA_REPO || "ModYapapouaiyeLauncher";
const GITEA_BRANCH = process.env.GITEA_BRANCH || "main";
const GITEA_TOKEN = process.env.GITEA_TOKEN || "bd0fc8ad1e0401eae6ed84137a4ab221e387f398";
// Launcher auto-updates are configured in package.json "build.publish" section
// GitHub token (GH_TOKEN) is automatically used by electron-updater from env
const GITHUB_OWNER_LAUNCHER = "YapapouaiyeDev";
const GITHUB_REPO_LAUNCHER = "YapapouaiyeLauncher";

// ============================================================
// SERVERS CONFIGURATION
// ============================================================
const SERVERS = [
  {
    id: "adoserv2",
    name: "AdoServ II",
    shortName: "AdoServ II",
    host: "158.178.200.70",
    pingPort: 25565,
    gamePort: 25565,
    displayIp: "158.178.200.70:25565",
    apiType: "gizmo",
    apiUrl: "https://cloud.gizmopowered.net",
    apiServerId: "adoserv2",
    activationUrl: "https://gimzonodes.space",
    defaultLoader: "neoforge",
    modsRepo: { owner: "hannyvan26", repo: "AdoServ-2", branch: "main" },
    badgeTag: "âš¡ GIZMONODES â€¢ 1.21.1",
    description: "Nouveau serveur AdoServ II (Gizmo API)",
  },
  {
    id: "adoserv1",
    name: "YapapouaiyeSMP",
    shortName: "YapapouaiyeSMP",
    host: "yapapouaiyelive.falixsrv.me",
    pingPort: 22924,
    gamePort: 25565,
    displayIp: "yapapouaiyelive.falixsrv.me:25565",
    apiType: "falix",
    defaultLoader: "fabric",
    modsRepo: { owner: "hannyvan26", repo: "ModYapapouaiyeLauncher", branch: "main" },
    badgeTag: "âš¡ FALIXNODES â€¢ 1.21.1",
    description: "Serveur Yapapouaiye original (FalixNodes)",
  },
  {
    id: "adoserv67",
    name: "AdoServ67",
    shortName: "AdoServ67",
    host: "91.197.6.19",
    pingPort: 22583,
    gamePort: 22583,
    displayIp: "91.197.6.19:22583",
    apiType: "falix",
    falixServerId: process.env.FALIX_SERVER_ID_ADOSERV67 || null,
    defaultLoader: "neoforge",
    gameVersion: "1.21.1",
    // Mods hébergés sur Backblaze B2 (S3, bucket privé, requêtes signées). PAS Gitea, PAS Scaleway.
    modsSource: {
      type: "b2",
      endpoint: process.env.B2_ENDPOINT || "https://s3.eu-central-003.backblazeb2.com",
      region: process.env.B2_REGION || "eu-central-003",
      bucket: process.env.B2_BUCKET || "adoserv67",
      prefix: process.env.B2_MODS_PREFIX || "",
      accessKey: process.env.B2_KEY_ID || "0037d97c4a6b9440000000001",
      secretKey: process.env.B2_APP_KEY || "K003EUdKUJNstI0k9WSA4+bU+1ItRMc",
    },
    badgeTag: "⚡ FALIXNODES • 1.21.1",
    description: "Nouveau serveur AdoServ67 (FalixNodes)",
  },
];

function getServerById(id) {
  const all = getAllServers();
  return all.find((s) => s.id === id) || SERVERS.find((s) => s.id === id) || all[0] || SERVERS[0];
}

// ============================================================
// REMOTE SERVERS + MAINTENANCE (pilotés depuis l'espace admin du site)
// - GET {base}/api/servers -> [{ id, name, ..., codesRequired, codesCount, enabled, sortOrder }] (SANS codes)
// - GET {base}/api/launcher-config -> { maintenance, message }
// - POST {base}/api/server-verify { serverId, codes } -> { valid }
// Fusion par id au-dessus de SERVERS : seuls les champs publics sont
// repris, les secrets locaux (modsSource B2, etc.) sont TOUJOURS conservés.
// ============================================================
const REMOTE_PUBLIC_SERVER_FIELDS = [
  "name", "shortName", "host", "pingPort", "gamePort", "displayIp",
  "gameVersion", "defaultLoader", "badgeTag", "description",
  "apiType", "apiUrl", "apiServerId", "activationUrl",
  "modsRepoOwner", "modsRepoRepo", "modsRepoBranch",
  "codesRequired", "codesCount", "enabled", "sortOrder",
];

let remoteServersCache = [];
let remoteLauncherConfig = { maintenance: false, message: "" };
let remoteStateLoaded = false;
let remoteStateFetchedAt = 0;
const sessionVerifiedServers = new Set();

function remoteStateFile() {
  try {
    return path.join(launcherDir, "remote-launcher-state.json");
  } catch {
    return null;
  }
}

function loadRemoteStateCache() {
  if (remoteStateLoaded) return;
  remoteStateLoaded = true;
  try {
    const file = remoteStateFile();
    if (file && fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
      if (Array.isArray(parsed.servers)) remoteServersCache = parsed.servers;
      if (parsed.maintenance !== undefined || parsed.message !== undefined) {
        remoteLauncherConfig = {
          maintenance: Boolean(parsed.maintenance),
          message: String(parsed.message || ""),
        };
      }
      if (parsed.fetchedAt) remoteStateFetchedAt = parsed.fetchedAt;
    }
  } catch (err) {
    console.warn("[RemoteServers] Cache illisible, repli local:", err.message);
  }
}

function saveRemoteStateCache() {
  try {
    const file = remoteStateFile();
    if (!file) return;
    if (!fs.existsSync(launcherDir)) fs.mkdirSync(launcherDir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({
      servers: remoteServersCache,
      maintenance: remoteLauncherConfig.maintenance,
      message: remoteLauncherConfig.message,
      fetchedAt: remoteStateFetchedAt,
    }, null, 2), "utf-8");
    fs.renameSync(tmp, file);
  } catch (err) {
    console.warn("[RemoteServers] Échec écriture cache:", err.message);
  }
}

function siteApiBases() {
  return [
    process.env.LAUNCHER_SITE_API,
    "http://127.0.0.1:8789",
    "https://yapapouaiye-launcher.pages.dev",
  ].filter(Boolean);
}

function siteEndpointCandidates(envFullUrl, apiPath) {
  if (envFullUrl) return [envFullUrl];
  return siteApiBases().map((base) => `${String(base).replace(/\/+$/, "")}${apiPath}`);
}

function serversApiCandidates() {
  return siteEndpointCandidates(process.env.SERVERS_API_URL, "/api/servers");
}

function launcherConfigApiCandidates() {
  return siteEndpointCandidates(process.env.LAUNCHER_CONFIG_API_URL, "/api/launcher-config");
}

function serverVerifyApiCandidates() {
  return siteEndpointCandidates(process.env.SERVER_VERIFY_API_URL, "/api/server-verify");
}

async function fetchRemoteJson(url) {
  const raw = (await httpGet(url, false, false)).toString("utf-8");
  return JSON.parse(raw);
}

function httpPostJson(url, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload || {});
    const client = url.startsWith("http://") ? http : https;
    const req = client.request(url, {
      method: "POST",
      headers: {
        "User-Agent": `YapapouaiyeLauncher/${app.getVersion()}`,
        "Content-Type": "application/json; charset=utf-8",
        "Accept": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "Cache-Control": "no-cache",
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpPostJson(res.headers.location, payload).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")));
        } catch (e) {
          reject(new Error(`Réponse JSON invalide de ${url}`));
        }
      });
      res.on("error", reject);
    });
    req.setTimeout(8000, () => req.destroy(new Error(`Timeout POST après 8s pour ${url}`)));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function pickRemoteServerFields(remote) {
  const out = {};
  for (const key of REMOTE_PUBLIC_SERVER_FIELDS) {
    if (remote[key] !== undefined) out[key] = remote[key];
  }
  return out;
}

function buildModsRepoFromRemote(remote) {
  const owner = String(remote.modsRepoOwner || "").trim();
  const repo = String(remote.modsRepoRepo || "").trim();
  if (!owner || !repo) return null;
  return { owner, repo, branch: String(remote.modsRepoBranch || "main").trim() || "main" };
}

/**
 * Liste fusionnée : base locale SERVERS + surcharge distante par id.
 * Les serveurs distants désactivés sont exclus (sauf recherche directe par id).
 */
function getAllServers({ includeDisabled = false } = {}) {
  loadRemoteStateCache();
  const byId = new Map();
  SERVERS.forEach((s, idx) => {
    byId.set(s.id, { ...s, sortOrder: s.sortOrder ?? idx, enabled: s.enabled !== false });
  });
  for (const remote of remoteServersCache) {
    if (!remote || !remote.id) continue;
    const picked = pickRemoteServerFields(remote);
    const local = byId.get(remote.id);
    if (local) {
      const merged = { ...local, ...picked };
      const modsRepo = buildModsRepoFromRemote(remote);
      if (modsRepo) merged.modsRepo = modsRepo;
      byId.set(remote.id, merged);
    } else {
      const created = {
        id: String(remote.id),
        name: picked.name || String(remote.id),
        shortName: picked.shortName || picked.name || String(remote.id),
        host: picked.host || "",
        pingPort: picked.pingPort || 25565,
        gamePort: picked.gamePort || 25565,
        displayIp: picked.displayIp || (picked.host ? `${picked.host}:${picked.gamePort || 25565}` : ""),
        defaultLoader: picked.defaultLoader || "neoforge",
        badgeTag: picked.badgeTag || "",
        description: picked.description || "",
        codesRequired: Boolean(picked.codesRequired),
        codesCount: Number(picked.codesCount) || 0,
        enabled: picked.enabled !== false,
        sortOrder: Number(picked.sortOrder) || 0,
      };
      const modsRepo = buildModsRepoFromRemote(remote);
      if (modsRepo) created.modsRepo = modsRepo;
      if (picked.gameVersion) created.gameVersion = picked.gameVersion;
      byId.set(created.id, created);
    }
  }
  let list = Array.from(byId.values());
  if (!includeDisabled) list = list.filter((s) => s.enabled !== false);
  list.sort((a, b) => ((a.sortOrder ?? 0) - (b.sortOrder ?? 0)) || String(a.id).localeCompare(String(b.id)));
  return list;
}

function getRemoteServerById(id) {
  if (!id) return null;
  return getAllServers({ includeDisabled: true }).find((s) => s.id === id) || null;
}

function getMaintenanceState() {
  loadRemoteStateCache();
  return { ...remoteLauncherConfig };
}

/**
 * Rafraîchit serveurs + maintenance depuis le site (1er endpoint OK gagne).
 * En cas d'échec total, le cache local (ou les valeurs codées en dur) est conservé.
 */
async function refreshRemoteLauncherState() {
  loadRemoteStateCache();
  let serversOk = false;
  const serversFailures = [];
  for (const url of serversApiCandidates()) {
    try {
      const parsed = await fetchRemoteJson(`${url}${url.includes("?") ? "&" : "?"}_t=${Date.now()}`);
      if (parsed?.ok === false || !Array.isArray(parsed?.servers)) throw new Error("Liste de serveurs invalide.");
      const list = parsed.servers;
      remoteServersCache = list.filter((s) => s && s.id).map((s) => ({ ...pickRemoteServerFields(s), id: String(s.id) }));
      serversOk = true;
      break;
    } catch (err) {
      serversFailures.push(`${url}: ${err.message}`);
    }
  }
  let configOk = false;
  const configFailures = [];
  for (const url of launcherConfigApiCandidates()) {
    try {
      const parsed = await fetchRemoteJson(`${url}${url.includes("?") ? "&" : "?"}_t=${Date.now()}`);
      if (parsed?.ok !== false && typeof parsed?.maintenance === "boolean" && typeof parsed?.message === "string") {
        remoteLauncherConfig = {
          maintenance: Boolean(parsed.maintenance),
          message: String(parsed.message || ""),
        };
        configOk = true;
        break;
      }
      throw new Error("Configuration du launcher invalide.");
    } catch (err) {
      configFailures.push(`${url}: ${err.message}`);
    }
  }
  if (!serversOk) console.warn("[RemoteServers] Aucun endpoint serveurs disponible ; cache conservé.", serversFailures.join(" | "));
  if (!configOk) console.warn("[RemoteServers] Aucune configuration distante disponible ; cache conservé.", configFailures.join(" | "));
  if (serversOk || configOk) {
    remoteStateFetchedAt = Date.now();
    saveRemoteStateCache();
  }
  return { serversOk, configOk };
}

/**
 * État maintenance FRAIS avant chaque lancement (kill-switch admin quasi immédiat).
 * Repli sur le cache si le réseau échoue.
 */
async function getFreshMaintenanceState() {
  for (const url of launcherConfigApiCandidates()) {
    try {
      const parsed = await fetchRemoteJson(`${url}${url.includes("?") ? "&" : "?"}_t=${Date.now()}`);
      if (parsed?.ok !== false && typeof parsed?.maintenance === "boolean" && typeof parsed?.message === "string") {
        remoteLauncherConfig = {
          maintenance: Boolean(parsed.maintenance),
          message: String(parsed.message || ""),
        };
        remoteStateFetchedAt = Date.now();
        saveRemoteStateCache();
        return { ...remoteLauncherConfig };
      }
    } catch {}
  }
  return getMaintenanceState();
}

// ============================================================
// Live refresh : pousse serveurs + maintenance au renderer dès
// que l'espace admin change quelque chose (sondage 5s).
// Le renderer applique sans redémarrage : onglets re-rendus,
// bandeau maintenance, blocage JOUER/Mods.
// ============================================================
const REMOTE_STATE_POLL_MS = 5000;
let remoteStateSignature = "";
let remoteRefreshInFlight = null;
let remoteWatcherStarted = false;

function computeRemoteStateSignature() {
  try {
    return JSON.stringify({ s: remoteServersCache, m: remoteLauncherConfig });
  } catch {
    return "";
  }
}

function buildRemoteStatePayload() {
  const all = getAllServers();
  const active = getActiveServer();
  return {
    type: "remote-state",
    servers: all.map((s) => ({ ...s, gameVersion: getServerGameVersion(s) })),
    activeServerId: active.id,
    activeServer: { ...active, gameVersion: getServerGameVersion(active) },
    launcherConfig: getMaintenanceState(),
  };
}

async function pollRemoteStateOnce() {
  if (remoteRefreshInFlight) return remoteRefreshInFlight;
  remoteRefreshInFlight = (async () => {
    let result = { serversOk: false, configOk: false };
    try {
      result = await refreshRemoteLauncherState();
    } catch {}
    const payload = buildRemoteStatePayload();
    const sig = computeRemoteStateSignature();
    if (sig && sig !== remoteStateSignature) {
      remoteStateSignature = sig;
      sendToRenderer("remote-state", payload);
      console.log("[RemoteState] Changement détecté, poussé au renderer.");
    }
    return { ...payload, ...result };
  })();
  try {
    return await remoteRefreshInFlight;
  } finally {
    remoteRefreshInFlight = null;
  }
}

function startRemoteStateWatcher() {
  if (remoteWatcherStarted) return;
  remoteWatcherStarted = true;
  remoteStateSignature = computeRemoteStateSignature();
  const timer = setInterval(() => {
    pollRemoteStateOnce().catch(() => {});
  }, REMOTE_STATE_POLL_MS);
  if (timer && typeof timer.unref === "function") timer.unref();
}

// Per-server Minecraft version (fallback: global default 1.21.1)
function getServerGameVersion(targetServer) {
  const server = targetServer || getActiveServer();
  return server?.gameVersion || "1.21.1";
}

function getActiveServer() {
  const config = loadConfig();
  const wanted = config.activeServerId || "adoserv2";
  const enabled = getAllServers();
  const match = enabled.find((s) => s.id === wanted);
  if (match) return match;
  // Le serveur actif a été désactivé/supprimé par l'admin : repli propre.
  const fallback = enabled[0] || SERVERS[0];
  if (fallback && fallback.id !== wanted) {
    try { saveConfig({ activeServerId: fallback.id }); } catch {}
  }
  return fallback;
}

// Gitea mods repo for a given server (fallbacks: per-server env override -> server config -> global)
function getModsRepo(targetServer) {
  const server = targetServer || getActiveServer();
  const cfg = server?.modsRepo || {};
  const idEnv = server.id.toUpperCase().replace(/-/g, "_");
  return {
    owner: process.env[`GITEA_OWNER_${idEnv}`] || cfg.owner || GITEA_OWNER,
    repo: process.env[`GITEA_REPO_${idEnv}`] || cfg.repo || GITEA_REPO,
    branch: process.env[`GITEA_BRANCH_${idEnv}`] || cfg.branch || GITEA_BRANCH,
  };
}

// Valid mod loaders supported by the launcher
const VALID_LOADERS = ["neoforge", "fabric"];

// Normalizes a loader string ("neoforge" | "fabric"), defaults to the
// server's configured default loader or "neoforge".
function normalizeLoader(loader, targetServer) {
  if (VALID_LOADERS.includes(loader)) return loader;
  const serverDefault = targetServer?.defaultLoader || targetServer?.loader;
  return VALID_LOADERS.includes(serverDefault) ? serverDefault : "neoforge";
}

function getModsHashFile(serverId) {
  return path.join(launcherDir, `mods-hash-${serverId || "default"}.json`);
}

const rootPath = app.getPath("appData");
const launcherDir = path.join(rootPath, ".yapapouaiye-launcher");
const invitationGate = createInvitationGate({
  directory: launcherDir,
  verifyRemote: (payload) => {
    const base = process.env.LAUNCHER_SITE_API || "https://yapapouaiye-launcher.pages.dev";
    // Invitation validation has one authority; never try a second server after rejection.
    return fetch(`${base.replace(/\/+$/, "")}/api/invitation-verify`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    }).then(response => {
      if (!response.ok) throw new Error("Validation des invitations indisponible.");
      return response.json();
    });
  },
});
const gameDir = path.join(launcherDir, "minecraft");
const modsDir = path.join(gameDir, "mods");
const customModsDir = path.join(launcherDir, "mods-custom");
const accountsFile = path.join(launcherDir, "accounts.json");
const configFile = path.join(launcherDir, "config.json");
const modsHashFile = path.join(launcherDir, "mods-hash.json");

function getServerModsDir(serverId) {
  return path.join(launcherDir, "mods", serverId || "default");
}

// Case-insensitive .jar check (Windows users often have .JAR / .Jar)
function isJarFile(fileName) {
  return typeof fileName === "string" && fileName.toLowerCase().endsWith(".jar");
}

function listJarFiles(dir) {
  try {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(isJarFile);
  } catch {
    return [];
  }
}

try {
  if (!fs.existsSync(launcherDir)) fs.mkdirSync(launcherDir, { recursive: true });
  if (!fs.existsSync(gameDir)) fs.mkdirSync(gameDir, { recursive: true });
  if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true });
  if (!fs.existsSync(customModsDir)) fs.mkdirSync(customModsDir, { recursive: true });
} catch (err) {
  console.error("[Init] Error creating runtime directories:", err.message);
  logToFile("ERROR", "Error creating runtime directories:", err);
}

// One-pass migration: mods previously stored under per-loader subfolders
// (mods/{serverId}/{loader}) are flattened back into mods/{serverId}.
// Mods staged in gameDir/mods (very old layout) go to adoserv1.
function migrateLegacyMods() {
  try {
    // 1. Flatten any per-loader subfolder back into the server folder
    for (const server of SERVERS) {
      const serverModsDir = getServerModsDir(server.id);
      fs.mkdirSync(serverModsDir, { recursive: true });
      const existingJars = listJarFiles(serverModsDir);
      const known = new Set(existingJars);
      for (const loader of VALID_LOADERS) {
        const subDir = path.join(serverModsDir, loader);
        if (!fs.existsSync(subDir)) continue;
        for (const f of listJarFiles(subDir)) {
          if (known.has(f)) continue;
          try {
            fs.copyFileSync(path.join(subDir, f), path.join(serverModsDir, f));
            known.add(f);
            console.log(`[Migrate] Mod â†’ ${serverModsDir}/${f}`);
          } catch (err) {
            console.error(`[Migrate] Ã‰chec copie ${f}:`, err.message);
          }
        }
        try { fs.rmSync(subDir, { recursive: true, force: true }); } catch {}
      }
    }

    // 2. Mods staged in gameDir/mods (very old layout) -> adoserv1
    const legacyJars = fs.existsSync(modsDir)
      ? fs.readdirSync(modsDir).filter((f) => f.toLowerCase().endsWith(".jar"))
      : [];
    if (legacyJars.length === 0) return;
    const targetDir = getServerModsDir("adoserv1");
    fs.mkdirSync(targetDir, { recursive: true });
    const existingTargets = fs.readdirSync(targetDir);
    if (existingTargets.some((f) => f.toLowerCase().endsWith(".jar"))) return;
    for (const f of legacyJars) {
      try {
        fs.copyFileSync(path.join(modsDir, f), path.join(targetDir, f));
        console.log(`[Migrate] Mod legacy â†’ ${targetDir}/${f}`);
      } catch (err) {
        console.error(`[Migrate] Ã‰chec copie ${f}:`, err.message);
      }
    }
    // Reset the staging folder so it no longer masks the per-server folders.
    for (const f of legacyJars) {
      try { fs.unlinkSync(path.join(modsDir, f)); } catch {}
    }
  } catch (err) {
    console.error("[Migrate] Erreur migration mods legacy:", err.message);
  }
}
migrateLegacyMods();

let mainWindow;
let overlayWindow;
let splashWindow;
let splashStartedAt = 0;
let authAccount = null;
let gameOptions = { nightVision: false, noFog: false, shaders: false };
const gameSessions = new GameSessions(sessions => sendToRenderer("game-sessions", sessions));
const gameLaunchers = new Map();
const relayProfiles = new Map();
const networkSessions = new NetworkSessions((id, error, wasReady) => {
  if (error) {
    console.warn(`[NetworkSession] ${id}: ${error}`);
    logToFile("NETWORK", `${id}: ${error}`);
  }
  const session = gameSessions.list().find(item => item.id === id);
  const profile = relayProfiles.get(id);
  relayProfiles.delete(id);
  if (profile?.controlFile) { try { fs.unlinkSync(profile.controlFile); } catch {} }
  if (gameLaunchers.has(id)) gameSessions.disconnected(id);
  else gameSessions.finish(id);
  if (session && wasReady && (error || !gameLaunchers.has(id))) sendToRenderer(error ? "game-error" : "game-closed", {
    sessionId: id, accountUuid: session.accountUuid, accountName: session.accountName,
    ...(error ? { error } : {}),
  });
}, (id, status) => {
  gameSessions.relay(id, status);
  if (status.error) {
    console.warn(`[NetworkSession] ${id}: ${status.error}`);
    logToFile("NETWORK", `${id}: ${status.error}`);
    const session = gameSessions.list().find(item => item.id === id);
    sendToRenderer("game-error", { sessionId: id, accountName: session?.accountName, error: status.error });
  }
});

// ============================================================
// Central server status monitor
// Minimal pings to avoid overloading server proxies.
// Idle: badge uses cached status, re-pings only if stale (>90s).
// ============================================================
const CACHE_STALE_MS = 90000; // 90s â€” badge returns cached result if fresher

let serverStatusCache = {}; // keyed by serverId: { online: bool, checkedAt: timestamp }
let serverPingInFlightMap = {}; // keyed by serverId: Promise<boolean>

async function runServerStatusCheck(targetServer) {
  const server = targetServer || getActiveServer();
  const serverId = server.id;

  if (serverPingInFlightMap[serverId]) {
    return serverPingInFlightMap[serverId];
  }

  const promise = (async () => {
    try {
      let online = false;
      if (server.apiType === "gizmo") {
        const gizmoRes = await checkGizmoServerStatus(server);
        online = gizmoRes.online;
      } else {
        online = await pingMinecraftServer(server.host, server.pingPort, 6000);
      }

      serverStatusCache[serverId] = { online, checkedAt: Date.now() };
      return online;
    } finally {
      delete serverPingInFlightMap[serverId];
    }
  })();

  serverPingInFlightMap[serverId] = promise;
  return promise;
}

/** Returns cached status if fresh enough, otherwise pings once. */
async function getServerStatus(targetServer) {
  const server = targetServer || getActiveServer();
  const cached = serverStatusCache[server.id];
  if (cached && Date.now() - cached.checkedAt < CACHE_STALE_MS) {
    return cached.online;
  }
  return runServerStatusCheck(server);
}

// ============================================================
// Config (saves RAM etc.)
// Robuste : un config.json corrompu est sauvegarde en .corrupt-*
// au lieu d'etre ecrase silencieusement. Les champs manquants
// sont completes avec les defauts (jamais de reset global).
// ============================================================
const DEFAULT_CONFIG = {
  ram: 4,
  activeServerId: "adoserv2",
  resolution: "1280x720",
  fullscreen: false,
  javaPath: null,
  jvmArgs: null,
  theme: null,
  customThemes: [],
  themeOverrides: {},
  closeOnLaunch: false,
  minimizeOnLaunch: false,
  language: null,
  keyboardLayout: "azerty",
  onboardingCompleted: false,
  lastSeenVersion: null,
  clientMods: null,
  betaTester: false,
};

function readConfigRaw() {
  try {
    if (!fs.existsSync(configFile)) return { ok: true, value: {}, corrupt: false };
    const raw = fs.readFileSync(configFile, "utf-8");
    if (!raw || !raw.trim()) return { ok: true, value: {}, corrupt: false };
    return { ok: true, value: JSON.parse(raw), corrupt: false };
  } catch (err) {
    // Sauvegarde le fichier corrompu pour diagnostic au lieu de le perdre.
    try {
      const backup = `${configFile}.corrupt-${Date.now()}.bak`;
      fs.copyFileSync(configFile, backup);
      console.error(`[Config] config.json illisible, sauvegarde en ${backup}:`, err.message);
    } catch {}
    return { ok: false, value: {}, corrupt: true };
  }
}

function normalizeClientModsDeep(stored) {
  const out = {};
  for (const [key, def] of Object.entries(DEFAULT_CLIENT_MODS)) {
    if (key === "hudPositions") {
      out.hudPositions = {
        ...def,
        ...(stored && typeof stored.hudPositions === "object" && stored.hudPositions !== null ? stored.hudPositions : {})
      };
    } else {
      const cur = (stored && typeof stored[key] === "object" && stored[key] !== null)
        ? stored[key]
        : (typeof stored?.[key] === "boolean" ? { enabled: stored[key] } : {});
      out[key] = { ...def, ...cur };
    }
  }
  return out;
}

function normalizeConfig(raw) {
  const base = { ...DEFAULT_CONFIG, ...(raw && typeof raw === "object" ? raw : {}) };
  // Types defensifs (evite les crashs si un champ a ete edite a la main).
  if (typeof base.ram !== "number" || !Number.isFinite(base.ram)) base.ram = 4;
  if (typeof base.activeServerId !== "string" || !base.activeServerId) base.activeServerId = "adoserv2";
  if (base.keyboardLayout !== "qwerty" && base.keyboardLayout !== "azerty") base.keyboardLayout = "azerty";
  if (!Array.isArray(base.customThemes)) base.customThemes = [];
  if (!base.themeOverrides || typeof base.themeOverrides !== 'object' || Array.isArray(base.themeOverrides)) base.themeOverrides = {};
  base.clientMods = base.clientMods ? normalizeClientModsDeep(base.clientMods) : null;
  return base;
}

function loadConfig() {
  const { value } = readConfigRaw();
  // Retourne la config brute fusionnee aux defauts SANS ecrire sur disque
  // (l'ecriture se fait uniquement via saveConfig pour ne jamais
  // ecraser les changements locaux a la simple lecture).
  const normalized = normalizeConfig(value);
  // Conserve la forme historique : les champs null/absents restent lus
  // via fallbacks cote appelants, mais ram/activeServerId sont garantis.
  const out = { ...value, ram: normalized.ram, activeServerId: normalized.activeServerId };
  if (normalized.clientMods && !out.clientMods) out.clientMods = normalized.clientMods;
  return out;
}

function loadConfigNormalized() {
  return normalizeConfig(readConfigRaw().value);
}

function saveConfig(config) {
  const { value: existing } = readConfigRaw();
  const merged = { ...(existing && typeof existing === "object" ? existing : {}), ...(config || {}) };
  // Normalise les bornes critiques sans supprimer les cles inconnues
  // (themes custom, reglages futurs : on ne les ecrase jamais).
  if (merged.ram !== undefined && (typeof merged.ram !== "number" || !Number.isFinite(merged.ram))) {
    delete merged.ram;
  }
  try {
    if (!fs.existsSync(launcherDir)) fs.mkdirSync(launcherDir, { recursive: true });
    const tmp = `${configFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(merged, null, 2), "utf-8");
    fs.renameSync(tmp, configFile);
    return true;
  } catch (err) {
    console.error("[Config] Echec ecriture config.json:", err.message);
    return false;
  }
}

// ============================================================
// Verrouillage par mot de passe + "Retenir ce PC" (ID carte mère)
// ------------------------------------------------------------
// - Le mot de passe est exigé avant chaque lancement du jeu.
// - "Retenir ce PC" enregistre une empreinte hashée de la carte
//   mère. Tant que l'empreinte correspond, le jeu se lance sans
//   mot de passe. Si la carte mère change (ou PC différent),
//   l'empreinte ne correspond plus -> mot de passe redemandé,
//   puis nouvelle empreinte enregistrée si "Retenir" recoché.
// - Stockage : launcherDir/launch-lock.json (jamais en clair :
//   PBKDF2-SHA256 120k itérations + sel aléatoire).
// - L'empreinte brute n'est jamais stockée en clair, seul son
//   SHA-256 est conservé.
// ============================================================
const launchLockFile = path.join(launcherDir, "launch-lock.json");
let cachedHwidRaw = null;
let launchUnlockedAt = 0;
const LAUNCH_UNLOCK_VALID_MS = 5 * 60 * 1000; // déverrouillage ponctuel valable 5 min (un lancement)
let launchLockFails = { count: 0, lockUntil: 0 };
const LAUNCH_LOCK_MAX_TRIES = 5;
const LAUNCH_LOCK_BLOCK_MS = 30 * 1000;

function isPlaceholderHwid(value) {
  if (!value) return true;
  const v = String(value).trim().toLowerCase();
  if (!v || v.length < 4) return true;
  return ["to be filled by o.e.m.", "to be filled", "none", "not specified",
    "not available", "unknown", "default string", "00000000", "0000000000000000",
    "ffffffff", "system serial number"].some((p) => v.includes(p));
}

function execQuiet(cmd) {
  try {
    const { execSync } = require("child_process");
    return execSync(cmd, { encoding: "utf8", timeout: 8000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

function parseWmicSerial(output) {
  try {
    const lines = String(output || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return "";
    // Première ligne = en-tête "SerialNumber"
    lines.shift();
    return (lines[0] || "").trim();
  } catch {
    return "";
  }
}

// Empreinte matérielle brute : N° série carte mère -> UUID système -> repli machine.
function getMotherboardRawId() {
  if (cachedHwidRaw) return cachedHwidRaw;
  const candidates = [];
  if (process.platform === "linux") {
    // Crostini exposes the Linux container identity, not the Chromebook's board.
    for (const file of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
      try {
        const id = fs.readFileSync(file, "utf8").trim();
        if (/^[a-f0-9]{32}$/i.test(id) && !/^0+$/.test(id)) {
          candidates.push(`linux:${id}`);
          break;
        }
      } catch {}
    }
  }
  if (process.platform === "win32") {
    try {
      const wmic = parseWmicSerial(execQuiet("wmic baseboard get serialnumber"));
      if (wmic && !isPlaceholderHwid(wmic)) candidates.push(`board:${wmic.trim()}`);
    } catch {}
    try {
      const ps1 = String(execQuiet('powershell -NoProfile -Command "(Get-CimInstance Win32_BaseBoard).SerialNumber"') || "").trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0] || "";
      if (ps1 && !isPlaceholderHwid(ps1)) candidates.push(`board:${ps1}`);
    } catch {}
    try {
      const uuid = String(execQuiet('powershell -NoProfile -Command "(Get-CimInstance Win32_ComputerSystemProduct).UUID"') || "").trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0] || "";
      if (uuid && !isPlaceholderHwid(uuid)) candidates.push(`sysuuid:${uuid}`);
    } catch {}
  }
  let raw = candidates[0] || "";
  if (!raw) {
    // Repli (VM / carte mère sans N° série) : hostname + CPU + RAM totale.
    try {
      const cpus = (os.cpus() || []).map((c) => c.model).join("|");
      raw = `fallback:${os.hostname()}|${cpus}|${os.totalmem()}|${os.platform()}-${os.arch()}`;
    } catch {
      raw = `fallback:${os.hostname()}`;
    }
  }
  cachedHwidRaw = String(raw).trim();
  return cachedHwidRaw;
}

function getCurrentHwidHash() {
  try {
    const nodeCrypto = require("crypto");
    const raw = getMotherboardRawId().trim().toUpperCase();
    return nodeCrypto.createHash("sha256").update(raw, "utf8").digest("hex");
  } catch {
    return "";
  }
}

function loadLaunchLock() {
  const empty = { enabled: false, salt: null, hash: null, iterations: 120000, createdAt: null, updatedAt: null, trustedHwidHash: null, trustedAt: null, trustedDeviceName: null };
  try {
    if (!fs.existsSync(launchLockFile)) return empty;
    const parsed = JSON.parse(fs.readFileSync(launchLockFile, "utf-8"));
    if (!parsed || typeof parsed !== "object") return empty;
    return {
      enabled: !!parsed.enabled && !!parsed.hash && !!parsed.salt,
      salt: typeof parsed.salt === "string" ? parsed.salt : null,
      hash: typeof parsed.hash === "string" ? parsed.hash : null,
      iterations: Number.isFinite(parsed.iterations) ? parsed.iterations : 120000,
      createdAt: parsed.createdAt || null,
      updatedAt: parsed.updatedAt || null,
      trustedHwidHash: typeof parsed.trustedHwidHash === "string" ? parsed.trustedHwidHash : null,
      trustedAt: parsed.trustedAt || null,
      trustedDeviceName: typeof parsed.trustedDeviceName === "string" ? parsed.trustedDeviceName : null,
    };
  } catch {
    return empty;
  }
}

function saveLaunchLock(lock) {
  try {
    if (!fs.existsSync(launcherDir)) fs.mkdirSync(launcherDir, { recursive: true });
    const tmp = `${launchLockFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(lock, null, 2), "utf-8");
    fs.renameSync(tmp, launchLockFile);
  } catch (err) {
    console.error("[LaunchLock] Echec ecriture launch-lock.json:", err.message);
  }
}

function hashLaunchPassword(password, saltHex, iterations) {
  const nodeCrypto = require("crypto");
  return nodeCrypto.pbkdf2Sync(String(password), Buffer.from(String(saltHex), "hex"), iterations, 32, "sha256").toString("hex");
}

function verifyLaunchPasswordHash(password, lock) {
  try {
    if (!lock || !lock.hash || !lock.salt) return false;
    const nodeCrypto = require("crypto");
    const attempt = hashLaunchPassword(password, lock.salt, lock.iterations || 120000);
    const a = Buffer.from(attempt, "hex");
    const b = Buffer.from(String(lock.hash), "hex");
    if (a.length !== b.length) return false;
    return nodeCrypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function isTrustedPC(lock) {
  try {
    if (!lock || !lock.trustedHwidHash) return false;
    const current = getCurrentHwidHash();
    if (!current) return false;
    const a = Buffer.from(String(lock.trustedHwidHash), "hex");
    const b = Buffer.from(String(current), "hex");
    if (a.length !== b.length) return false;
    return require("crypto").timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// Garde centralisée appelée par launch-game : PC retenu => OK,
// sinon déverrouillage ponctuel (mot de passe vérifié il y a < 5 min).
function checkLaunchLockForGame() {
  const lock = loadLaunchLock();
  if (!lock.enabled || !lock.hash) return { allowed: true, reason: "disabled", lock };
  if (isTrustedPC(lock)) return { allowed: true, reason: "trusted", lock };
  if (launchUnlockedAt && Date.now() - launchUnlockedAt < LAUNCH_UNLOCK_VALID_MS) {
    return { allowed: true, reason: "unlocked", lock };
  }
  return { allowed: false, reason: "locked", lock };
}

// ============================================================
// Lunar Client Mods Configuration & Options Synchronization
// ============================================================
const DEFAULT_CLIENT_MODS = {
  fullBright: {
    enabled: true,
    gammaLevel: 100,
  },
  nightVision: {
    enabled: false,
    keybind: "RSHIFT",
  },
  noFog: {
    enabled: true,
    netherFog: true,
    waterFog: true,
    skyFog: true,
  },
  fpsBoost: {
    enabled: false,
    fastMath: true,
  },
  zoom: {
    enabled: true,
    smoothZoom: true,
    keybind: "C",
  },
  keystrokes: {
    enabled: true,
  },
  armorHud: {
    enabled: true,
    showNumbers: true,
  },
  speed: {
    enabled: true,
  },
  fps: {
    enabled: true,
  },
  ping: {
    enabled: true,
  },
  coordinates: {
    enabled: true,
  },
  cps: {
    enabled: true,
  },
  hudPositions: {
    coordsX: 492,
    coordsY: 8,
    cpsX: 520,
    cpsY: 260,
    armorX: 8,
    armorY: 230,
    speedX: 8,
    speedY: 34,
    fpsX: 8,
    fpsY: 8,
    pingX: 8,
    pingY: 8,
  },
};

function getClientModsConfig(targetGameDir = gameDir) {
  const config = loadConfig();
  const base = normalizeClientModsDeep(config.clientMods || {});

  // Lit également yapapouaiye_client.json (ou lunar_client.json) pour charger
  // les dernières coordonnées et réglages sauvegardés par le mod compagnon in-game
  try {
    const configDir = path.join(targetGameDir, "config");
    const diskData = readClientOptions(configDir);
    if (diskData && typeof diskData === "object") {
      if (!base.hudPositions) base.hudPositions = {};
      const posKeys = [
        "coordsX", "coordsY", "cpsX", "cpsY", "armorX", "armorY",
        "speedX", "speedY", "fpsX", "fpsY", "pingX", "pingY"
      ];
      for (const pk of posKeys) {
        if (Number.isFinite(diskData[pk])) {
          base.hudPositions[pk] = diskData[pk];
        }
      }
      if (diskData.coordinates !== undefined) base.coordinates.enabled = !!diskData.coordinates;
      if (diskData.cpsCounter !== undefined) base.cps.enabled = !!diskData.cpsCounter;
      if (diskData.armorStatus !== undefined) base.armorHud.enabled = !!diskData.armorStatus;
      if (diskData.armorHud !== undefined) base.armorHud.enabled = !!diskData.armorHud;
      if (diskData.armorNumbers !== undefined) base.armorHud.showNumbers = !!diskData.armorNumbers;
      if (diskData.armorHudNumbers !== undefined) base.armorHud.showNumbers = !!diskData.armorHudNumbers;
    }
  } catch (err) {
    console.warn("[ClientMods] Could not read disk client config:", err.message);
  }

  return base;
}

const AZERTY_DEFAULT_KEYS = {
  "key_key.forward": "key.keyboard.z",
  "key_key.left": "key.keyboard.q",
  "key_key.back": "key.keyboard.s",
  "key_key.right": "key.keyboard.d",
  "key_key.jump": "key.keyboard.space",
  "key_key.sneak": "key.keyboard.left.shift",
  "key_key.sprint": "key.keyboard.left.control",
  "key_key.drop": "key.keyboard.a",
  "key_key.inventory": "key.keyboard.e",
  "key_key.chat": "key.keyboard.t",
  "key_key.playerlist": "key.keyboard.tab",
  "key_key.pickItem": "key.mouse.middle",
  "key_key.command": "key.keyboard.slash",
  "key_key.socialInteractions": "key.keyboard.p",
  "key_key.screenshot": "key.keyboard.f2",
  "key_key.togglePerspective": "key.keyboard.f5",
  "key_key.smoothCamera": "key.keyboard.unknown",
  "key_key.fullscreen": "key.keyboard.f11",
  "key_key.spectatorOutlines": "key.keyboard.unknown",
  "key_key.swapOffhand": "key.keyboard.f",
  "key_key.saveToolbarActivator": "key.keyboard.c",
  "key_key.loadToolbarActivator": "key.keyboard.x",
  "key_key.advancements": "key.keyboard.l",
  "key_key.hotbar.1": "key.keyboard.1",
  "key_key.hotbar.2": "key.keyboard.2",
  "key_key.hotbar.3": "key.keyboard.3",
  "key_key.hotbar.4": "key.keyboard.4",
  "key_key.hotbar.5": "key.keyboard.5",
  "key_key.hotbar.6": "key.keyboard.6",
  "key_key.hotbar.7": "key.keyboard.7",
  "key_key.hotbar.8": "key.keyboard.8",
  "key_key.hotbar.9": "key.keyboard.9",
};

const QWERTY_DEFAULT_KEYS = {
  "key_key.forward": "key.keyboard.w",
  "key_key.left": "key.keyboard.a",
  "key_key.back": "key.keyboard.s",
  "key_key.right": "key.keyboard.d",
  "key_key.jump": "key.keyboard.space",
  "key_key.sneak": "key.keyboard.left.shift",
  "key_key.sprint": "key.keyboard.left.control",
  "key_key.drop": "key.keyboard.q",
  "key_key.inventory": "key.keyboard.e",
  "key_key.chat": "key.keyboard.t",
  "key_key.playerlist": "key.keyboard.tab",
  "key_key.pickItem": "key.mouse.middle",
  "key_key.command": "key.keyboard.slash",
  "key_key.socialInteractions": "key.keyboard.p",
  "key_key.screenshot": "key.keyboard.f2",
  "key_key.togglePerspective": "key.keyboard.f5",
  "key_key.smoothCamera": "key.keyboard.unknown",
  "key_key.fullscreen": "key.keyboard.f11",
  "key_key.spectatorOutlines": "key.keyboard.unknown",
  "key_key.swapOffhand": "key.keyboard.f",
  "key_key.saveToolbarActivator": "key.keyboard.c",
  "key_key.loadToolbarActivator": "key.keyboard.x",
  "key_key.advancements": "key.keyboard.l",
  "key_key.hotbar.1": "key.keyboard.1",
  "key_key.hotbar.2": "key.keyboard.2",
  "key_key.hotbar.3": "key.keyboard.3",
  "key_key.hotbar.4": "key.keyboard.4",
  "key_key.hotbar.5": "key.keyboard.5",
  "key_key.hotbar.6": "key.keyboard.6",
  "key_key.hotbar.7": "key.keyboard.7",
  "key_key.hotbar.8": "key.keyboard.8",
  "key_key.hotbar.9": "key.keyboard.9",
};

function ensureNeoForgeFmlConfig(targetGameDir = gameDir) {
  try {
    const fmlPath = path.join(targetGameDir, "config", "fml.toml");
    if (fs.existsSync(fmlPath)) {
      let content = fs.readFileSync(fmlPath, "utf-8");
      if (/^earlyWindowControl\s*=\s*true/m.test(content)) {
        content = content.replace(/^earlyWindowControl\s*=\s*true/m, "earlyWindowControl = false");
        fs.writeFileSync(fmlPath, content, "utf-8");
        console.log("[ClientMods] fml.toml mis à jour : earlyWindowControl = false (corrige les clics de souris et le bouton Contrôles)");
      }
    }
  } catch (err) {
    console.warn("[ClientMods] Impossible de vérifier fml.toml:", err.message);
  }
}

function applyKeyboardLayoutToOptionsTxt(targetLayout = "azerty", force = false, targetGameDir = gameDir) {
  try {
    const optionsPath = path.join(targetGameDir, "options.txt");
    if (!fs.existsSync(optionsPath)) return { applied: false, reason: "options.txt introuvable" };

    const targetMap = (targetLayout === "qwerty") ? QWERTY_DEFAULT_KEYS : AZERTY_DEFAULT_KEYS;
    let optText = fs.readFileSync(optionsPath, "utf-8");

    let lines = optText.split(/\r?\n/);
    const updatedKeys = new Set();
    lines = lines.map(line => {
      const match = line.match(/^([^:]+):(.*)$/);
      if (match) {
        const key = match[1];
        if (targetMap[key] !== undefined) {
          updatedKeys.add(key);
          // Existing bindings belong to the player, including WASD, mouse
          // buttons and unbound keys. Only an explicit reset replaces them.
          return force ? `${key}:${targetMap[key]}` : line;
        }
      }
      return line;
    });

    for (const [k, v] of Object.entries(targetMap)) {
      if (!updatedKeys.has(k)) {
        lines.push(`${k}:${v}`);
      }
    }

    const updatedText = lines.join("\n");
    if (updatedText === optText.replace(/\r\n/g, "\n")) {
      return { applied: false, reason: "Touches déjà configurées" };
    }
    fs.writeFileSync(optionsPath, updatedText, "utf-8");
    console.log(`[ClientMods] Disposition clavier ${targetLayout.toUpperCase()} appliquée à options.txt (force: ${force})`);
    return { applied: true, layout: targetLayout };
  } catch (err) {
    console.warn("[ClientMods] Échec application disposition clavier:", err.message);
    return { applied: false, error: err.message };
  }
}

function syncClientOptionsToMinecraft(clientMods, targetGameDir = gameDir) {
  try {
    const mods = clientMods || getClientModsConfig(targetGameDir);
    const configDir = path.join(targetGameDir, "config");
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

    // 0. Assure que fml.toml a earlyWindowControl = false (corrige les clics GLFW dans Options / Contrôles)
    ensureNeoForgeFmlConfig(targetGameDir);

    const clientJsonPath = path.join(configDir, "yapapouaiye_client.json");
    const legacyJsonPath = path.join(configDir, "lunar_client.json");

    const existingData = readClientOptions(configDir);

    const isFullBright = (mods.fullBright !== undefined) ? !!mods.fullBright.enabled : true;

    // 1. Sauvegarde et préservation des options dans options.txt SANS écraser
    // les autres paramètres de Minecraft (distance de rendu, flou d'arrière plan, etc.)
    const optionsPath = path.join(targetGameDir, "options.txt");
    if (fs.existsSync(optionsPath)) {
      try {
        let optText = fs.readFileSync(optionsPath, "utf-8");
        // Si FullBright est activé, ajuster gamma si nécessaire sans altérer le reste
        if (isFullBright) {
          const level = Number(mods.fullBright?.gammaLevel) || 100;
          const gammaVal = (level >= 1 ? level : 100).toFixed(1);
          if (/^gamma:/m.test(optText)) {
            optText = optText.replace(/^gamma:.*$/m, `gamma:${gammaVal}`);
          } else {
            optText += `\ngamma:${gammaVal}`;
          }
          fs.writeFileSync(optionsPath, optText, "utf-8");
        }
        // Initialise uniquement les touches absentes. Les contrôles enregistrés
        // par le jeu ne doivent jamais être réinitialisés pendant une synchronisation.
        const currentConfig = loadConfig();
        applyKeyboardLayoutToOptionsTxt(currentConfig.keyboardLayout || "azerty", false, targetGameDir);
      } catch (err) {
        console.warn("[ClientMods] Could not patch options.txt:", err.message);
      }
    }

    // 2. Fusion des positions HUD (du launcher, du fichier existant ou des valeurs par défaut)
    const pos = (mods.hudPositions && typeof mods.hudPositions === "object") ? mods.hudPositions : {};
    const coordsX = (pos.coordsX !== undefined) ? pos.coordsX : (existingData.coordsX !== undefined ? existingData.coordsX : 492);
    const coordsY = (pos.coordsY !== undefined) ? pos.coordsY : (existingData.coordsY !== undefined ? existingData.coordsY : 8);
    const cpsX = (pos.cpsX !== undefined) ? pos.cpsX : (existingData.cpsX !== undefined ? existingData.cpsX : 520);
    const cpsY = (pos.cpsY !== undefined) ? pos.cpsY : (existingData.cpsY !== undefined ? existingData.cpsY : 260);
    const armorX = (pos.armorX !== undefined) ? pos.armorX : (existingData.armorX !== undefined ? existingData.armorX : 8);
    const armorY = (pos.armorY !== undefined) ? pos.armorY : (existingData.armorY !== undefined ? existingData.armorY : 230);
    const speedX = (pos.speedX !== undefined) ? pos.speedX : (existingData.speedX !== undefined ? existingData.speedX : 8);
    const speedY = (pos.speedY !== undefined) ? pos.speedY : (existingData.speedY !== undefined ? existingData.speedY : 34);
    const fpsX = (pos.fpsX !== undefined) ? pos.fpsX : (existingData.fpsX !== undefined ? existingData.fpsX : 8);
    const fpsY = (pos.fpsY !== undefined) ? pos.fpsY : (existingData.fpsY !== undefined ? existingData.fpsY : 8);
    const pingX = (pos.pingX !== undefined) ? pos.pingX : (existingData.pingX !== undefined ? existingData.pingX : 8);
    const pingY = (pos.pingY !== undefined) ? pos.pingY : (existingData.pingY !== undefined ? existingData.pingY : 8);

    const isArmorHud = (mods.armorHud !== undefined) ? !!mods.armorHud.enabled : (existingData.armorHud !== undefined ? existingData.armorHud : true);
    const showArmorNumbers = (mods.armorHud?.showNumbers !== undefined) ? !!mods.armorHud.showNumbers : (existingData.armorNumbers !== undefined ? existingData.armorNumbers : true);

    const clientData = {
      ...existingData,
      fullBright: isFullBright,
      nightVision: (mods.nightVision !== undefined) ? !!mods.nightVision.enabled : (existingData.nightVision || false),
      noFog: (mods.noFog !== undefined) ? !!mods.noFog.enabled : (existingData.noFog !== undefined ? existingData.noFog : true),
      zoom: (mods.zoom !== undefined) ? !!mods.zoom.enabled : (existingData.zoom !== undefined ? existingData.zoom : true),
      fpsBoost: (mods.fpsBoost !== undefined) ? !!mods.fpsBoost.enabled : (existingData.fpsBoost || false),
      keystrokes: (mods.keystrokes !== undefined) ? !!mods.keystrokes.enabled : (existingData.keystrokes !== undefined ? existingData.keystrokes : true),
      armorHud: isArmorHud,
      armorStatus: isArmorHud,
      armorNumbers: showArmorNumbers,
      armorHudNumbers: showArmorNumbers,
      speed: (mods.speed !== undefined) ? !!mods.speed.enabled : (existingData.speed !== undefined ? existingData.speed : true),
      fps: (mods.fps !== undefined) ? !!mods.fps.enabled : (existingData.fps !== undefined ? existingData.fps : true),
      ping: (mods.ping !== undefined) ? !!mods.ping.enabled : (existingData.ping !== undefined ? existingData.ping : true),
      coordinates: (mods.coordinates !== undefined) ? !!mods.coordinates.enabled : (existingData.coordinates !== undefined ? existingData.coordinates : true),
      cpsCounter: (mods.cps !== undefined) ? !!mods.cps.enabled : ((mods.keystrokes !== undefined) ? !!mods.keystrokes.enabled : (existingData.cpsCounter !== undefined ? existingData.cpsCounter : true)),
      coordsX,
      coordsY,
      cpsX,
      cpsY,
      armorX,
      armorY,
      speedX,
      speedY,
      fpsX,
      fpsY,
      pingX,
      pingY
    };

    fs.writeFileSync(clientJsonPath, JSON.stringify(clientData, null, 2), "utf-8");
    fs.writeFileSync(legacyJsonPath, JSON.stringify(clientData, null, 2), "utf-8");

    // 3. Update Sodium Extra fog settings if present
    const sodiumExtraPath = path.join(configDir, "sodium-extra-options.json");
    if (fs.existsSync(sodiumExtraPath)) {
      try {
        const sodiumExtraJson = JSON.parse(fs.readFileSync(sodiumExtraPath, "utf-8"));
        if (!sodiumExtraJson.render_settings) sodiumExtraJson.render_settings = {};
        if (!sodiumExtraJson.render_settings.fog_settings) sodiumExtraJson.render_settings.fog_settings = {};
        if (!sodiumExtraJson.render_settings.fog_settings.atmospheric) sodiumExtraJson.render_settings.fog_settings.atmospheric = {};
        if (mods.noFog?.enabled) {
          sodiumExtraJson.render_settings.fog_settings.atmospheric.start_percent = 1000;
        } else {
          sodiumExtraJson.render_settings.fog_settings.atmospheric.start_percent = 100;
        }
        fs.writeFileSync(sodiumExtraPath, JSON.stringify(sodiumExtraJson, null, 2), "utf-8");
      } catch (err) {
        console.warn("[ClientMods] Could not update sodium-extra-options.json:", err.message);
      }
    }

    // Also update gameOptions and broadcast to overlay if active
    gameOptions = {
      ...gameOptions,
      nightVision: !!mods.nightVision?.enabled,
      noFog: !!mods.noFog?.enabled,
    };
    if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.webContents) {
      overlayWindow.webContents.send("overlay-set-options", gameOptions);
    }
    console.log("[ClientMods] Synced options to Minecraft (NightVision:", !!mods.nightVision?.enabled, "NoFog:", !!mods.noFog?.enabled, "Coords:", coordsX, coordsY, ")");
  } catch (err) {
    console.error("[ClientMods] Error syncing options to Minecraft:", err.message);
  }
}

function saveClientModsConfig(mods) {
  const current = getClientModsConfig();
  // Merge profond par module pour ne jamais perdre les sous-champs
  // (gammaLevel, keybind, showNumbers, hudPositions...) lors d'un patch partiel.
  const merged = normalizeClientModsDeep({ ...current, ...(mods || {}) });
  for (const key of Object.keys(DEFAULT_CLIENT_MODS)) {
    if (key === "hudPositions") {
      merged.hudPositions = {
        ...(current.hudPositions || {}),
        ...((mods || {}).hudPositions || {})
      };
    } else {
      merged[key] = { ...(current[key] || {}), ...(((mods || {})[key]) || {}) };
    }
  }
  saveConfig({ clientMods: merged });
  syncClientOptionsToMinecraft(merged);
  return merged;
}

// ============================================================
// Server Ping & API Integration (Falix & Gizmo API)
// ============================================================
function pingMinecraftServer(host = "158.178.200.70", port = 25565, timeout = 4000) {
  return new Promise((resolve) => {
    function writeVarInt(val) {
      const buf = [];
      while (true) {
        if ((val & ~0x7F) === 0) { buf.push(val); break; }
        buf.push((val & 0x7F) | 0x80);
        val >>>= 7;
      }
      return Buffer.from(buf);
    }

    const socket = new net.Socket();
    let rawData = Buffer.alloc(0);
    let done = false;

    const finish = (isOnline) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch {}
      resolve(isOnline);
    };

    socket.setTimeout(timeout);

    // Register error and timeout listeners before connecting
    socket.on("error", () => finish(false));
    socket.on("timeout", () => finish(false));
    socket.on("close", () => finish(false));

    socket.on("data", (chunk) => {
      rawData = Buffer.concat([rawData, chunk]);
      const str = rawData.toString("utf8");
      const jsonStart = str.indexOf("{");
      const jsonEnd = str.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        const jsonStr = str.substring(jsonStart, jsonEnd + 1);
        try {
          const parsed = JSON.parse(jsonStr);
          console.log(`[Ping ${host}:${port}] Server response:`, JSON.stringify(parsed).substring(0, 250));

          // Falix proxy signals offline via protocol -1. If players connected, server is online.
          const isOffline = parsed.version?.protocol === -1 && !(parsed.players?.online > 0);

          if (!isOffline && (parsed.version || parsed.description || parsed.players)) {
            console.log(`[Ping ${host}:${port}] Server is ONLINE!`);
            finish(true);
          } else {
            console.log(`[Ping ${host}:${port}] Server is OFFLINE`);
            finish(false);
          }
        } catch {
          // Partial JSON received across TCP chunks
        }
      }
    });

    try {
      socket.connect(port, host, () => {
        try {
          const packetId = Buffer.from([0x00]);
          const protoVersion = writeVarInt(767);
          const hostBuf = Buffer.from(host, "utf8");
          const hostLen = writeVarInt(hostBuf.length);
          const portBuf = Buffer.alloc(2);
          portBuf.writeUInt16BE(port, 0);
          const nextState = writeVarInt(1);

          const handshakePayload = Buffer.concat([packetId, protoVersion, hostLen, hostBuf, portBuf, nextState]);
          const handshakeLen = writeVarInt(handshakePayload.length);
          const handshakePacket = Buffer.concat([handshakeLen, handshakePayload]);
          const requestPacket = Buffer.from([0x01, 0x00]);

          socket.write(handshakePacket);
          socket.write(requestPacket);
        } catch {
          finish(false);
        }
      });
    } catch (err) {
      console.warn(`[Ping ${host}:${port}] Socket connect error:`, err.message);
      finish(false);
    }
  });
}

/** GimzoNodes & Gizmo WEB API Status Checker (gimzonodes.space & cloud.gizmopowered.net) */
async function checkGizmoServerStatus(server) {
  const targetHost = server?.host || "158.178.200.70";
  const targetPort = server?.pingPort || 25565;
  const config = loadConfig();

  const gizmoToken = process.env.GIMZO_API_TOKEN || process.env.GIZMO_API_TOKEN || config.gizmoToken || "";
  const gizmoUser = process.env.GIMZO_API_USER || process.env.GIZMO_API_USER || config.gizmoUsername || "";
  const gizmoPass = process.env.GIMZO_API_PASS || process.env.GIZMO_API_PASS || config.gizmoPassword || "";

  // 1. Try GimzoNodes API (gimzonodes.space/api/servers)
  if (gizmoToken) {
    try {
      console.log("[GimzoAPI] Querying GimzoNodes API at https://gimzonodes.space/api/servers...");
      const res = await new Promise((resolve, reject) => {
        const req = https.get("https://gimzonodes.space/api/servers", {
          headers: {
            "Authorization": `Bearer ${gizmoToken}`,
            "Accept": "application/json",
            "User-Agent": `YapapouaiyeLauncher/${app.getVersion()}`
          }
        }, (r) => {
          let body = "";
          r.on("data", (c) => body += c);
          r.on("end", () => resolve({ statusCode: r.statusCode, body }));
        });
        req.on("error", reject);
      });

      console.log(`[GimzoAPI] GimzoNodes response status: ${res.statusCode}`);
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const data = JSON.parse(res.body);
          const serverList = Array.isArray(data) ? data : data.servers || data.data || [];
          const sObj = serverList.find((s) =>
            (s.name && s.name.toLowerCase().includes("adoserv")) ||
            (s.identifier && s.identifier.toLowerCase().includes("adoserv"))
          );
          if (sObj) {
            const isOnline = sObj.status === "running" || sObj.state === "running" || sObj.online === true;
            console.log(`[GimzoAPI] GimzoNodes server status: online=${isOnline}`);
            return { success: true, online: isOnline, state: isOnline ? "running" : "offline" };
          }
        } catch {}
      }
    } catch (err) {
      console.warn("[GimzoAPI] GimzoNodes API warning:", err.message);
    }
  }

  // 2. Try Gizmo Web API (cloud.gizmopowered.net) if credentials present
  let authHeader = null;
  if (gizmoToken) authHeader = `Bearer ${gizmoToken}`;
  else if (gizmoUser && gizmoPass) authHeader = `Basic ${Buffer.from(`${gizmoUser}:${gizmoPass}`).toString("base64")}`;

  if (authHeader) {
    try {
      const gizmoApiUrl = (process.env.GIZMO_API_URL || config.gizmoApiUrl || server?.apiUrl || "https://cloud.gizmopowered.net").replace(/\/$/, "");
      console.log(`[GizmoAPI v2.0] Querying status at ${gizmoApiUrl}/api/v2.0/hosts...`);
      const res = await new Promise((resolve, reject) => {
        const req = https.get(`${gizmoApiUrl}/api/v2.0/hosts`, {
          headers: { "Authorization": authHeader, "Accept": "application/json" }
        }, (r) => {
          let body = "";
          r.on("data", (c) => body += c);
          r.on("end", () => resolve({ statusCode: r.statusCode, body }));
        });
        req.on("error", reject);
      });

      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const data = JSON.parse(res.body);
          const hostList = Array.isArray(data) ? data : data.result || data.data || [];
          const targetHostObj = hostList.find((h) =>
            (h.name && h.name.toLowerCase().includes("adoserv")) ||
            (h.hostComputer && h.hostComputer.windowsName && h.hostComputer.windowsName.toLowerCase().includes("adoserv"))
          );
          if (targetHostObj) {
            const isOnline = !targetHostObj.isOutOfOrder && !targetHostObj.isDeleted;
            console.log(`[GizmoAPI v2.0] Host ${targetHostObj.name || targetHostObj.id} online=${isOnline}`);
            return { success: true, online: isOnline, state: isOnline ? "running" : "offline" };
          }
        } catch {}
      }
    } catch (err) {
      console.warn("[GizmoAPI v2.0] Query warning:", err.message);
    }
  }

  // 3. Socket ping directly to the Minecraft host & port
  const online = await pingMinecraftServer(targetHost, targetPort, 6000);
  return { success: true, online, state: online ? "running" : "offline" };
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
let mainWindowShown = false;
function showMainWindow() {
  if (mainWindowShown) return;
  mainWindowShown = true;
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  } catch (err) {
    console.error("[Window] Error showing main window:", err);
  }
  closeSplash();
}

function createWindow() {
  mainWindowShown = false;
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    resizable: true,
    show: false,
    backgroundColor: "#0c1015",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true,
      spellcheck: false,
    },
    icon: path.join(__dirname, "..", "assets", process.platform === "win32" ? "logo.ico" : "logo.png"),
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

  // Live refresh admin (serveurs + maintenance poussés au renderer, sans redémarrage).
  try { startRemoteStateWatcher(); } catch {}
  mainWindow.on("focus", () => { pollRemoteStateOnce().catch(() => {}); });

  mainWindow.webContents.on("render-process-gone", (event, details) => {
    console.error("[MainWindow] Render process gone:", details);
    logToFile("ERROR", "MainWindow render process gone:", details);
  });

  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription) => {
    console.error(`[MainWindow] Failed to load index.html: ${errorCode} - ${errorDescription}`);
    logToFile("WARN", `Failed to load index.html: ${errorCode} - ${errorDescription}`);
    showMainWindow();
  });

  // Wait for the splash animation to finish (~5s hold + 0.7s stretch)
  // before revealing the main window, then fade it in.
  mainWindow.once("ready-to-show", () => {
    const waitUntil = splashStartedAt + 5700;
    const delay = Math.max(0, waitUntil - Date.now());
    setTimeout(() => {
      showMainWindow();
    }, delay);
  });

  // Fallback timer: guarantee the window is revealed even if ready-to-show takes too long on boot
  setTimeout(() => {
    if (!mainWindowShown) {
      console.log("[Window] Fallback timer triggered to reveal main window");
      showMainWindow();
    }
  }, 7500);
}

function createSplash() {
  splashStartedAt = Date.now();
  try {
    splashWindow = new BrowserWindow({
      width: 1100,
      height: 700,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      center: true,
      skipTaskbar: true,
      hasShadow: false,
      backgroundColor: "#00000000",
      icon: path.join(__dirname, "..", "assets", process.platform === "win32" ? "logo.ico" : "logo.png"),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    splashWindow.setIgnoreMouseEvents(true);
    splashWindow.loadFile(path.join(__dirname, "splash.html"));
    splashWindow.on("closed", () => {
      splashWindow = null;
    });
  } catch (err) {
    console.error("[Splash] Failed to create splash window:", err);
    splashWindow = null;
  }
}

function closeSplash() {
  try {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }
  } catch {}
  splashWindow = null;
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
  // Pré-chargement immédiat pendant le splash (logo) : auth, serveurs,
  // statut serveur, mods locaux. Le renderer récupère tout via get-initial-state.
  try {
    bootPreloadPromise = runBootPreload();
    bootPreloadPromise.catch(() => {});
  } catch {}
  // Windows taskbar icon: register the AppUserModelID so the window
  // uses the launcher's icon (logo.png) instead of the default Electron one.
  const appId = "com.yapapouaiye.launcher";
  if (process.platform === "win32") app.setAppUserModelId(appId);
  const appIconPath = path.join(__dirname, "..", "assets", "logo.ico");
  if (process.platform === "win32" && fs.existsSync(appIconPath)) {
    app.setName("Yapapouaiye Launcher");
    try { app.setApplicationIconForNotification(appIconPath); } catch {}
  }

  try {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders = { ...(details?.responseHeaders || {}) };
      delete responseHeaders["x-frame-options"];
      delete responseHeaders["X-Frame-Options"];
      delete responseHeaders["content-security-policy"];
      delete responseHeaders["Content-Security-Policy"];
      callback({ cancel: false, responseHeaders });
    });
  } catch (err) {
    console.warn("[Session] onHeadersReceived error:", err);
  }

  createSplash();
  if (splashWindow) {
    setTimeout(() => {
      createWindow();
    }, 4500);
  } else {
    createWindow();
  }

  // Pré-chauffe l'empreinte carte mère en tâche de fond (cache) pour que
  // le contrôle du verrou au clic JOUER soit instantané (powershell ~1s).
  setTimeout(() => {
    try { getMotherboardRawId(); } catch {}
  }, 5000);
  
  // ============================================================
  // Auto-update : check GitHub releases on every startup
  // ============================================================
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.disableDifferentialDownload = true;

  // Force update checks in development mode only (unpacked app)
  if (!app.isPackaged) {
    autoUpdater.forceDevUpdateConfig = true;
    autoUpdater.updateConfigPath = path.join(__dirname, "..", "dev-app-update.yml");
    console.log("[AutoUpdater] Dev config path:", autoUpdater.updateConfigPath);
  }

  // ============================================================
  // MAJ launcher : GitHub Releases (provider par defaut, package.json > build.publish).
  // Backblaze B2 sert UNIQUEMENT aux mods AdoServ67, pas aux MAJ du launcher.
  // Canal Beta Tester : si config.betaTester === true, les releases
  // "-beta" / "-alpha" (prereleases GitHub) sont acceptees.
  // ============================================================
  autoUpdater.allowPrerelease = isBetaTesterEnabled();
  autoUpdater.allowDowngrade = true;
  autoUpdater.setFeedURL({
    provider: "custom", updateProvider: LauncherUpdateProvider,
    owner: GITHUB_OWNER_LAUNCHER, repo: GITHUB_REPO_LAUNCHER,
    loadReleases: fetchLauncherReleases,
    getRequestedVersion: () => requestedUpdateVersion,
    isPrerelease: isPrereleaseVersion, isNewer: isLauncherVersionNewer,
    getChannel: getVersionChannel, isValidVersion: value => !!parseLauncherVersion(value),
  });
  autoUpdater.isUpdateAvailable = async (updateInfo) => {
    const feed = updateInfo?.version;
    const cur = app.getVersion();
    if (requestedUpdateVersion) return normalizeVersion(feed) === requestedUpdateVersion && normalizeVersion(cur) !== requestedUpdateVersion;
    if (isLauncherVersionNewer(feed, cur)) return true;
    // Changement de canal a numeros egaux (ex: 1.6.0-1 -> 1.6.0-1-alpha) :
    // accepte le telechargement quand le canal beta est active et que
    // l'utilisateur a valide la proposition (sinon l'updater refuserait
    // de telecharger une version "non plus recente" au sens strict).
    if (isBetaTesterEnabled() && isPrereleaseVersion(feed) && isSameNumericDifferentChannel(feed, cur)) return true;
    return false;
  };

  autoUpdater.on("checking-for-update", () => {
    console.log("[AutoUpdater] Checking for updates...");
    sendToRenderer("progress", { type: "update-checking", message: "Verification des mises a jour..." });
  });

  autoUpdater.on("update-available", (info) => {
    console.log("[AutoUpdater] Update available:", info.version);
    sendToRenderer("progress", { type: "update-available", message: `Mise a jour ${info.version} disponible !`, version: info.version });
  });

  autoUpdater.on("update-not-available", (info) => {
    console.log("[AutoUpdater] Already up to date.");
    sendToRenderer("progress", { type: "update-not-available", message: "Deja a jour", version: info?.version });
  });

  autoUpdater.on("download-progress", (progress) => {
    const percent = Math.round(progress.percent);
    console.log(`[AutoUpdater] Download: ${percent}%`);
    sendToRenderer("progress", {
      type: "update-progress",
      value: percent,
      speed: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log("[AutoUpdater] Update downloaded:", info.version);
    sendToRenderer("progress", { type: "update-downloaded", message: `v${info.version} prete ! Redemarrage dans 5s...` });
    setTimeout(() => {
      try { autoUpdater.quitAndInstall(false, true); } catch {}
    }, 5000);
  });

  autoUpdater.on("error", (err) => {
    console.error("[AutoUpdater] Error:", err.message);
    sendToRenderer("progress", { type: "update-error", message: err.message });
  });

  // Grace delay on startup (3 seconds): let Windows network stack & DNS initialize after computer boot
  setTimeout(() => {
    runServerStatusCheck().catch((err) => {
      console.warn("[Startup] Initial server status check warning:", err.message);
    });

    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.warn("[AutoUpdater] Failed to check for updates at startup:", err.message);
    });
  }, 3000);
});
app.on("window-all-closed", () => app.quit());

// ============================================================
// HTTP helper
// ============================================================
function httpGet(url, binary = false, useToken = true) {
  return new Promise((resolve, reject) => {
    const headers = {
      "User-Agent": `YapapouaiyeLauncher/${app.getVersion()}`,
      "Accept": binary ? "application/octet-stream" : "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
    };
    if (useToken && GITEA_TOKEN) {
      headers["Authorization"] = `token ${GITEA_TOKEN}`;
    }
    const client = url.startsWith("http://") ? http : https;
    const req = client.get(url, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location, binary, useToken).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.setTimeout(5000, () => {
      req.destroy(new Error(`Timeout de connexion aprÃ¨s 5s pour ${url}`));
    });
    req.on("error", reject);
  });
}

// ============================================================
// Remote mods
// ============================================================
// ============================================================
// Mods provider : Backblaze B2 (S3-compatible, bucket privé, SigV4)
// Structure attendue :
//   {prefix}mods.json  -> [{ name, sha?, size?, file? }]  (facultatif)
//   {prefix}*.jar      -> les mods
// Si mods.json est absent, fallback sur le listing XML ListObjects.
// ============================================================
const crypto = require("crypto");

function hmacSha256(key, data, encoding) {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest(encoding);
}

function sha256Hex(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function getB2Source(server) {
  const src = server?.modsSource;
  if (!src || src.type !== "b2") return null;
  const endpoint = String(src.endpoint || process.env.B2_ENDPOINT || "https://s3.eu-central-003.backblazeb2.com").replace(/\/+$/, "");
  const host = endpoint.replace(/^https?:\/\//, "");
  return {
    endpoint,
    host,
    region: src.region || process.env.B2_REGION || "eu-central-003",
    bucket: src.bucket || process.env.B2_BUCKET || "adoserv67",
    prefix: src.prefix || process.env.B2_MODS_PREFIX || "",
    accessKey: src.accessKey || process.env.B2_KEY_ID || "0037d97c4a6b9440000000001",
    secretKey: src.secretKey || process.env.B2_APP_KEY || "K003EUdKUJNstI0k9WSA4+bU+1ItRMc",
  };
}

function signB2Request({ method, host, canonicalUri, canonicalQuery, region, accessKey, secretKey, extraHeaders }) {
  const amzDate = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex("");
  const headers = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...(extraHeaders || {}),
  };
  const signedHeaderNames = Object.keys(headers).map((k) => k.toLowerCase()).sort();
  const canonicalHeaders = signedHeaderNames.map((k) => `${k}:${headers[k]}\n`).join("");
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQuery || ""}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256Hex(canonicalRequest)}`;
  const kDate = hmacSha256(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, "s3");
  const kSigning = hmacSha256(kService, "aws4_request");
  const signature = hmacSha256(kSigning, stringToSign, "hex");
  headers.Authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return headers;
}

function b2HttpGet(src, objectKey) {
  const key = String(objectKey || "").replace(/^\/+/, "");
  const canonicalUri = `/${src.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const url = `${src.endpoint}${canonicalUri}`;
  const headers = signB2Request({
    method: "GET",
    host: src.host,
    canonicalUri,
    canonicalQuery: "",
    region: src.region,
    accessKey: src.accessKey,
    secretKey: src.secretKey,
  });
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location, true, false).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.setTimeout(20000, () => req.destroy(new Error(`Timeout B2 pour ${url}`)));
    req.on("error", reject);
  });
}

function b2ListObjects(src, prefix) {
  const canonicalUri = `/${src.bucket}`;
  const query = `list-type=2&prefix=${encodeURIComponent(prefix || "")}`;
  const url = `${src.endpoint}${canonicalUri}?${query}`;
  const headers = signB2Request({
    method: "GET",
    host: src.host,
    canonicalUri,
    canonicalQuery: query,
    region: src.region,
    accessKey: src.accessKey,
    secretKey: src.secretKey,
  });
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} listing B2`));
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString()));
      res.on("error", reject);
    });
    req.setTimeout(20000, () => req.destroy(new Error("Timeout listing B2")));
    req.on("error", reject);
  });
}

function parseJarListing(xml, src) {
  const blocks = [...String(xml || "").matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)];
  const out = [];
  const seen = new Set();
  for (const block of blocks) {
    const body = block[1] || "";
    const key = (body.match(/<Key>([^<]+)<\/Key>/) || [])[1];
    if (!key || !key.toLowerCase().endsWith(".jar")) continue;
    const file = key.split("/").pop();
    if (!file || seen.has(file.toLowerCase())) continue;
    seen.add(file.toLowerCase());
    const etag = (body.match(/<ETag>"?([^"<]+)"?<\/ETag>/) || [])[1];
    const size = parseInt((body.match(/<Size>(\d+)<\/Size>/) || [])[1] || "0", 10);
    out.push({
      name: file,
      sha: String(etag || file),
      size,
      download_url: `${src.endpoint}/${src.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`,
      objectKey: key,
    });
  }
  return out;
}

async function fetchRemoteModsListB2(server) {
  const src = getB2Source(server);
  if (!src) return null;
  if (!src.accessKey || !src.secretKey) {
    console.error("[ModSync] B2_KEY_ID / B2_APP_KEY manquants");
    return null;
  }
  const prefix = src.prefix || "";

  // Source de vérité = listing live du bucket (ajout + suppression).
  // mods.json ne sert qu'à enrichir sha/taille, jamais à garder un jar déjà retiré.
  let listed = null;
  let usedPrefix = prefix;
  let listedOk = false;
  const prefixesToTry = [...new Set([prefix, ""])];
  for (const p of prefixesToTry) {
    try {
      const xml = await b2ListObjects(src, p);
      const attempt = parseJarListing(xml, src);
      listedOk = true;
      if (attempt.length === 0) {
        // Un listing vide avec un préfixe configuré = probablement un mauvais
        // préfixe (ex: "mods/" alors que les jars sont à la racine). On essaie
        // le préfixe suivant au lieu de valider un wipe du dossier local.
        console.warn(`[ModSync] B2 listing prefix="${p}" : 0 jar, essai du préfixe suivant...`);
        continue;
      }
      listed = attempt;
      usedPrefix = p;
      break;
    } catch (err) {
      console.warn(`[ModSync] B2 listing prefix="${p}" failed:`, err.message);
    }
  }
  if (!listed) return listedOk ? [] : null;

  try {
    const data = await b2HttpGet(src, `${usedPrefix}mods.json`);
    const raw = data.toString().trim();
    if (raw.startsWith("{") || raw.startsWith("[")) {
      const parsed = JSON.parse(raw);
      const metaList = Array.isArray(parsed) ? parsed : parsed.mods;
      if (Array.isArray(metaList)) {
        const metaByName = {};
        for (const m of metaList) {
          const file = String(m?.file || m?.name || "").split("/").pop();
          if (file) metaByName[file.toLowerCase()] = m;
        }
        for (const mod of listed) {
          const meta = metaByName[mod.name.toLowerCase()];
          if (!meta) continue;
          if (meta.sha || meta.etag || meta.hash) mod.sha = String(meta.sha || meta.etag || meta.hash);
          if (meta.size) mod.size = meta.size;
        }
      }
    }
  } catch {
    // manifeste optionnel
  }

  // Bucket vide = 0 mod. Ne jamais conserver un cache local périmé.
  console.log(`[ModSync] B2 listing: ${listed.length} jar(s)`);
  return listed;
}

async function fetchRemoteModsList(repoConfig) {
  try {
    const repo = repoConfig || getModsRepo();
    // All mods live at the repo root (NeoForge + Fabric mods together).
    const url = `${GITEA_URL}/api/v1/repos/${repo.owner}/${repo.repo}/contents?ref=${repo.branch}`;
    const data = await httpGet(url, false, true);
    const files = JSON.parse(data.toString());
    if (!Array.isArray(files)) return null;

    return files
      .filter((f) => typeof f.name === "string" && f.name.toLowerCase().endsWith(".jar") && (f.type === "file" || f.type === "blob"))
      .map((f) => ({
        name: f.name,
        sha: f.sha || f.name,
        size: f.size,
        download_url: `${GITEA_URL}/api/v1/repos/${repo.owner}/${repo.repo}/raw/${encodeURIComponent(f.name)}?ref=${repo.branch}`
      }));
  } catch (err) {
    console.error("Failed to fetch mods list from Gitea:", err.message);
    return null;
  }
}

function downloadFileStream(url, destPath, progressCb, isRedirect = false) {
  return new Promise((resolve, reject) => {
    const headers = {
      "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) YapapouaiyeLauncher/${app.getVersion()}`,
    };
    const isB2Url = url.includes(".backblazeb2.com");
    const isScalewayUrl = url.includes(".scw.cloud");
    if (isB2Url && !isRedirect) {
      try {
        const u = new URL(url);
        const parts = u.pathname.replace(/^\/+/, "").split("/");
        const bucket = parts.shift();
        const objectKey = parts.join("/");
        const src = getB2Source({ modsSource: { type: "b2", bucket } }) || getB2Source({ modsSource: { type: "b2" } });
        if (src && src.accessKey && src.secretKey) {
          const canonicalUri = `/${src.bucket}/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
          Object.assign(headers, signB2Request({
            method: "GET",
            host: src.host,
            canonicalUri,
            canonicalQuery: "",
            region: src.region,
            accessKey: src.accessKey,
            secretKey: src.secretKey,
          }));
        }
      } catch (err) {
        console.warn("[ModSync] B2 sign failed:", err.message);
      }
    } else if (!isRedirect && !isScalewayUrl && GITEA_TOKEN) {
      headers["Authorization"] = `token ${GITEA_TOKEN}`;
    }

    const client = url.startsWith("http://") ? http : https;
    client.get(url, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFileStream(res.headers.location, destPath, progressCb, true).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }

      const fileStream = fs.createWriteStream(destPath);
      let downloaded = 0;
      const total = parseInt(res.headers["content-length"] || "0", 10);

      res.on("data", (chunk) => {
        downloaded += chunk.length;
        if (progressCb && total > 0) {
          const percent = Math.min(100, Math.max(0, Math.round((downloaded / total) * 100)));
          progressCb(percent, downloaded, total);
        }
      });

      res.pipe(fileStream);

      fileStream.on("finish", () => {
        fileStream.close();
        if (total > 0 && downloaded < total) {
          try { fs.unlinkSync(destPath); } catch {}
          return reject(new Error(`TÃ©lÃ©chargement incomplet: ${downloaded}/${total} octets`));
        }
        resolve(true);
      });

      fileStream.on("error", (err) => {
        try { fs.unlinkSync(destPath); } catch {}
        reject(err);
      });
    }).on("error", (err) => {
      // Erreur socket (reset/timeout) AVANT la fin du flux : aucun event
      // "finish"/"error" du fileStream ne partira → supprimer le tronqué
      // pour ne jamais stager un .jar invalide au lancement.
      try { fs.unlinkSync(destPath); } catch {}
      reject(err);
    });
  });
}

async function downloadFileStreamWithRetry(url, destPath, progressCb, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await downloadFileStream(url, destPath, progressCb);
      return true;
    } catch (err) {
      console.warn(`[ModSync] Attempt ${attempt}/${retries} failed for ${url}:`, err.message);
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

async function syncModsFromRemote(targetServer) {
  const server = targetServer || getActiveServer();
  const repoConfig = getModsRepo(server);
  const hashFile = getModsHashFile(server.id);
  const serverModsDir = getServerModsDir(server.id);
  if (!fs.existsSync(serverModsDir)) fs.mkdirSync(serverModsDir, { recursive: true });

  // Provider de mods : Backblaze B2 (AdoServ67) ou Gitea (autres serveurs)
  const isB2 = server?.modsSource?.type === "b2";
  const remoteMods = isB2
    ? await fetchRemoteModsListB2(server)
    : await fetchRemoteModsList(repoConfig);
  if (!remoteMods) {
    return { updated: false, count: 0, error: isB2 ? "Impossible de contacter Backblaze B2 (mods)." : "Impossible de contacter Gitea." };
  }

  // Garde-fou anti-wipe : un listing distant VIDE (mauvais préfixe, mauvais
  // dossier repo, bucket vidé par erreur) ne doit JAMAIS effacer les mods
  // locaux. Avant, [] déclenchait le miroir strict + "succès" et le jeu
  // partait sans mods. On annule sans toucher au disque.
  if (remoteMods.length === 0) {
    return { updated: false, count: listJarFiles(serverModsDir).length, error: "Aucun mod trouvé sur le dépôt distant — synchronisation annulée, fichiers locaux conservés." };
  }

  // Nettoie les restes ".part" d'un téléchargement tué en plein vol
  // (ex: launcher fermé pendant la synchro) pour ne jamais les stager.
  try {
    for (const f of fs.readdirSync(serverModsDir)) {
      if (f.toLowerCase().endsWith(".part")) {
        try { fs.unlinkSync(path.join(serverModsDir, f)); } catch {}
      }
    }
  } catch {}

  let localHashes = {};
  if (fs.existsSync(hashFile)) {
    try { localHashes = JSON.parse(fs.readFileSync(hashFile, "utf-8")); } catch {}
  }

  const remoteNames = remoteMods.map((m) => m.name);
  const remoteNamesLower = new Set(remoteNames.map((n) => n.toLowerCase()));
  let downloaded = 0;
  let removed = 0;

  for (const mod of remoteMods) {
    const destPath = path.join(serverModsDir, mod.name);
    const exists = fs.existsSync(destPath);
    const existingSize = exists ? fs.statSync(destPath).size : -1;
    // Compare size only when the remote manifest provides a numeric size,
    // otherwise rely on sha/hash comparison to avoid re-downloading every time.
    const sizeMismatch = typeof mod.size === "number" && mod.size >= 0
      ? existingSize !== mod.size
      : false;

    if (!exists || sizeMismatch || localHashes[mod.name] !== mod.sha) {
      // Téléchargement vers un fichier temporaire ".part" + renommage atomique :
      // un .jar tronqué ne remplace jamais un mod valide, même si le
      // processus est tué ou si le réseau coupe en plein transfert.
      const partPath = destPath + ".part";
      try {
        console.log(`[ModSync] Downloading ${mod.name} (${mod.size} bytes)...`);
        await downloadFileStreamWithRetry(mod.download_url, partPath, (pct) => {
          sendToRenderer("progress", {
            type: "mod-sync",
            value: `TÃ©lÃ©chargement mod: ${mod.name} (${pct}%)`
          });
        });
        let partSize = -1;
        try { partSize = fs.statSync(partPath).size; } catch {}
        if (partSize <= 0 || (typeof mod.size === "number" && mod.size > 0 && partSize !== mod.size)) {
          throw new Error(`Fichier invalide reçu (${partSize} octets, attendu ${mod.size})`);
        }
        try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch {}
        fs.renameSync(partPath, destPath);
        localHashes[mod.name] = mod.sha;
        downloaded++;
      } catch (err) {
        console.error(`Failed to download ${mod.name}:`, err.message);
        try { fs.unlinkSync(partPath); } catch {}
      }
    }
  }

  // Copy custom mods from customModsDir into the per-server mods dir
  const customNames = [];
  if (fs.existsSync(customModsDir)) {
    const customFiles = listJarFiles(customModsDir);
    for (const customFile of customFiles) {
      customNames.push(customFile);
      const src = path.join(customModsDir, customFile);
      const dest = path.join(serverModsDir, customFile);
      if (!fs.existsSync(dest)) {
        try { fs.copyFileSync(src, dest); } catch {}
      }
    }
  }

  // Miroir strict : tout .jar local absent du listing distant (et non custom) est supprimé
  const customLower = new Set(customNames.map((n) => n.toLowerCase()));
  const localMods = listJarFiles(serverModsDir);
  for (const local of localMods) {
    if (!remoteNamesLower.has(local.toLowerCase()) && !customLower.has(local.toLowerCase())) {
      try {
        fs.unlinkSync(path.join(serverModsDir, local));
        removed++;
        console.log(`[ModSync] Removed ${local}`);
      } catch (err) {
        console.error(`[ModSync] Failed to remove ${local}:`, err.message);
      }
      delete localHashes[local];
    }
  }

  fs.writeFileSync(hashFile, JSON.stringify(localHashes, null, 2));
  console.log(`[ModSync] ${server.id}: +${downloaded} / -${removed} / total ${remoteNames.length}`);
  return { updated: downloaded > 0 || removed > 0, count: remoteNames.length, downloaded, removed, serverId: server.id, repo: isB2 ? "b2:adoserv67" : repoConfig.repo };
}

/** Mirrors the per-server mods (incl. custom mods) into the game's mods folder before launch. */
function stageModsForLaunch(serverId, minecraftVersion, loader, modsDir = path.join(gameDir, "mods")) {
  const serverModsDir = getServerModsDir(serverId);
  if (!fs.existsSync(serverModsDir)) fs.mkdirSync(serverModsDir, { recursive: true });
  if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true });

  // Clear the game mods folder of jars (case-insensitive)
  for (const f of listJarFiles(modsDir)) {
    try { fs.unlinkSync(path.join(modsDir, f)); } catch {}
  }

  // Stage uniquement les mods du serveur actif + mods custom.
  // Ne PAS réinjecter le dossier local du repo (mods/) : ça empêchait les suppressions.
  let staged = 0;
  let failed = 0;
  const failedNames = [];
  const seen = new Set();
  const sources = [serverModsDir, customModsDir];
  for (const srcDir of sources) {
    if (!fs.existsSync(srcDir)) continue;
    for (const f of listJarFiles(srcDir)) {
      const key = f.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const srcFile = path.join(srcDir, f);
      const destFile = path.join(modsDir, f);
      let copied = false;
      try {
        if (fs.existsSync(destFile)) fs.unlinkSync(destFile);
        // A cache update must never mutate jars used by another open session.
        fs.copyFileSync(srcFile, destFile);
        copied = true;
      } catch { copied = false; }
      if (!copied) {
        // Fichier source verrouillé ou disque inaccessible (ex: jeu déjà lancé).
        // On compte l'échec au lieu de lancer silencieusement sans ce mod.
        failed++;
        if (failedNames.length < 5) failedNames.push(f);
        continue;
      }
      // Verify the staged file exists and is non-empty
      try {
        const st = fs.statSync(destFile);
        if (st.size > 0) staged++;
        else { try { fs.unlinkSync(destFile); } catch {} failed++; if (failedNames.length < 5) failedNames.push(f); }
      } catch { failed++; if (failedNames.length < 5) failedNames.push(f); }
    }
  }

  console.log(`[Launch] Staged ${staged} mod(s), ${failed} échec(s) for server ${serverId} into game mods folder.`);

  // Inject the client companion mod (NexLux) providing Lunar Client features:
  // FullBright, NoFog, and in-game GUI menu
  injectClientCompanionMod(minecraftVersion, loader, modsDir);
  return { staged, failed, failedNames };
}

/** Injects NexLux companion mod into game mods folder to enable Lunar Client features */
function injectClientCompanionMod(minecraftVersion, loader, modsDir = path.join(gameDir, "mods")) {
  const filename = loader === "neoforge" ? ({ "26.2": "nexlux-26.2.jar", "1.21.1": "nexlux-1.1.0.jar" })[minecraftVersion] : null;
  if (!filename) {
    console.log("[ClientMods] NexLux non disponible pour " + loader + " / " + minecraftVersion);
    return;
  }
  const candidatePaths = [
    path.join(process.resourcesPath || "", "mods", filename),
    path.join(__dirname, "..", "mods", filename),
    path.join(__dirname, "assets", filename),
  ];
  const foundSrc = candidatePaths.find(p => fs.existsSync(p));
  if (!foundSrc) throw new Error("NexLux compatible introuvable : " + filename);
  // Unlink staged hardlinks before copying, so server caches remain untouched.
  for (const name of fs.readdirSync(modsDir)) {
    if (/^nexlux(?:-.*)?\.jar$/i.test(name)) fs.unlinkSync(path.join(modsDir, name));
  }
  const targetPath = path.join(modsDir, filename);
  fs.copyFileSync(foundSrc, targetPath);
  console.log("[ClientMods] Successfully injected NexLux companion mod to:", targetPath);
}

// ============================================================
// Server list injection (servers.dat)
// ============================================================
function ensureServerInList(targetGameDir = gameDir) {
  try {
    const serversDat = path.join(targetGameDir, "servers.dat");
    const serverEntries = getAllServers().map((s) => ({ name: s.name, ip: s.displayIp }));
    const nbt = buildServersNBTMulti(serverEntries);
    fs.writeFileSync(serversDat, nbt);
  } catch (err) {
    console.error("Failed to write servers.dat:", err.message);
  }
}

function buildServersNBTMulti(serverList) {
  const buffers = [];

  function writeByte(v) { const b = Buffer.alloc(1); b.writeInt8(v); buffers.push(b); }
  function writeShort(v) { const b = Buffer.alloc(2); b.writeInt16BE(v); buffers.push(b); }
  function writeString(s) { const sb = Buffer.from(s, "utf-8"); writeShort(sb.length); buffers.push(sb); }

  // Root compound tag (type 10, name "")
  writeByte(10); writeString("");

  // List tag "servers" (type 9)
  writeByte(9); writeString("servers");
  writeByte(10); // list contains compounds
  const countBuf = Buffer.alloc(4); countBuf.writeInt32BE(serverList.length); buffers.push(countBuf);

  for (const s of serverList) {
    writeByte(8); writeString("ip"); writeString(s.ip);
    writeByte(8); writeString("name"); writeString(s.name);
    writeByte(1); writeString("hideAddress"); writeByte(0);
    writeByte(0); // end of server compound
  }

  writeByte(0); // end of root compound

  return Buffer.concat(buffers);
}

// ============================================================
// Updates IPC
// ============================================================
ipcMain.handle("get-app-version", () => app.getVersion());

// Custom version comparison tolerant to the "X.Y.Z-N" notation (ex: 1.5.7-1).
// Standard semver treats 1.5.7-1 as a prerelease OLDER than 1.5.7, which would
// block updates for clients on 1.5.7. Here, the numeric suffix after "-" is
// compared as a 4th build number: 1.5.7-1 > 1.5.7 and 1.5.7-2 > 1.5.7-1.
// Extensions Beta Tester : les suffixes "-beta" / "-alpha" (ex: 1.6.1-beta,
// 1.6.0-2-alpha, 1.6.1-alpha.2, v1.7.0-BETA) sont detectes comme canal pre-release.
// Regle d'ordre : base major.minor.patch d'abord, puis NUMERO DE BUILD
// (le premier nombre du suffixe : "1.6.0-1" -> build 1, "1.6.0-2-alpha"
// -> build 2), puis stabilite (stable > beta > alpha a numeros egaux).
function getVersionChannel(v) {
  const s = String(v || "").toLowerCase();
  if (/-alpha/.test(s) || s.includes("alpha")) return "alpha";
  if (/-beta/.test(s) || s.includes("beta")) return "beta";
  return "stable";
}

function isPrereleaseVersion(v) {
  return getVersionChannel(v) !== "stable";
}

function parseLauncherVersion(v) {
  if (!v) return null;
  const clean = String(v).trim().replace(/^v/i, "");
  const m = clean.match(/^(\d+)\.(\d+)\.(\d+)(?:[-.+](.+))?/);
  if (!m) return null;
  const suffix = (m[4] || "").split("+")[0].toLowerCase();
  let channel = "stable";
  let channelWeight = 2; // stable > beta (1) > alpha (0)
  if (suffix.includes("alpha")) { channel = "alpha"; channelWeight = 0; }
  else if (suffix.includes("beta")) { channel = "beta"; channelWeight = 1; }
  const numMatch = suffix.match(/(\d+)/);
  const build = numMatch ? parseInt(numMatch[1], 10) : 0;
  // Suffixe purement numerique historique ("1.6.0-1") = build stable.
  // "2-alpha" / "1-beta" / "alpha.2" -> build + canal pre-release.
  return { major: +m[1], minor: +m[2], patch: +m[3], build, buildParts: (suffix.match(/\d+/g) || []).map(Number), channel, channelWeight, suffix };
}

// Compare uniquement la partie numerique (major.minor.patch.build),
// sans tenir compte du canal. >0 si `a` plus recent, <0 si plus ancien, 0 si egalite.
function compareLauncherNumeric(a, b) {
  const x = parseLauncherVersion(a);
  const y = parseLauncherVersion(b);
  if (!x || !y) return 0;
  const left = [x.major, x.minor, x.patch, ...x.buildParts];
  const right = [y.major, y.minor, y.patch, ...y.buildParts];
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if ((left[i] || 0) > (right[i] || 0)) return 1;
    if ((left[i] || 0) < (right[i] || 0)) return -1;
  }
  return 0;
}

// Returns true if `latest` is strictly newer than `current` (custom notation aware)
function isLauncherVersionNewer(latest, current) {
  const l = parseLauncherVersion(latest);
  const c = parseLauncherVersion(current);
  if (!l || !c) return latest !== current; // fallback: any difference = update
  // Base + build d'abord : "1.6.0-2-alpha" (build 2) > "1.6.0-1" (build 1).
  const numericOrder = compareLauncherNumeric(latest, current);
  if (numericOrder !== 0) return numericOrder > 0;
  // Memes numeros : stable > beta > alpha (ex: 1.6.0 > 1.6.0-beta).
  if (l.channelWeight !== c.channelWeight) return l.channelWeight > c.channelWeight;
  return false;
}

// Cas limite : memes numeros mais canal different (ex: "1.6.0-1" stable vs
// "1.6.0-1-alpha"). Strictement ce n'est pas "plus recent", mais avec le
// canal beta active c'est un changement de canal volontaire qu'il faut
// proposer a l'utilisateur (et inversement pour le retour stable).
function isSameNumericDifferentChannel(a, b) {
  if (String(a) === String(b)) return false;
  return getVersionChannel(a) !== getVersionChannel(b) && compareLauncherNumeric(a, b) === 0;
}

function isBetaTesterEnabled() {
  try {
    return loadConfigNormalized().betaTester === true;
  } catch {
    return false;
  }
}

function applyUpdateChannelToAutoUpdater() {
  try {
    autoUpdater.allowPrerelease = isBetaTesterEnabled();
  } catch {}
}

// Recupere les releases GitHub (stables + pre-releases) et en deduit
// la derniere stable et la derniere beta/alpha disponibles.
let launcherReleasesCache = null;
let launcherReleasesFetchedAt = 0;
let launcherReleasesRequest = null;
async function fetchLauncherReleases() {
  if (launcherReleasesCache && Date.now() - launcherReleasesFetchedAt < 60000) return launcherReleasesCache;
  if (launcherReleasesRequest) return launcherReleasesRequest;
  const url = `https://api.github.com/repos/${GITHUB_OWNER_LAUNCHER}/${GITHUB_REPO_LAUNCHER}/releases?per_page=100`;
  const fetchReleases = (token) => new Promise((resolve, reject) => {
    const headers = { Accept: "application/vnd.github+json", "User-Agent": `YapapouaiyeLauncher/${app.getVersion()}` };
    if (token) headers.Authorization = `Bearer ${token}`;
    const request = https.get(url, { headers }, response => {
      let body = "";
      response.on("data", chunk => { body += chunk; });
      response.on("error", reject);
      response.on("end", () => {
        // Public releases remain accessible when a developer token has expired.
        if (response.statusCode === 401 && token) return fetchReleases("").then(resolve, reject);
        if (response.statusCode !== 200) return reject(new Error(`GitHub HTTP ${response.statusCode}. Réessayez la vérification plus tard.`));
        try {
          const releases = JSON.parse(body);
          if (!Array.isArray(releases)) throw new Error("Réponse GitHub invalide.");
          resolve(releases);
        } catch (error) { reject(error); }
      });
    });
    request.setTimeout(15000, () => request.destroy(new Error("GitHub ne répond pas. Vérifiez votre connexion et réessayez.")));
    request.on("error", reject);
  });
  launcherReleasesRequest = fetchReleases(process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "")
    .then(releases => { launcherReleasesCache = releases; launcherReleasesFetchedAt = Date.now(); return releases; })
    .finally(() => { launcherReleasesRequest = null; });
  return launcherReleasesRequest;
}

async function fetchLauncherUpdateTargets() {
  const current = app.getVersion();
  const currentChannel = getVersionChannel(current);
  const releases = await fetchLauncherReleases();
  let latestStable = null;
  let latestBeta = null;
  for (const r of releases) {
    if (!r || r.draft) continue;
    const tag = String(r.tag_name || r.name || "").replace(/^v/i, "");
    if (!parseLauncherVersion(tag)) continue;
    const pre = r.prerelease === true || isPrereleaseVersion(tag);
    const entry = { version: tag, name: r.name || tag, body: r.body || "", url: r.html_url || "", prerelease: pre, publishedAt: r.published_at || null };
    if (pre) {
      if (!latestBeta || isLauncherVersionNewer(tag, latestBeta.version)) latestBeta = entry;
    } else {
      if (!latestStable || isLauncherVersionNewer(tag, latestStable.version)) latestStable = entry;
    }
  }

  const betaAvailable = !!(
    latestBeta &&
    (isLauncherVersionNewer(latestBeta.version, current) ||
      isSameNumericDifferentChannel(latestBeta.version, current))
  );
  // Retour stable : on est sur une beta/alpha et une stable existe
  // (meme si la stable est numeriquement inferieure a la beta, on propose le retour).
  const canReturnToStable = currentChannel !== "stable" && !!latestStable && latestStable.version !== current;
  const stableUpdateAvailable = !!(latestStable && isLauncherVersionNewer(latestStable.version, current));

  return {
    current,
    currentChannel,
    betaEnabled: isBetaTesterEnabled(),
    latestStable,
    latestBeta,
    betaAvailable,
    stableUpdateAvailable,
    canReturnToStable,
  };
}

ipcMain.handle("check-for-updates", async () => {
  try {
    // Canal Beta Tester : applique le flag avant chaque verification manuelle.
    applyUpdateChannelToAutoUpdater();
    // Use checkForUpdates() for manual checks (gives better control over events)
    // checkForUpdatesAndNotify() is only used at startup
    const result = await autoUpdater.checkForUpdates();
    const latestVersion = result?.updateInfo?.version || null;
    const currentVersion = app.getVersion();

    console.log(`[UpdateCheck] Current: ${currentVersion}, Latest: ${latestVersion} (beta=${isBetaTesterEnabled()})`);

    // Custom comparison tolerant to the "X.Y.Z-N" notation (ex: 1.5.7-1 > 1.5.7),
    // so clients on plain 1.5.7 still receive the update.
    const updateAvailable = latestVersion
      ? isLauncherVersionNewer(latestVersion, currentVersion)
      : false;

    let targets = null;
    try { targets = await fetchLauncherUpdateTargets(); } catch {}

    return {
      success: true,
      version: latestVersion,
      updateAvailable,
      currentVersion,
      currentChannel: getVersionChannel(currentVersion),
      betaEnabled: isBetaTesterEnabled(),
      latestStable: targets?.latestStable || null,
      latestBeta: targets?.latestBeta || null,
      betaAvailable: targets?.betaAvailable || false,
      canReturnToStable: targets?.canReturnToStable || false,
    };
  } catch (err) {
    console.error("[AutoUpdater] Manual check failed:", err.message);

    // Handle "No files provided" error gracefully
    let errorMsg = err.message;
    if (errorMsg.includes("No files provided")) {
      errorMsg = "Mise a jour disponible mais aucun fichier d'installation n'a ete uploadÃ©. Contactez l'administrateur.";
    }

    return { success: false, error: errorMsg };
  }
});

// ============================================================
// Canal Beta Tester : proposition "-beta" / "-alpha" + retour stable
// - get-update-channel : etat complet (version courante, canal, cibles)
// - set-beta-tester : active/desactive l'option (persiste en config)
// - check-beta-update : verif GitHub SANS telecharger (proposition UI)
// - install-update-version : telecharge+installe la cible (beta ou stable,
//   y compris downgrade vers stable grace a allowDowngrade=true)
// ============================================================
ipcMain.handle("get-update-channel", async () => {
  try {
    const targets = await fetchLauncherUpdateTargets();
    return { success: true, ...targets };
  } catch (err) {
    return { success: false, error: err.message, current: app.getVersion(), currentChannel: getVersionChannel(app.getVersion()), betaEnabled: isBetaTesterEnabled() };
  }
});

ipcMain.handle("set-beta-tester", async (_, enabled) => {
  const value = enabled === true;
  saveConfig({ betaTester: value });
  applyUpdateChannelToAutoUpdater();
  console.log(`[BetaChannel] Beta Tester ${value ? "ACTIVE" : "DESACTIVE"}`);
  try {
    const targets = await fetchLauncherUpdateTargets();
    return { success: true, betaEnabled: value, ...targets };
  } catch {
    return { success: true, betaEnabled: value, current: app.getVersion(), currentChannel: getVersionChannel(app.getVersion()) };
  }
});

ipcMain.handle("check-beta-update", async () => {
  try {
    const targets = await fetchLauncherUpdateTargets();
    return { success: true, ...targets };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("install-update-version", async (_, targetVersion) => {
  try {
    const version = normalizeVersion(targetVersion);
    if (!parseLauncherVersion(version)) throw new Error("Version demandée invalide.");
    if (requestedUpdateVersion) throw new Error("Une installation est déjà en cours.");
    return await installRequestedUpdate(autoUpdater, version, value => { requestedUpdateVersion = value; });
  } catch (err) {
    console.error("[BetaChannel] install-update-version failed:", err.message);
    return { success: false, error: err.message };
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
ipcMain.on("overlay-options", (_, opts) => {
  gameOptions = { ...gameOptions, ...opts };
  console.log("[Overlay] Options mises Ã  jour :", gameOptions);
});

// ============================================================
// Config IPC
// ============================================================
ipcMain.handle("get-system-ram", () => Math.floor(os.totalmem() / (1024 * 1024 * 1024)));
ipcMain.handle("get-config", () => loadConfigNormalized());
ipcMain.handle("save-config", (_, config) => {
  if (config?.onboardingCompleted === true) {
    const blocked = invitationGate.required();
    if (blocked) return blocked;
  }
  return saveConfig(config) ? { success: true } : { success: false, error: "Impossible d’enregistrer la configuration." };
});
ipcMain.handle("get-invitation-status", () => {
  try { return invitationGate.status(); }
  catch { return { accepted: false, error: "État d’invitation illisible." }; }
});
ipcMain.handle("verify-invitation", (_, code) => invitationGate.verify(code));
ipcMain.handle("get-client-mods", () => getClientModsConfig());
ipcMain.handle("save-client-mods", (_, mods) => {
  const updated = saveClientModsConfig(mods);
  return { success: true, clientMods: updated };
});
ipcMain.handle("apply-client-mods", (_, mods) => {
  // Fusionne avec la config stockee : un patch partiel ne doit jamais
  // rebasculer les autres modules sur leurs defauts au lancement.
  const current = getClientModsConfig();
  const merged = { ...current };
  for (const key of Object.keys(DEFAULT_CLIENT_MODS)) {
    if (key === "hudPositions") {
      merged.hudPositions = {
        ...(current.hudPositions || {}),
        ...((mods || {}).hudPositions || {})
      };
    } else {
      merged[key] = { ...(current[key] || {}), ...(((mods || {})[key]) || {}) };
    }
  }
  syncClientOptionsToMinecraft(merged);
  return { success: true };
});

ipcMain.handle("apply-keyboard-layout", async (_, layout) => {
  const chosen = (layout === "qwerty") ? "qwerty" : "azerty";
  saveConfig({ keyboardLayout: chosen });
  ensureNeoForgeFmlConfig();
  const res = applyKeyboardLayoutToOptionsTxt(chosen, true);
  return { success: true, layout: chosen, ...res };
});

// First-launch-after-update detection: returns true when the stored
// "last seen version" differs from the running app version.
ipcMain.handle("check-first-launch-after-update", () => {
  const config = loadConfig();
  const lastSeen = config.lastSeenVersion || null;
  const current = app.getVersion();
  return { isFirstLaunchAfterUpdate: lastSeen !== current, version: current };
});

// Marks the current version as "seen" so the popup shows only once.
ipcMain.handle("mark-version-seen", () => {
  saveConfig({ lastSeenVersion: app.getVersion() });
  return { success: true };
});
ipcMain.handle("select-java-path", async () => {
  const { dialog } = require("electron");
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Selectionner l'executable Java",
    properties: ["openFile"],
    filters: process.platform === "win32" ? [
      { name: "Executables", extensions: ["exe"] },
      { name: "All Files", extensions: ["*"] }
    ] : [{ name: "Tous les fichiers (java)", extensions: ["*"] }]
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return { success: true, path: result.filePaths[0] };
  }
  return { success: false };
});

// Custom Theme File Import / Export
ipcMain.handle("export-custom-theme", async (_, theme) => {
  try {
    const { dialog } = require("electron");
    const defaultName = ((theme && theme.name) || "mon-theme").toLowerCase().replace(/[^a-z0-9_-]/g, "-") + ".json";
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Exporter le ThÃ¨me PersonnalisÃ©",
      defaultPath: defaultName,
      filters: [{ name: "ThÃ¨me Launcher (*.json)", extensions: ["json"] }]
    });
    if (!result.canceled && result.filePath) {
      fs.writeFileSync(result.filePath, JSON.stringify(theme, null, 2), "utf-8");
      return { success: true, filePath: result.filePath };
    }
    return { success: false };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("import-custom-theme-file", async () => {
  try {
    const { dialog } = require("electron");
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Importer un ThÃ¨me PersonnalisÃ©",
      properties: ["openFile"],
      filters: [{ name: "ThÃ¨me Launcher (*.json)", extensions: ["json"] }]
    });
    if (!result.canceled && result.filePaths.length > 0) {
      const content = fs.readFileSync(result.filePaths[0], "utf-8");
      return { success: true, content };
    }
    return { success: false };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("select-image-file", async () => {
  try {
    const { dialog } = require("electron");
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "SÃ©lectionner une Image (Fond, BanniÃ¨re, etc.)",
      properties: ["openFile"],
      filters: [{ name: "Images (*.png, *.jpg, *.jpeg, *.webp, *.gif)", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }]
    });
    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      const ext = path.extname(filePath).slice(1).toLowerCase();
      const mime = ext === "jpg" ? "jpeg" : ext;
      const buffer = fs.readFileSync(filePath);
      const dataUri = `data:image/${mime};base64,${buffer.toString("base64")}`;
      return { success: true, dataUri, filePath };
    }
    return { success: false };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("select-audio-file", async () => {
  try {
    const { dialog } = require("electron");
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "SÃ©lectionner un Fichier Audio (SFX)",
      properties: ["openFile"],
      filters: [{ name: "Audio (*.mp3, *.wav, *.ogg)", extensions: ["mp3", "wav", "ogg"] }]
    });
    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      const ext = path.extname(filePath).slice(1).toLowerCase();
      const mime = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg' }[ext];
      if (!mime) return { success: false, error: 'Format non pris en charge : utilisez MP3, WAV ou OGG.' };
      if (fs.statSync(filePath).size > 5 * 1024 * 1024) {
        return { success: false, error: 'Le fichier audio dépasse la limite de 5 Mo.' };
      }
      const buffer = fs.readFileSync(filePath);
      if (buffer.length > 5 * 1024 * 1024) return { success: false, error: 'Le fichier audio dépasse la limite de 5 Mo.' };
      const dataUri = `data:${mime};base64,${buffer.toString("base64")}`;
      return { success: true, dataUri, filePath };
    }
    return { success: false };
  } catch (err) {
    return { success: false, error: err.message };
  }
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
  const blocked = invitationGate.required();
  if (blocked) return blocked;
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
  const blocked = invitationGate.required();
  if (blocked) return blocked;
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
  const blocked = invitationGate.required();
  if (blocked) return blocked;
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

      // Refresh failed â€” token is expired, force re-authentication
      // Do NOT use expired token: it causes "Session non valide" on online servers
      console.warn("[AutoLogin] Microsoft token refresh failed for", saved.name, "â€” re-auth required");
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

        // Refresh failed â€” skip this account, token is expired
        console.warn("[AutoLogin] Microsoft token refresh failed for", saved.name, "â€” skipping");
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
      skin: skinForAccount(a),
      active: i === data.activeIndex,
    })),
    activeIndex: data.activeIndex,
    sessions: gameSessions.list(),
  };
});

ipcMain.handle("get-game-sessions", () => gameSessions.list());

ipcMain.handle("close-game-session", async (_, id) => {
  const session = gameSessions.list().find(item => item.id === id);
  const launcher = gameLaunchers.get(id);
  if (!session || !launcher || !['disconnected', 'stopping'].includes(session.state)) {
    return { success: false, error: "Aucune fenêtre bloquée disponible pour cette action." };
  }
  gameSessions.closing(id);
  try {
    await launcher.requestClose();
    await launcher.waitForExit();
    return { success: true };
  } catch (error) {
    if (gameLaunchers.get(id) === launcher) {
      gameSessions.closeFailed(id);
    }
    return { success: false, error: error.message };
  }
});

ipcMain.handle("stop-network-session", async (_, id) => {
  if (!gameSessions.list().some(session => session.id === id && (session.mode === "network" || session.relay))) {
    return { success: false, error: "Session réseau introuvable." };
  }
  // Mark cancellation synchronously, even before a worker exists (maintenance
  // and Microsoft refresh can still be awaiting network responses).
  gameSessions.stopping(id);
  await networkSessions.stop(id);
  if (!gameLaunchers.has(id)) gameSessions.finish(id);
  return { success: true };
});

// Switch to a different saved account
ipcMain.handle("switch-account", async (_, index) => {
  const blocked = invitationGate.required();
  if (blocked) return blocked;
  const data = loadAccounts();
  if (!Number.isInteger(index) || index < 0 || index >= data.accounts.length) return { success: false };

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
        const freshData = loadAccounts();
        const freshIndex = freshData.accounts.findIndex(a => accountKey(a.uuid) === accountKey(account.uuid));
        if (freshIndex < 0) return { success: false, error: "Ce compte a été supprimé." };
        authAccount = refreshed;
        freshData.accounts[freshIndex] = refreshed;
        freshData.activeIndex = freshIndex;
        saveAccounts(freshData);
        return { success: true, username: refreshed.name, uuid: refreshed.uuid };
      }
    } catch {}

    // Refresh failed â€” do NOT use expired token
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
  if (!Number.isInteger(index) || index < 0 || index >= data.accounts.length) return { success: false };
  if (gameSessions.list().some(s => accountKey(s.accountUuid) === accountKey(data.accounts[index].uuid))) {
    return { success: false, error: "Fermez le jeu de ce compte avant de le supprimer." };
  }

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
  const blocked = invitationGate.required();
  if (blocked) return blocked;
  // Snapshot identity before any await: changing the selected account must never
  // change a launch already in progress or overwrite another account's token.
  const requestedUuid = options?.accountUuid || authAccount?.uuid;
  const accountsData = loadAccounts();
  const savedAccount = accountsData.accounts.find(a => accountKey(a.uuid) === accountKey(requestedUuid));
  if (!savedAccount) return { success: false, error: "Compte introuvable. Reconnectez-vous." };
  let launchAccount = structuredClone(savedAccount);
  const mode = options?.mode ?? "game";
  if (mode !== "game") return { success: false, error: "Utilisez Mettre en veille dans le menu Échap du jeu." };
  const primaryUuid = loadConfig().primaryAccountUuid || accountsData.accounts[accountsData.activeIndex]?.uuid || accountsData.accounts[0]?.uuid || launchAccount.uuid;
  const requestedServerId = options?.serverId || loadConfig().activeServerId || "adoserv2";
  const targetServer = getAllServers().find(s => s.id === requestedServerId && s.enabled !== false);
  if (!targetServer) return { success: false, error: "Serveur introuvable ou désactivé." };
  let session;
  try {
    session = gameSessions.begin(launchAccount, targetServer, options?.ram ?? 4, os.totalmem() / (1024 ** 3), mode);
  } catch (error) {
    return { success: false, error: error.message };
  }
  let spawned = false;
  try {

  // 0. Maintenance distante (espace admin du site) : bloque tout lancement.
  // Les paramètres restent accessibles, seuls JOUER + Mods sont coupés côté renderer.
  // Plafonné à 3s : en cas de site injoignable, le cache local décide.
  try {
    const maint = await withTimeout(getFreshMaintenanceState(), 3000).catch(() => getMaintenanceState());
    if (maint.maintenance) {
      console.log("[Maintenance] Lancement bloqué : mode maintenance actif.");
      return { success: false, code: "LAUNCH_MAINTENANCE", error: maint.message || "Launcher en maintenance." };
    }
  } catch {}

  // 0b. Codes d'accès serveur (définis dans l'espace admin) : à taper dans l'ordre.
  if (session.state === "stopping") return { success: false, code: "LAUNCH_CANCELLED", error: "Connexion annulée." };
  try {
    const requestedId = targetServer.id;
    const target = getRemoteServerById(requestedId);
    if (target && target.codesRequired && !sessionVerifiedServers.has(target.id)) {
      console.log(`[ServerCodes] Lancement bloqué : codes requis pour ${target.id}.`);
      return {
        success: false,
        code: "SERVER_CODES_REQUIRED",
        serverId: target.id,
        serverName: target.name,
        codesCount: target.codesCount || 0,
        error: "Codes d'accès requis pour ce serveur.",
      };
    }
  } catch {}

  // Verrou par mot de passe : bloque le lancement si le PC n'est ni
  // retenu (empreinte carte mère) ni déverrouillé ponctuellement.
  try {
    const gate = checkLaunchLockForGame();
    if (!gate.allowed) {
      console.log("[LaunchLock] Lancement bloqué : mot de passe requis.");
      return { success: false, error: "Mot de passe requis pour lancer le jeu.", code: "LAUNCH_LOCKED" };
    }
  } catch {}

    const { version, loader, ram } = options || {};
    const activeLoader = normalizeLoader(targetServer.defaultLoader || loader, targetServer);
    const consumeUnlock = () => {
      try {
        const lockAfter = loadLaunchLock();
        if (lockAfter.enabled && !isTrustedPC(lockAfter)) launchUnlockedAt = 0;
      } catch {}
    };

    // Save RAM & selected server to config
    saveConfig({ ...(mode === "game" ? { ram } : {}), activeServerId: targetServer.id });

    // Force refresh Microsoft token before launch to avoid "Session non valide"
    if (isMicrosoftAccount(launchAccount)) {
      console.log("[Launch] Refreshing Microsoft token before launch...");
      try {
        const microsoft = new Microsoft();
        const refreshed = await microsoft.refresh(launchAccount);
        if (session.state === "stopping") return { success: false, code: "LAUNCH_CANCELLED", error: "Connexion annulée." };
        if (refreshed && !refreshed.error) {
          if (!refreshed.meta) refreshed.meta = {};
          if (!refreshed.meta.type) refreshed.meta.type = "microsoft";
          const data = loadAccounts();
          const index = data.accounts.findIndex(a => accountKey(a.uuid) === accountKey(launchAccount.uuid));
          if (index >= 0) {
            data.accounts[index] = refreshed;
            saveAccounts(data);
          }
          if (accountKey(authAccount?.uuid) === accountKey(launchAccount.uuid)) authAccount = refreshed;
          launchAccount = refreshed;
          console.log("[Launch] Microsoft token refreshed successfully");
        } else {
          console.error("[Launch] Token refresh returned error, session may be invalid");
          return { success: false, error: "Session expirÃ©e. Reconnecte-toi via Microsoft." };
        }
      } catch (refreshErr) {
        if (session.state === "stopping") return { success: false, code: "LAUNCH_CANCELLED", error: "Connexion annulée." };
        console.error("[Launch] Token refresh failed:", refreshErr.message);
        return { success: false, error: "Session expirÃ©e. Reconnecte-toi via Microsoft." };
      }
    }

    const launcher = new ManagedLaunch();
    // Ensure servers are in multiplayer list
    if (!loadConfig().primaryAccountUuid) saveConfig({ primaryAccountUuid: primaryUuid });
    const profile = prepareAccountInstance(gameDir, launchAccount.uuid, primaryUuid);
    const targetGameDir = profile.directory;
    ensureServerInList(targetGameDir);

    // Sync Lunar client options (Night Vision gamma, NoFog, etc.)
    syncClientOptionsToMinecraft(undefined, targetGameDir);

    // Load full config for user settings
    const config = loadConfig();

    // Vérifie si options.txt a fullscreen:true ou si config.fullscreen est true
    let isFullscreen = !!config.fullscreen;
    const optionsPath = path.join(targetGameDir, "options.txt");
    if (fs.existsSync(optionsPath)) {
      try {
        const optText = fs.readFileSync(optionsPath, "utf-8");
        const match = optText.match(/^fullscreen:(true|false)/m);
        if (match) {
          isFullscreen = match[1] === "true";
        }
      } catch {}
    }

    // Apply resolution from config
    const resolution = config.resolution || "1280x720";
    const [screenW, screenH] = resolution.split("x").map(Number);

    const gameVersion = version || getServerGameVersion(targetServer);
    const gameArgs = getServerLaunchArgs(gameVersion, targetServer);
    if (isFullscreen) {
      gameArgs.push("--fullscreen");
    }

    const launchConfig = {
      authenticator: launchAccount,
      path: gameDir,
      instance: profile.instance,
      version: gameVersion,
      memory: { max: `${ram || 4}G`, min: "256M" },
      // Si fullscreen est actif, ne pas forcer width/height pour ne pas casser le mode plein écran
      screen: isFullscreen
        ? { fullscreen: true }
        : { width: screenW || 1280, height: screenH || 720, fullscreen: false },
      java: config.javaPath ? { path: config.javaPath } : { type: "jre" },
      GAME_ARGS: gameArgs,
    };

    if (config.jvmArgs) {
      launchConfig.JVM_ARGS = config.jvmArgs.split(" ").filter(Boolean);
    }
    if (activeLoader === "neoforge" && gameSessions.list().some(other => other.id !== session.id && other.mode !== "network" && other.state === "running")) {
      launchConfig.JVM_ARGS = [...(launchConfig.JVM_ARGS || []), "-Dnexlux.standbyOnJoin=true"];
    }

    if (activeLoader && activeLoader !== "vanilla") {
      launchConfig.loader = { type: activeLoader, build: "latest", enable: true };
    }

    const send = (ch, d) => sendToRenderer(ch, d);

    // Stage the active server's mods (NeoForge + Fabric together) into the game mods folder
    send("progress", { type: "mod-sync", value: `Préparation des mods de ${targetServer.name}...` });
    const staged = stageModsForLaunch(targetServer.id, launchConfig.version, activeLoader, path.join(targetGameDir, "mods"));
    const stagedCount = staged?.staged ?? 0;
    const stagedFailed = staged?.failed ?? 0;
    if (stagedFailed > 0) throw new Error(`${stagedFailed} mod(s) n'ont pas pu être préparés.`);
    console.log(`[Launch] ${targetServer.name} (${activeLoader}) mods staged (${stagedCount} fichier(s), ${stagedFailed} échec(s)). Setting up game launch pipeline...`);
    if (stagedCount === 0) {
      console.warn(`[Launch] Aucun mod installé pour ${targetServer.id} — le jeu démarrera sans mods. Pensez à synchroniser depuis l'onglet Mods.`);
      send("progress", { type: "mod-sync", value: "Aucun mod installé — synchronisez depuis l'onglet Mods." });
    } else if (stagedFailed > 0) {
      console.warn(`[Launch] ${stagedFailed} mod(s) non copiés (fichiers verrouillés ?) : ${(staged.failedNames || []).join(", ")}`);
      send("progress", { type: "mod-sync", value: `${stagedFailed} mod(s) non copiés — fermez le jeu déjà ouvert puis relancez.` });
    }

    launcher.on("extract", (extract) => send("progress", { type: "extract", value: extract }));
    launcher.on("progress", (progress, total) => {
      let percent = 0;
      if (Array.isArray(progress)) {
        const current = Number(progress[0]) || 0;
        const tot = Number(progress[1]) || Number(total) || 0;
        percent = tot > 0 ? (current / tot) * 100 : (current <= 100 ? current : 100);
      } else if (typeof progress === "object" && progress !== null) {
        const current = Number(progress.task || progress.current || progress.value || progress.downloaded) || 0;
        const tot = Number(progress.total || progress.size || total) || 0;
        percent = tot > 0 ? (current / tot) * 100 : (current <= 100 ? current : 100);
      } else if (typeof progress === "number") {
        const tot = Number(total) || 0;
        if (tot > 0) {
          percent = (progress / tot) * 100;
        } else if (progress <= 100) {
          percent = progress;
        } else {
          percent = 100;
        }
      }
      const cleanPercent = Math.min(100, Math.max(0, Math.round(percent)));
      send("progress", { type: "download", value: cleanPercent });
    });
    launcher.on("speed", (speed) => send("progress", { type: "speed", value: speed }));
    launcher.on("estimated", (time) => send("progress", { type: "estimated", value: time }));
    launcher.on("patch", (patch) => send("progress", { type: "patch", value: patch }));
    let gameOutputTail = "";
    launcher.on("data", (data) => {
      gameOutputTail = (gameOutputTail + String(data)).slice(-64 * 1024);
      send("game-log", data);
      if (config.minimizeOnLaunch && mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMinimized()) {
        mainWindow.minimize();
      }
    });
    launcher.on("close", (code) => {
      logToFile("GAME", `Session ${session.id} fermée (code ${code}). Dernières sorties :\n${gameOutputTail}`);
      gameLaunchers.delete(session.id);
      const keepConnection = networkSessions.isRelay(session.id) && networkSessions.relayStatus(session.id)?.canDetach && networkSessions.relayStatus(session.id)?.connected;
      if (keepConnection) gameSessions.background(session.id);
      else { void networkSessions.stop(session.id); gameSessions.finish(session.id); }
      console.log(`[Launch] Game process closed with code ${code}`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.restore();
        mainWindow.focus();
      }
      if (!keepConnection) send("game-closed", { sessionId: session.id, accountName: launchAccount.name, code: code ?? 0 });
      // Synchronise les éventuels changements faits en jeu (positions HUD, fullscreen, etc.)
      try {
        if (profile.instance) return;
        const refreshedMods = getClientModsConfig(targetGameDir);
        saveConfig({ clientMods: refreshedMods });
        send("client-mods-updated", refreshedMods);
        if (fs.existsSync(optionsPath)) {
          const optText = fs.readFileSync(optionsPath, "utf-8");
          const fsMatch = optText.match(/^fullscreen:(true|false)/m);
          if (fsMatch) {
            saveConfig({ fullscreen: fsMatch[1] === "true" });
          }
        }
      } catch {}
    });
    launcher.on("error", (err) => {
      // Only the actual child close releases its Java RAM reservation.
      console.error("[Launch] Game launch error event:", err);
      send("game-error", { sessionId: session.id, accountName: launchAccount.name, error: err?.message || String(err) });
    });

    console.log("[Launch] Calling minecraft-java-core Launch()...");
    launcher.once("spawn", pid => {
      spawned = true; gameLaunchers.set(session.id, launcher);
      gameSessions.running(session.id, pid);
    });
    await launcher.Launch(launchConfig);
    console.log("[Launch] Launch() resolved - game process spawned.");

    // Consomme le déverrouillage ponctuel : sans PC retenu, le prochain
    // lancement redemandera le mot de passe.
    consumeUnlock();

    // Keep session tracking alive when hiding the launcher after launch.
    if (config.closeOnLaunch && mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();

    return { success: true, sessionId: session.id, accountName: launchAccount.name, modsStaged: stagedCount, modsFailed: stagedFailed };
  } catch (error) {
    if (session.state === "stopping") return { success: false, code: "LAUNCH_CANCELLED", error: "Connexion annulée." };
    console.error("Launch error:", error);
    return { success: false, error: error.message };
  } finally {
    if (!spawned) {
      await networkSessions.stop(session.id); gameSessions.finish(session.id);
    }
  }
});

// ============================================================
// Multi-Server IPC Handlers
// ============================================================
ipcMain.handle("get-servers", () => {
  const all = getAllServers();
  const active = getActiveServer();
  return {
    servers: all.map((s) => ({ ...s, gameVersion: getServerGameVersion(s) })),
    activeServerId: active.id,
    activeServer: { ...active, gameVersion: getServerGameVersion(active) },
    launcherConfig: getMaintenanceState(),
  };
});

ipcMain.handle("set-active-server", (_, serverId) => {
  const server = getAllServers({ includeDisabled: true }).find((s) => s.id === serverId);
  if (!server) return { success: false, error: "Serveur introuvable." };
  if (server.enabled === false) return { success: false, error: "Ce serveur est désactivé." };
  saveConfig({ activeServerId: server.id });
  runServerStatusCheck(server);
  return { success: true, activeServer: server };
});

ipcMain.handle("check-server-status", async (_, serverId) => {
  const server = serverId ? getServerById(serverId) : getActiveServer();
  const online = await getServerStatus(server);
  return { online, ip: server.displayIp, serverId: server.id, serverName: server.name };
});

// ============================================================
// Remote launcher state (admin site) : maintenance + codes d'accès
// ============================================================
ipcMain.handle("get-launcher-config", () => {
  // Réponse immédiate sur le cache + rafraîchissement en tâche de fond
  // (le garde-fou faisant foi est dans "launch-game", plafonné).
  pollRemoteStateOnce().catch(() => {});
  return { success: true, ...getMaintenanceState() };
});

ipcMain.handle("refresh-remote-servers", async () => {
  try {
    return { success: true, ...await pollRemoteStateOnce() };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("check-server-access", (_, serverId) => {
  const target = getRemoteServerById(serverId || loadConfig().activeServerId || "adoserv2");
  if (!target) return { codesRequired: false, codesCount: 0, verified: false, serverId: null };
  return {
    codesRequired: Boolean(target.codesRequired),
    codesCount: Number(target.codesCount) || 0,
    verified: sessionVerifiedServers.has(target.id),
    serverId: target.id,
    serverName: target.name,
  };
});

ipcMain.handle("verify-server-codes", async (_, payload) => {
  const serverId = String(payload?.serverId || "").trim();
  const codes = Array.isArray(payload?.codes) ? payload.codes.map((c) => String(c ?? "")) : [];
  const target = getRemoteServerById(serverId);
  if (!target) return { success: false, valid: false, error: "Serveur introuvable." };
  if (!target.codesRequired) {
    sessionVerifiedServers.add(target.id);
    return { success: true, valid: true, codesRequired: false, serverId: target.id };
  }
  for (const base of serverVerifyApiCandidates()) {
    try {
      const res = await httpPostJson(base, { serverId: target.id, codes });
      if (res && res.ok) {
        if (res.valid) sessionVerifiedServers.add(target.id);
        return {
          success: true,
          valid: Boolean(res.valid),
          codesRequired: true,
          codesCount: Number(res.codesCount ?? target.codesCount) || 0,
          serverId: target.id,
        };
      }
    } catch (err) {
      console.warn(`[ServerCodes] Vérification injoignable ${base}:`, err.message);
    }
  }
  return { success: false, valid: false, error: "Vérification impossible : site injoignable (hors-ligne ?)." };
});

// ============================================================
// Mods
// ============================================================
ipcMain.handle("get-mods", async (_, serverId) => {
  try {
    const activeServer = serverId ? getServerById(serverId) : getActiveServer();
    const serverModsDir = getServerModsDir(activeServer.id);
    const customMods = listJarFiles(customModsDir);

    // Source de vérité locale : ce qui est réellement installé pour ce serveur.
    // (Le listing distant B2/Gitea sert uniquement à la synchronisation,
    // pas à l'affichage — sinon la liste ment quand on est hors-ligne.)
    let names = listJarFiles(serverModsDir);

    // AdoServ67 / B2 : afficher uniquement les mods installés.
    // Les jars de mods-custom copiés dans le dossier serveur sont déjà inclus.
    if (activeServer?.modsSource?.type !== "b2") {
      names = [...new Set([...names, ...customMods])];
    }
    names.sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
    return {
      success: true,
      mods: names,
      customMods,
      loader: normalizeLoader(null, activeServer),
      serverId: activeServer.id,
      serverName: activeServer.name,
      serverModsDir,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("get-launcher-dir", (_, serverId) => {
  const activeServer = serverId ? getServerById(serverId) : getActiveServer();
  return { modsDir, gameDir, launcherDir, customModsDir, serverModsDir: getServerModsDir(activeServer.id) };
});

ipcMain.handle("sync-mods", async (_, serverId) => {
  try {
    const targetServer = serverId ? getServerById(serverId) : getActiveServer();
    const result = await syncModsFromRemote(targetServer);
    // Propager l'erreur réseau : avant, on renvoyait success:true même si
    // Gitea/B2 était injoignable, le launcher affichait "synchronisé" à tort.
    if (!result || result.error) {
      const localCount = listJarFiles(getServerModsDir(targetServer.id)).length;
      return { success: false, error: (result && result.error) || "Synchronisation impossible.", count: localCount, serverId: targetServer.id };
    }
    const serverModsDir = getServerModsDir(targetServer.id);
    const activeMods = listJarFiles(serverModsDir);
    return { success: true, count: result.count ?? activeMods.length, downloaded: result.downloaded || 0, removed: result.removed || 0, serverId: result.serverId || targetServer.id, repo: result.repo || "" };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Ouvre le VRAI dossier où les mods du serveur sont installés
// (avant : "Dossier Mods" ouvrait seulement mods-custom, vide après sync).
ipcMain.handle("open-server-mods", async (_, serverId) => {
  try {
    const targetServer = serverId ? getServerById(serverId) : getActiveServer();
    const dir = getServerModsDir(targetServer.id);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    shell.openPath(dir);
    return { success: true, path: dir };
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

ipcMain.handle("get-window-state", () => {
  return { isMaximized: mainWindow ? mainWindow.isMaximized() : false };
});

// ============================================================
// Verrouillage par mot de passe (lancement du jeu)
// ============================================================
ipcMain.handle("get-launch-lock-status", () => {
  try {
    const lock = loadLaunchLock();
    const trusted = isTrustedPC(lock);
    return {
      success: true,
      enabled: !!lock.enabled,
      hasPassword: !!(lock.hash && lock.salt),
      isTrusted: trusted,
      trustedAt: lock.trustedAt || null,
      trustedDeviceName: lock.trustedDeviceName || null,
      // Changement de carte mère / PC différent : l'empreinte enregistrée
      // ne correspond plus -> on signale qu'il faudra re-valider.
      needsReauth: !!lock.enabled && !!lock.trustedHwidHash && !trusted,
      lockedUntil: launchLockFails.lockUntil > Date.now() ? launchLockFails.lockUntil : 0,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("set-launch-password", (_, payload) => {
  try {
    const password = String(payload?.password || "");
    const currentPassword = payload?.currentPassword !== undefined ? String(payload.currentPassword) : null;
    if (password.length < 4) return { success: false, error: "Le mot de passe doit contenir au moins 4 caractères." };
    if (password.length > 128) return { success: false, error: "Mot de passe trop long (128 caractères max)." };
    const nodeCrypto = require("crypto");
    const existing = loadLaunchLock();
    // Changement de mot de passe : l'ancien est exigé.
    if (existing.hash && existing.salt) {
      if (!currentPassword) return { success: false, error: "Mot de passe actuel requis." };
      if (!verifyLaunchPasswordHash(currentPassword, existing)) return { success: false, error: "Mot de passe actuel incorrect." };
    }
    const salt = nodeCrypto.randomBytes(16).toString("hex");
    const iterations = 120000;
    const hash = hashLaunchPassword(password, salt, iterations);
    const now = new Date().toISOString();
    const next = {
      enabled: true,
      salt,
      hash,
      iterations,
      createdAt: existing.createdAt || now,
      updatedAt: now,
      // Nouveau mot de passe = on oublie l'ancien PC retenu par sécurité.
      trustedHwidHash: null,
      trustedAt: null,
      trustedDeviceName: null,
    };
    saveLaunchLock(next);
    launchUnlockedAt = 0;
    launchLockFails = { count: 0, lockUntil: 0 };
    console.log("[LaunchLock] Mot de passe défini, verrou activé.");
    return { success: true, enabled: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("verify-launch-password", (_, payload) => {
  try {
    const password = String(payload?.password || "");
    const rememberPC = !!payload?.rememberPC;
    const now = Date.now();
    if (launchLockFails.lockUntil > now) {
      const retryIn = Math.ceil((launchLockFails.lockUntil - now) / 1000);
      return { success: false, error: `Trop de tentatives. Réessayez dans ${retryIn}s.`, retryIn, code: "RATE_LIMITED" };
    }
    const lock = loadLaunchLock();
    if (!lock.enabled || !lock.hash) return { success: false, error: "Aucun verrou configuré." };
    if (!password) return { success: false, error: "Mot de passe requis." };
    if (!verifyLaunchPasswordHash(password, lock)) {
      launchLockFails.count += 1;
      if (launchLockFails.count >= LAUNCH_LOCK_MAX_TRIES) {
        launchLockFails.lockUntil = Date.now() + LAUNCH_LOCK_BLOCK_MS;
        launchLockFails.count = 0;
        return { success: false, error: "Trop de tentatives. Réessayez dans 30s.", code: "RATE_LIMITED", retryIn: 30 };
      }
      const left = LAUNCH_LOCK_MAX_TRIES - launchLockFails.count;
      return { success: false, error: `Mot de passe incorrect. (${left} essai(s) restant(s))` };
    }
    // Succès : reset anti-bruteforce + déverrouillage ponctuel.
    launchLockFails = { count: 0, lockUntil: 0 };
    launchUnlockedAt = Date.now();
    let trusted = isTrustedPC(lock);
    // "Retenir ce PC" : (ré)enregistre l'empreinte de la carte mère
    // actuelle — y compris après un changement de carte mère.
    if (rememberPC) {
      const hwidHash = getCurrentHwidHash();
      if (!hwidHash) return { success: false, error: "Impossible de lire l'identifiant de ce PC." };
      const wasDifferent = !!lock.trustedHwidHash && lock.trustedHwidHash !== hwidHash;
      lock.trustedHwidHash = hwidHash;
      lock.trustedAt = new Date().toISOString();
      try { lock.trustedDeviceName = os.hostname(); } catch { lock.trustedDeviceName = "Ce PC"; }
      lock.updatedAt = new Date().toISOString();
      saveLaunchLock(lock);
      trusted = true;
      console.log(`[LaunchLock] PC retenu (empreinte carte mère enregistrée${wasDifferent ? " — nouvelle carte mère" : ""}).`);
    }
    return { success: true, trusted };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("disable-launch-lock", (_, payload) => {
  try {
    const password = String(payload?.password || "");
    const lock = loadLaunchLock();
    if (!lock.enabled) return { success: true, enabled: false };
    if (!verifyLaunchPasswordHash(password, lock)) return { success: false, error: "Mot de passe incorrect." };
    saveLaunchLock({ enabled: false, salt: null, hash: null, iterations: 120000, createdAt: lock.createdAt || null, updatedAt: new Date().toISOString(), trustedHwidHash: null, trustedAt: null, trustedDeviceName: null });
    launchUnlockedAt = 0;
    console.log("[LaunchLock] Verrou désactivé.");
    return { success: true, enabled: false };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("forget-trusted-pc", (_, payload) => {
  try {
    const lock = loadLaunchLock();
    // Si le verrou est actif, le mot de passe est exigé pour oublier le PC.
    if (lock.enabled && lock.hash) {
      const password = String(payload?.password || "");
      if (!password) return { success: false, error: "Mot de passe requis pour oublier ce PC." };
      if (!verifyLaunchPasswordHash(password, lock)) return { success: false, error: "Mot de passe incorrect." };
    }
    lock.trustedHwidHash = null;
    lock.trustedAt = null;
    lock.trustedDeviceName = null;
    lock.updatedAt = new Date().toISOString();
    saveLaunchLock(lock);
    launchUnlockedAt = 0;
    console.log("[LaunchLock] PC oublié : mot de passe redemandé au prochain lancement.");
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ============================================================
// Boot preload — pré-chargement pendant que le logo (splash) s'affiche.
// L'historique : la fenêtre s'ouvrait puis le renderer lançait en série
// autoLogin (refresh Microsoft lent) + getServers + getMods (réseau B2)
// + release notes → flash "Non connecté" / mods vides pendant 2-5s.
// Désormais le main pré-charge tout en tâche de fond dès le démarrage
// et le renderer peint l'UI correcte dès la 1ère frame via get-initial-state.
// ============================================================
let bootPreloadPromise = null;

function withTimeout(promise, ms) {
  let timer = null;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("boot-timeout")), ms);
  });
  return Promise.race([promise, guard]).finally(() => { if (timer) clearTimeout(timer); });
}

async function refreshAccountForBoot(saved) {
  try {
    const microsoft = new Microsoft();
    const refreshed = await withTimeout(microsoft.refresh(saved), 8000);
    if (refreshed && !refreshed.error) {
      if (!refreshed.meta) refreshed.meta = {};
      if (!refreshed.meta.type) refreshed.meta.type = "microsoft";
      return refreshed;
    }
  } catch {}
  return null;
}

async function runBootPreload() {
  // Config normalisee (defauts garantis) + clientMods resous : le renderer
  // peint le HUD simulateur des la 1ere frame sans 2e appel IPC qui pouvait
  // rater la config enregistree au lancement precedent.
  const config = loadConfigNormalized();
  let clientMods = null;
  try {
    clientMods = getClientModsConfig();
    config.clientMods = clientMods;
  } catch { clientMods = null; }
  const activeServer = getActiveServer();
  const serversPayload = {
    servers: getAllServers().map((s) => ({ ...s, gameVersion: getServerGameVersion(s) })),
    activeServerId: activeServer.id,
    activeServer: { ...activeServer, gameVersion: getServerGameVersion(activeServer) },
    launcherConfig: getMaintenanceState(),
  };

  // Serveurs distants + maintenance (espace admin du site) : rafraîchi au boot,
  // plafonné pour ne pas retarder l'affichage (repli : cache local / valeurs codées en dur).
  const remotePromise = (async () => {
    try {
      await withTimeout(refreshRemoteLauncherState(), 8000);
      const all = getAllServers();
      const active = getActiveServer();
      serversPayload.servers = all.map((s) => ({ ...s, gameVersion: getServerGameVersion(s) }));
      serversPayload.activeServerId = active.id;
      serversPayload.activeServer = { ...active, gameVersion: getServerGameVersion(active) };
      serversPayload.launcherConfig = getMaintenanceState();
      // Évite que le 1er cycle du watcher re-pousse cet état de boot.
      remoteStateSignature = computeRemoteStateSignature();
      return true;
    } catch {
      return false;
    }
  })();

  // Mods locaux du serveur actif (rapide : lecture disque, aucun réseau)
  let bootMods = [];
  try {
    bootMods = listJarFiles(getServerModsDir(activeServer.id));
    bootMods.sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
  } catch { bootMods = []; }

  // Statut serveur en tâche de fond (plafonné pour ne pas retarder l'affichage)
  const statusPromise = (async () => {
    try {
      return await withTimeout(runServerStatusCheck(activeServer), 6000);
    } catch {
      return serverStatusCache[activeServer.id]?.online ?? null;
    }
  })();

  // Auto-login avec refresh Microsoft plafonné (même logique que "auto-login")
  const loginPromise = (async () => {
    const blocked = invitationGate.required();
    if (blocked) return blocked;
    try {
      const data = loadAccounts();
      if (data.activeIndex >= 0 && data.accounts[data.activeIndex]) {
        const saved = data.accounts[data.activeIndex];
        if (isMicrosoftAccount(saved)) {
          const refreshed = await refreshAccountForBoot(saved);
          if (refreshed) {
            authAccount = refreshed;
            data.accounts[data.activeIndex] = refreshed;
            saveAccounts(data);
            return { success: true, username: refreshed.name, uuid: refreshed.uuid };
          }
          return { success: false, error: "Session expiree, reconnecte-toi via Microsoft." };
        }
        if (saved.name && saved.uuid) {
          authAccount = saved;
          return { success: true, username: saved.name, uuid: saved.uuid };
        }
      }
      // Repli : compte offline valide (pas de refresh réseau pour les autres
      // comptes Microsoft ici — le handler auto-login complet reste dispo).
      const data2 = loadAccounts();
      for (let i = 0; i < data2.accounts.length; i++) {
        const s = data2.accounts[i];
        if (!isMicrosoftAccount(s) && s.name && s.uuid) {
          authAccount = s;
          data2.activeIndex = i;
          saveAccounts(data2);
          return { success: true, username: s.name, uuid: s.uuid };
        }
      }
      return { success: false };
    } catch {
      return { success: false };
    }
  })();

  const [online, login] = await Promise.all([
    statusPromise.catch(() => null),
    withTimeout(loginPromise, 9500).catch(() => ({ success: false })),
    remotePromise.catch(() => false),
  ]);

  return {
    config,
    clientMods,
    login: login || { success: false },
    servers: serversPayload,
    serverOnline: typeof online === "boolean" ? online : null,
    serverId: activeServer.id,
    mods: bootMods,
    appVersion: app.getVersion(),
  };
}

ipcMain.handle("get-initial-state", async () => {
  try {
    if (!bootPreloadPromise) bootPreloadPromise = runBootPreload();
    return await bootPreloadPromise;
  } catch {
    return null;
  }
});

ipcMain.handle("open-external", async (_, url) => {
  try {
    if (url && (url.startsWith("https://") || url.startsWith("http://"))) {
      await shell.openExternal(url);
      return { success: true };
    }
    return { success: false, error: "URL non sÃ©curisÃ©e ou invalide" };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("get-latest-release-info", async () => {
  const fallback = {
    version: app.getVersion(),
    notes: `Yapapouaiye Launcher v${app.getVersion()} : Mise à jour automatique opérationnelle.`
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";

  const fetchJson = (url) =>
    new Promise((resolve, reject) => {
      const options = {
        method: "GET",
        headers: {
          "Accept": "application/vnd.github+json",
          "User-Agent": `YapapouaiyeLauncher/${app.getVersion()}`
        }
      };
      if (token) options.headers["Authorization"] = `Bearer ${token}`;
      https.get(url, options, (r) => {
        let body = "";
        r.on("data", (c) => body += c);
        r.on("end", () => resolve({ statusCode: r.statusCode, body, location: r.headers.location || null }));
      }).on("error", reject);
    });

  const getWithRedirects = async (url) => {
    let redirectsLeft = 3;
    let currentUrl = url;
    while (redirectsLeft > 0) {
      const res = await fetchJson(currentUrl);
      if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) && res.location) {
        currentUrl = res.location;
        redirectsLeft -= 1;
      } else {
        return res;
      }
    }
    return fetchJson(currentUrl);
  };

  // 1. Fetch GitHub releases directly (primary source of truth for release descriptions)
  let gitHubReleases = [];
  let latestRelease = null;
  const githubEndpoints = [
    `https://api.github.com/repos/${GITHUB_OWNER_LAUNCHER}/${GITHUB_REPO_LAUNCHER}/releases`,
    `https://api.github.com/repos/${GITHUB_OWNER_LAUNCHER}/${GITHUB_REPO_LAUNCHER}/releases/latest`
  ];

  for (const ghUrl of githubEndpoints) {
    try {
      const res = await getWithRedirects(ghUrl);
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const parsed = JSON.parse(res.body);
        if (Array.isArray(parsed) && parsed.length > 0) {
          gitHubReleases = parsed;
          latestRelease = parsed[0];
          break;
        } else if (parsed && typeof parsed === "object" && parsed.tag_name) {
          gitHubReleases = [parsed];
          latestRelease = parsed;
          break;
        }
      }
    } catch {
      // Continue to next endpoint
    }
  }

  // 2. Fetch live news from Database API (Candidate endpoints: Custom URL, Local Dev, Cloudflare Pages)
  let dbNews = [];
  let apiSuccess = false;

  const candidateEndpoints = [
    process.env.NEWS_API_URL,
    "http://127.0.0.1:8789/api/news",
    "https://yapapouaiye-launcher.pages.dev/api/news"
  ].filter(Boolean);

  for (const endpoint of candidateEndpoints) {
    try {
      const sep = endpoint.includes("?") ? "&" : "?";
      const apiUrl = `${endpoint}${sep}_t=${Date.now()}`;
      const res = (await httpGet(apiUrl, false, false)).toString();
      const parsed = JSON.parse(res);
      if (parsed && (parsed.ok === true || Array.isArray(parsed.news) || Array.isArray(parsed.entries))) {
        dbNews = Array.isArray(parsed.news) ? parsed.news : Array.isArray(parsed.entries) ? parsed.entries : [];
        apiSuccess = true;
        break; // Successfully queried active database API
      }
    } catch {
      // Endpoint unreachable, continue to next candidate
    }
  }

  // 3. Fallback to local site/news.json if database API failed
  if (!apiSuccess) {
    try {
      const localPath = path.join(__dirname, "..", "site", "news.json");
      if (fs.existsSync(localPath)) {
        const fileContent = fs.readFileSync(localPath, "utf-8");
        const parsed = JSON.parse(fileContent);
        dbNews = Array.isArray(parsed) ? parsed : Array.isArray(parsed.entries) ? parsed.entries : [];
      }
    } catch {
      dbNews = [];
    }
  }

  // 4. Keep database posts independent from GitHub releases.
  // A post may intentionally target the same version as a patch, so never deduplicate by version.
  const mergedNews = [];
  const addedIds = new Set();

  for (const item of dbNews) {
    const itemId = String(item?.id || "");
    const isGithubRelease = item?.isGithubRelease === true
      || String(item?.isGithubRelease).toLowerCase() === "true"
      || itemId.toLowerCase().startsWith("gh-");
    if (!item || isGithubRelease) continue;
    const postId = itemId || `news-${mergedNews.length}`;
    if (addedIds.has(postId)) continue;
    mergedNews.push(item);
    addedIds.add(postId);
  }

  const finalVersion = latestRelease?.tag_name?.replace(/^v/i, "") || fallback.version;
  const finalNotes = (latestRelease?.body || "").trim() || fallback.notes;
  const latestReleaseUrl = latestRelease?.html_url || `https://github.com/${GITHUB_OWNER_LAUNCHER}/${GITHUB_REPO_LAUNCHER}/releases/latest`;

  return {
    version: finalVersion,
    notes: finalNotes,
    news: mergedNews,
    releases: gitHubReleases,
    latestReleaseUrl
  };
});
