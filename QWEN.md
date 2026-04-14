# Yapapouaiye Launcher - Project Context

## Project Overview

**Yapapouaiye Launcher** is a custom Electron-based launcher for a modded Minecraft server (version 1.21.1 with NeoForge). It provides a polished UI for players to authenticate, configure game settings, sync mods from a remote GitLab repository, and launch the game.

**Key Features:**
- **Authentication:** Microsoft (Xbox) account login and offline mode
- **Multi-account support:** Store and switch between multiple Minecraft accounts
- **Mod synchronization:** Automatically downloads and syncs mods from a GitLab repository (`yapapouaiyedev/ModYapapouaiyeLauncher`)
- **Auto-updates:** Checks GitHub Releases (`yapapouaiyestudios/YapapouaiyeLauncher`) for new launcher versions at startup
- **Configurable settings:** RAM allocation, resolution, Java path, JVM arguments, fullscreen toggle
- **Server integration:** Auto-connects to `yapapouaiyelive.falixsrv.me:25565`

**Version:** 1.5.0

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Electron |
| Game Launching | `minecraft-java-core` v4.2.7 |
| Auto-updates | `electron-updater` v6.8.3 (GitHub Releases) |
| Build Tool | `electron-builder` v26.8.1 |
| Environment | `dotenv` for `.env` management |
| UI | Vanilla HTML/CSS/JS (Inter font, custom dark theme with emerald green accents) |

## Architecture

```
YapapouaiyeLauncher/
├── src/
│   ├── main.js          # Electron main process: auth, game launch, mod sync, auto-updater, IPC handlers
│   ├── preload.js       # Secure context bridge exposing launcher APIs to renderer
│   ├── renderer.js      # UI logic: navigation, auth forms, settings, mod list, accounts
│   ├── index.html       # Main UI template (sidebar + pages: home, mods, settings, accounts)
│   └── style.css        # Custom dark theme CSS (emerald green accent, glass morphism)
├── assets/
│   └── logo.png         # Application icon
├── mods/                # Server mods staged for packaging (filter: **/*.jar)
├── .env                 # Environment variables (GH_TOKEN, GITLAB_TOKEN)
├── package.json         # Dependencies + electron-builder config
└── dev-app-update.yml   # Dev-mode auto-updater config
```

### Runtime Data Directories (created at `%APPDATA%\.yapapouaiye-launcher\`)
- `minecraft/` — Game files
- `mods/` — Synced server mods (from GitLab)
- `mods-custom/` — User custom mods (never deleted by sync)
- `config.json` — User settings (RAM, resolution, Java path, etc.)
- `accounts.json` — Multi-account storage
- `mods-hash.json` — Tracks synced mod versions for delta updates

## Building and Running

### Prerequisites
- Node.js (compatible with Electron v41)
- Windows OS (build target is NSIS installer)

### Install Dependencies
```bash
npm install
```

### Run in Development
```bash
npm start
```

### Build Windows Installer
```bash
npm run build
```
Output: `dist/Yapapouaiye-Launcher-Setup-<version>.exe`

### Environment Variables
Create a `.env` file (see `.env.example`):
```env
GH_TOKEN=your_github_token_here       # For auto-updates (private repos) or public_repo scope
GITLAB_TOKEN=your_gitlab_token_here   # For downloading mods from GitLab (read_repository scope)
```

## Key Configuration

### `package.json` Build Config
- **App ID:** `com.yapapouaiye.launcher`
- **Target:** Windows NSIS installer
- **Publish:** GitHub (`yapapouaiyestudios/YapapouaiyeLauncher`)
- **Extra Resources:** `mods/` directory (only `*.jar` files)

### External Services
| Service | URL | Purpose |
|---------|-----|---------|
| GitLab Mods | `yapapouaiyedev/ModYapapouaiyeLauncher` | Remote mod repository |
| GitHub Releases | `yapapouaiyestudios/YapapouaiyeLauncher` | Launcher auto-updates |
| Game Server | `yapapouaiyelive.falixsrv.me:25565` | Default Minecraft server |

### Game Launch Config
- **Version:** 1.21.1
- **Loader:** NeoForge
- **Default RAM:** 4 GB (configurable, min 2 GB, max = system RAM - 3 GB)
- **Resolution:** 1280x720 HD (configurable presets: 480p, 720p, 900p, 1080p, custom)

## IPC API (Renderer ↔ Main)

The `window.launcher` object exposed via `preload.js`:

| Method | Description |
|--------|-------------|
| `minimize()` | Minimize window |
| `maximize()` | Toggle maximize |
| `close()` | Close window |
| `authMicrosoft()` | Microsoft account authentication |
| `authOffline(username)` | Offline mode authentication |
| `autoLogin()` | Auto-login with saved account |
| `logout()` | Log out current account |
| `getAccounts()` | Get all saved accounts |
| `switchAccount(index)` | Switch to account by index |
| `removeAccount(index)` | Remove account by index |
| `getSystemRam()` | Get total system RAM in GB |
| `getConfig()` | Load user configuration |
| `saveConfig(config)` | Save user configuration |
| `selectJavaPath()` | Open file dialog for Java executable |
| `launchGame(options)` | Launch Minecraft with specified options |
| `getMods()` | Get list of server mods |
| `getLauncherDir()` | Get launcher directory paths |
| `syncMods()` | Synchronize mods from GitLab |
| `openCustomMods()` | Open custom mods directory |
| `getAppVersion()` | Get current launcher version |
| `checkForUpdates()` | Manually check for updates |
| `getReleaseNotes()` | Fetch release notes from GitHub |

### Events
| Event | Data |
|-------|------|
| `onProgress(callback)` | General progress events (download, check, extract, mod-sync, etc.) |
| `onUpdateAvailable(callback)` | Update available notification |
| `onUpdateProgress(callback)` | Download progress |
| `onUpdateDownloaded(callback)` | Update ready to install |
| `onUpdateError(callback)` | Update error |
| `onGameClosed(callback)` | Game process closed |
| `onGameError(callback)` | Game launch error |
| `onGameLog(callback)` | Game stdout/stderr logs |

## Development Notes

- **Security:** Uses `contextIsolation: true` and `nodeIntegration: false` with a preload script
- **Custom Auto-Updater:** Overrides `GitHubProvider.getLatestVersion()` and `resolveFiles()` to use GitHub REST API instead of atom feeds
- **Mod Sync:** Compares SHA hashes between local mods and GitLab repository tree; only downloads changed mods
- **NBT Injection:** Manually builds `servers.dat` NBT binary data to pre-populate Minecraft's server list
- **UI Theme:** Dark glass-morphism design with emerald green (#10b981) accent, ambient floating gradients
- **Toast Notifications:** Custom in-page toast system for user feedback

## TODO

The `TODO.md` file tracks the implementation of the remote auto-update feature. Key remaining tasks include:
1. Add `electron-updater` dependency (✅ done)
2. Configure `publish` for GitHub (✅ done)
3. Implement updater in `src/main.js` (✅ done)
4. Expose IPC in `src/preload.js` (✅ done)
5. Add UI in `src/index.html` (settings section) (✅ done)
6. Implement handlers in `src/renderer.js` (in progress)
7. Styles CSS (pending review)
8. Install deps & test
9. Build & validate with GitHub release
