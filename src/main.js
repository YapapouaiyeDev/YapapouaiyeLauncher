const { app, BrowserWindow, ipcMain, shell, session } = require("electron");
const path = require("path");
const os = require("os");
const net = require("net");
const http = require("http");
const { Launch, Microsoft } = require("minecraft-java-core");
const { autoUpdater } = require("electron-updater");
const fs = require("fs");
const https = require("https");

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
app.commandLine.appendSwitch("disable-gpu-process-crash-limit");
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("enable-accelerated-2d-canvas");
app.commandLine.appendSwitch("enable-native-gpu-memory-buffers");
app.commandLine.appendSwitch("ignore-gpu-blocklist");

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
  return SERVERS.find((s) => s.id === id) || SERVERS[0];
}

// Per-server Minecraft version (fallback: global default 1.21.1)
function getServerGameVersion(targetServer) {
  const server = targetServer || getActiveServer();
  return server?.gameVersion || "1.21.1";
}

function getActiveServer() {
  const config = loadConfig();
  return getServerById(config.activeServerId || "adoserv2");
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
const gameDir = path.join(launcherDir, "minecraft");
const modsDir = path.join(gameDir, "mods");
const customModsDir = path.join(launcherDir, "mods-custom");
const accountsFile = path.join(launcherDir, "accounts.json");
const configFile = path.join(launcherDir, "config.json");
const modsHashFile = path.join(launcherDir, "mods-hash.json");

function getServerModsDir(serverId) {
  return path.join(launcherDir, "mods", serverId || "default");
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
      const existingJars = fs.readdirSync(serverModsDir).filter((f) => f.toLowerCase().endsWith(".jar"));
      const known = new Set(existingJars);
      for (const loader of VALID_LOADERS) {
        const subDir = path.join(serverModsDir, loader);
        if (!fs.existsSync(subDir)) continue;
        for (const f of fs.readdirSync(subDir).filter((f) => f.toLowerCase().endsWith(".jar"))) {
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
let gameProcess = null;

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
// Lunar Client Mods Configuration & Options Synchronization
// ============================================================
const DEFAULT_CLIENT_MODS = {
  nightVision: {
    enabled: false,
    gammaLevel: 100, // 100% -> 100.0 gamma in Minecraft options.txt
    keybind: "RSHIFT",
  },
  noFog: {
    enabled: false,
    netherFog: true,
    waterFog: true,
    skyFog: true,
  },
  fpsBoost: {
    enabled: false,
    fastMath: true,
  },
  zoom: {
    enabled: false,
    smoothZoom: true,
    keybind: "C",
  },
};

function getClientModsConfig() {
  const config = loadConfig();
  return { ...DEFAULT_CLIENT_MODS, ...(config.clientMods || {}) };
}

function syncClientOptionsToMinecraft(clientMods) {
  try {
    const mods = clientMods || getClientModsConfig();
    const optionsPath = path.join(gameDir, "options.txt");
    if (!fs.existsSync(gameDir)) fs.mkdirSync(gameDir, { recursive: true });

    let optionsLines = [];
    if (fs.existsSync(optionsPath)) {
      try {
        optionsLines = fs.readFileSync(optionsPath, "utf-8").split(/\r?\n/);
      } catch {}
    }

    const optionsMap = new Map();
    for (const line of optionsLines) {
      const idx = line.indexOf(":");
      if (idx !== -1) {
        optionsMap.set(line.substring(0, idx).trim(), line.substring(idx + 1).trim());
      }
    }

    // 1. Night Vision (FullBright) via Gamma
    if (mods.nightVision?.enabled) {
      const level = Number(mods.nightVision.gammaLevel) || 100;
      const gammaVal = (level >= 1 ? level : 100).toFixed(1);
      optionsMap.set("gamma", gammaVal);
    } else {
      const currentGamma = parseFloat(optionsMap.get("gamma") || "1.0");
      if (currentGamma > 1.5) {
        optionsMap.set("gamma", "1.0");
      }
    }

    // 2. NoFog & render optimizations
    if (mods.noFog?.enabled) {
      if (!optionsMap.has("renderDistance")) {
        optionsMap.set("renderDistance", "12");
      }
    }

    const outputLines = [];
    for (const [key, val] of optionsMap.entries()) {
      if (key) outputLines.push(`${key}:${val}`);
    }
    if (!optionsMap.has("gamma")) {
      outputLines.push(`gamma:${mods.nightVision?.enabled ? "100.0" : "1.0"}`);
    }
    fs.writeFileSync(optionsPath, outputLines.join("\n"), "utf-8");

    // Also update gameOptions and broadcast to overlay if active
    gameOptions = {
      ...gameOptions,
      nightVision: !!mods.nightVision?.enabled,
      noFog: !!mods.noFog?.enabled,
    };
    if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.webContents) {
      overlayWindow.webContents.send("overlay-set-options", gameOptions);
    }
    console.log("[ClientMods] Synced options to Minecraft (NightVision:", !!mods.nightVision?.enabled, "NoFog:", !!mods.noFog?.enabled, ")");
  } catch (err) {
    console.error("[ClientMods] Error syncing options to Minecraft:", err.message);
  }
}

function saveClientModsConfig(mods) {
  const current = getClientModsConfig();
  const merged = { ...current, ...mods };
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
            "User-Agent": "YapapouaiyeLauncher/1.5.8-3"
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
    icon: path.join(__dirname, "..", "assets", "logo.ico"),
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

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
      icon: path.join(__dirname, "..", "assets", "logo.ico"),
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
  // Windows taskbar icon: register the AppUserModelID so the window
  // uses the launcher's icon (logo.png) instead of the default Electron one.
  const appId = "com.yapapouaiye.launcher";
  app.setAppUserModelId(appId);
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
  createWindow();
  
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
  // ============================================================
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = true;
  autoUpdater.channel = null;
  autoUpdater.isUpdateAvailable = async (updateInfo) =>
    isLauncherVersionNewer(updateInfo?.version, app.getVersion());

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
      "User-Agent": "YapapouaiyeLauncher/1.5.8-3",
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
  const prefixesToTry = [...new Set([prefix, ""])];
  for (const p of prefixesToTry) {
    try {
      const xml = await b2ListObjects(src, p);
      listed = parseJarListing(xml, src);
      break;
    } catch (err) {
      console.warn(`[ModSync] B2 listing prefix="${p}" failed:`, err.message);
    }
  }
  if (!listed) return null;

  try {
    const data = await b2HttpGet(src, `${prefix}mods.json`);
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
          if (meta.sha || meta.etag) mod.sha = String(meta.sha || meta.etag);
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
      .filter((f) => f.name.endsWith(".jar") && (f.type === "file" || f.type === "blob"))
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
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) YapapouaiyeLauncher/1.5.8-3",
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
    }).on("error", reject);
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
    const existingSize = exists ? fs.statSync(destPath).size : 0;

    if (!exists || existingSize !== mod.size || localHashes[mod.name] !== mod.sha) {
      try {
        console.log(`[ModSync] Downloading ${mod.name} (${mod.size} bytes)...`);
        await downloadFileStreamWithRetry(mod.download_url, destPath, (pct) => {
          sendToRenderer("progress", {
            type: "mod-sync",
            value: `TÃ©lÃ©chargement mod: ${mod.name} (${pct}%)`
          });
        });
        localHashes[mod.name] = mod.sha;
        downloaded++;
      } catch (err) {
        console.error(`Failed to download ${mod.name}:`, err.message);
      }
    }
  }

  // Copy custom mods from customModsDir into the per-server mods dir
  const customNames = [];
  if (fs.existsSync(customModsDir)) {
    const customFiles = fs.readdirSync(customModsDir).filter((f) => f.endsWith(".jar"));
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
  const localMods = fs.readdirSync(serverModsDir).filter((f) => f.toLowerCase().endsWith(".jar"));
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
function stageModsForLaunch(serverId) {
  const serverModsDir = getServerModsDir(serverId);
  if (!fs.existsSync(serverModsDir)) fs.mkdirSync(serverModsDir, { recursive: true });
  if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true });

  // Clear the game mods folder of jars
  for (const f of fs.readdirSync(modsDir).filter((f) => f.endsWith(".jar"))) {
    try { fs.unlinkSync(path.join(modsDir, f)); } catch {}
  }

  // Stage uniquement les mods du serveur actif + mods custom.
  // Ne PAS réinjecter le dossier local du repo (mods/) : ça empêchait les suppressions.
  const sources = [serverModsDir, customModsDir];
  for (const srcDir of sources) {
    if (!fs.existsSync(srcDir)) continue;
    for (const f of fs.readdirSync(srcDir).filter((f) => f.endsWith(".jar"))) {
      const srcFile = path.join(srcDir, f);
      const destFile = path.join(modsDir, f);
      try {
        if (fs.existsSync(destFile)) fs.unlinkSync(destFile);
        fs.linkSync(srcFile, destFile);
      } catch {
        try { fs.copyFileSync(srcFile, destFile); } catch {}
      }
    }
  }
}

// ============================================================
// Server list injection (servers.dat)
// ============================================================
function ensureServerInList() {
  try {
    const serversDat = path.join(gameDir, "servers.dat");
    const serverEntries = SERVERS.map((s) => ({ name: s.name, ip: s.displayIp }));
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
function parseLauncherVersion(v) {
  if (!v) return null;
  const m = String(v).trim().replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)(?:[-.](\d+))?/);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], build: m[4] ? +m[4] : 0 };
}

// Returns true if `latest` is strictly newer than `current` (custom notation aware)
function isLauncherVersionNewer(latest, current) {
  const l = parseLauncherVersion(latest);
  const c = parseLauncherVersion(current);
  if (!l || !c) return latest !== current; // fallback: any difference = update
  for (const key of ["major", "minor", "patch", "build"]) {
    if (l[key] > c[key]) return true;
    if (l[key] < c[key]) return false;
  }
  return false;
}

ipcMain.handle("check-for-updates", async () => {
  try {
    // Use checkForUpdates() for manual checks (gives better control over events)
    // checkForUpdatesAndNotify() is only used at startup
    const result = await autoUpdater.checkForUpdates();
    const latestVersion = result?.updateInfo?.version || null;
    const currentVersion = app.getVersion();
    
    console.log(`[UpdateCheck] Current: ${currentVersion}, Latest: ${latestVersion}`);

    // Custom comparison tolerant to the "X.Y.Z-N" notation (ex: 1.5.7-1 > 1.5.7),
    // so clients on plain 1.5.7 still receive the update.
    const updateAvailable = latestVersion
      ? isLauncherVersionNewer(latestVersion, currentVersion)
      : false;
    
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
      errorMsg = "Mise a jour disponible mais aucun fichier d'installation n'a ete uploadÃ©. Contactez l'administrateur.";
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
ipcMain.on("overlay-options", (_, opts) => {
  gameOptions = { ...gameOptions, ...opts };
  console.log("[Overlay] Options mises Ã  jour :", gameOptions);
});

// ============================================================
// Config IPC
// ============================================================
ipcMain.handle("get-system-ram", () => Math.floor(os.totalmem() / (1024 * 1024 * 1024)));
ipcMain.handle("get-config", () => loadConfig());
ipcMain.handle("save-config", (_, config) => { saveConfig(config); return { success: true }; });
ipcMain.handle("get-client-mods", () => getClientModsConfig());
ipcMain.handle("save-client-mods", (_, mods) => {
  const updated = saveClientModsConfig(mods);
  return { success: true, clientMods: updated };
});
ipcMain.handle("apply-client-mods", (_, mods) => {
  syncClientOptionsToMinecraft(mods);
  return { success: true };
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
      const buffer = fs.readFileSync(filePath);
      const dataUri = `data:audio/${ext};base64,${buffer.toString("base64")}`;
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
  if (!authAccount) return { success: false, error: "Non connectÃ©." };

  try {
    const { version, loader, ram, serverId } = options || {};
    const targetServer = getServerById(serverId || loadConfig().activeServerId || "adoserv2");
    const activeLoader = normalizeLoader(targetServer.defaultLoader || loader, targetServer);
    const launcher = new Launch();

    // Save RAM & selected server to config
    saveConfig({ ram, activeServerId: targetServer.id });

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
          const data = loadAccounts();
          if (data.activeIndex >= 0) {
            data.accounts[data.activeIndex] = refreshed;
            saveAccounts(data);
          }
          console.log("[Launch] Microsoft token refreshed successfully");
        } else {
          console.error("[Launch] Token refresh returned error, session may be invalid");
          return { success: false, error: "Session expirÃ©e. Reconnecte-toi via Microsoft." };
        }
      } catch (refreshErr) {
        console.error("[Launch] Token refresh failed:", refreshErr.message);
        return { success: false, error: "Session expirÃ©e. Reconnecte-toi via Microsoft." };
      }
    }

    // Ensure servers are in multiplayer list
    ensureServerInList();

    // Sync Lunar client options (Night Vision gamma, NoFog, etc.)
    syncClientOptionsToMinecraft();

    // Load full config for user settings
    const config = loadConfig();

    // Apply resolution from config
    const resolution = config.resolution || "1280x720";
    const [screenW, screenH] = resolution.split("x").map(Number);

    const launchConfig = {
      authenticator: authAccount,
      path: gameDir,
      version: version || getServerGameVersion(targetServer),
      memory: { max: `${ram || 4}G`, min: "1G" },
      screen: { width: screenW || 1280, height: screenH || 720, fullscreen: config.fullscreen || false },
      java: config.javaPath ? { path: config.javaPath } : { type: "jre" },
      GAME_ARGS: ["--server", targetServer.host, "--port", String(targetServer.gamePort)],
    };

    if (config.jvmArgs) {
      launchConfig.JVM_ARGS = config.jvmArgs.split(" ").filter(Boolean);
    }

    if (activeLoader && activeLoader !== "vanilla") {
      launchConfig.loader = { type: activeLoader, build: "latest", enable: true };
    }

    const send = (ch, d) => sendToRenderer(ch, d);

    // Stage the active server's mods (NeoForge + Fabric together) into the game mods folder
    send("progress", { type: "mod-sync", value: `PrÃ©paration des mods de ${targetServer.name}...` });
    stageModsForLaunch(targetServer.id);
    console.log(`[Launch] ${targetServer.name} (${activeLoader}) mods staged. Setting up game launch pipeline...`);

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
    launcher.on("data", (data) => {
      send("game-log", data);
      if (config.minimizeOnLaunch && mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMinimized()) {
        mainWindow.minimize();
      }
    });
    launcher.on("close", (code) => {
      console.log(`[Launch] Game process closed with code ${code}`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.restore();
        mainWindow.focus();
      }
      send("game-closed", code ?? 0);
    });
    launcher.on("error", (err) => {
      console.error("[Launch] Game launch error event:", err);
      send("game-error", err.message || String(err));
    });

    console.log("[Launch] Calling minecraft-java-core Launch()...");
    await launcher.Launch(launchConfig);
    console.log("[Launch] Launch() resolved - game process spawned.");

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
// Multi-Server IPC Handlers
// ============================================================
ipcMain.handle("get-servers", () => {
  const active = getActiveServer();
  return {
    servers: SERVERS.map((s) => ({ ...s, gameVersion: getServerGameVersion(s) })),
    activeServerId: active.id,
    activeServer: { ...active, gameVersion: getServerGameVersion(active) },
  };
});

ipcMain.handle("set-active-server", (_, serverId) => {
  const server = getServerById(serverId);
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
// Mods
// ============================================================
ipcMain.handle("get-mods", async (_, serverId) => {
  try {
    const activeServer = serverId ? getServerById(serverId) : getActiveServer();
    const serverModsDir = getServerModsDir(activeServer.id);
    const customMods = fs.existsSync(customModsDir)
      ? fs.readdirSync(customModsDir).filter((f) => f.toLowerCase().endsWith(".jar"))
      : [];

    let names = [];
    if (activeServer?.modsSource?.type === "b2") {
      const remote = await fetchRemoteModsListB2(activeServer);
      if (remote) {
        names = remote.map((m) => m.name);
      } else {
        names = fs.existsSync(serverModsDir)
          ? fs.readdirSync(serverModsDir).filter((f) => f.toLowerCase().endsWith(".jar"))
          : [];
      }
    } else {
      names = fs.existsSync(serverModsDir)
        ? fs.readdirSync(serverModsDir).filter((f) => f.toLowerCase().endsWith(".jar"))
        : [];
    }

    // AdoServ67 / B2 : afficher uniquement le listing distant.
    // Les jars de mods-custom restent installables au lancement, mais ne polluent plus la liste.
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
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("get-launcher-dir", () => ({ modsDir, gameDir, launcherDir, customModsDir }));

ipcMain.handle("sync-mods", async (_, serverId) => {
  try {
    const targetServer = serverId ? getServerById(serverId) : getActiveServer();
    const result = await syncModsFromRemote(targetServer);
    const serverModsDir = getServerModsDir(targetServer.id);
    const activeMods = fs.existsSync(serverModsDir)
      ? fs.readdirSync(serverModsDir).filter((f) => f.endsWith(".jar"))
      : [];
    return { success: true, count: activeMods.length, downloaded: result.downloaded || 0, removed: result.removed || 0, serverId: result.serverId || targetServer.id, repo: result.repo || "" };
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
    notes: "Yapapouaiye Launcher v1.5.8-3 : comparateur -N, MAJ 1.5.8-2 vers 1.5.8-3."
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";

  const fetchJson = (url) =>
    new Promise((resolve, reject) => {
      const options = {
        method: "GET",
        headers: {
          "Accept": "application/vnd.github+json",
          "User-Agent": "YapapouaiyeLauncher/1.5.8-3"
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
