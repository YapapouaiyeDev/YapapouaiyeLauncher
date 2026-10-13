use crate::accounts::{load_accounts, save_accounts};
use crate::auth::{auth_microsoft_flow, offline_account, refresh_microsoft};
use crate::config::{
    get_client_mods, load_config, resolve_client_mods, save_client_mods, save_config, sync_client_options,
};
use crate::launcher::launch_game_flow;
use crate::mods::{list_local_mods, open_custom_mods as open_custom_mods_fs, sync_mods as sync_mods_task};
use crate::paths::{
    custom_mods_dir, game_dir, launcher_dir, log_line, mods_dir, APP_VERSION,
};
use crate::servers::{check_server_status as check_status_impl, get_server, StatusCache, SERVERS};
use crate::updater::{
    check_first_launch_after_update as check_first_impl, check_for_updates as check_updates_impl,
    get_latest_release_info as get_release_info_impl, mark_version_seen as mark_seen_impl,
};
use base64::Engine;
use serde_json::{json, Value};
use std::fs;
use tauri::{AppHandle, State, Window};

// ============================================================
// Window Commands
// ============================================================

#[tauri::command]
pub fn minimize(window: Window) {
    let _ = window.minimize();
}

#[tauri::command]
pub fn maximize(window: Window) {
    if let Ok(is_max) = window.is_maximized() {
        if is_max {
            let _ = window.unmaximize();
        } else {
            let _ = window.maximize();
        }
    }
}

#[tauri::command]
pub fn close(window: Window) {
    let _ = window.close();
}

#[tauri::command]
pub fn get_window_state(window: Window) -> Value {
    let is_max = window.is_maximized().unwrap_or(false);
    json!({ "isMaximized": is_max })
}

// ============================================================
// Auth & Accounts
// ============================================================

#[tauri::command]
pub fn get_invitation_status() -> Value {
    crate::invitations::status()
}

#[tauri::command]
pub async fn verify_invitation(code: String) -> Value {
    crate::invitations::verify(code).await
}

#[tauri::command]
pub async fn auth_microsoft(app: AppHandle) -> Value {
    if let Some(blocked) = crate::invitations::required() { return blocked; }
    match auth_microsoft_flow(app).await {
        Ok(account) => {
            let mut data = load_accounts();
            let name = account.name.clone();
            let uuid = account.uuid.clone();
            if let Some(idx) = data.accounts.iter().position(|a| a.uuid == uuid) {
                data.accounts[idx] = account;
                data.active_index = idx as i64;
            } else {
                data.accounts.push(account);
                data.active_index = (data.accounts.len() as i64) - 1;
            }
            save_accounts(&data);
            json!({ "success": true, "username": name, "uuid": uuid })
        }
        Err(err) => {
            log_line("ERROR", &format!("Microsoft auth error: {err}"));
            let error_msg = if err.contains("timeout") || err.contains("closed") || err.contains("cancel") {
                "Connexion annulée".to_string()
            } else {
                err
            };
            json!({ "success": false, "error": error_msg })
        }
    }
}

#[tauri::command]
pub fn auth_offline(username: String) -> Value {
    if let Some(blocked) = crate::invitations::required() { return blocked; }
    let trimmed = username.trim();
    if trimmed.len() < 3 {
        return json!({ "success": false, "error": "Le pseudo doit faire au moins 3 caractères." });
    }
    let account = offline_account(trimmed);
    let mut data = load_accounts();
    let name = account.name.clone();
    let uuid = account.uuid.clone();
    if let Some(idx) = data.accounts.iter().position(|a| a.uuid == uuid) {
        data.accounts[idx] = account;
        data.active_index = idx as i64;
    } else {
        data.accounts.push(account);
        data.active_index = (data.accounts.len() as i64) - 1;
    }
    save_accounts(&data);
    json!({ "success": true, "username": name, "uuid": uuid })
}

#[tauri::command]
pub async fn auto_login() -> Value {
    if let Some(blocked) = crate::invitations::required() { return blocked; }
    let mut data = load_accounts();

    if data.active_index >= 0 && (data.active_index as usize) < data.accounts.len() {
        let saved = data.accounts[data.active_index as usize].clone();
        if saved.is_microsoft() {
            if let Some(refresh_tok) = &saved.refresh_token {
                match refresh_microsoft(refresh_tok).await {
                    Ok(refreshed) => {
                        let name = refreshed.name.clone();
                        let uuid = refreshed.uuid.clone();
                        data.accounts[data.active_index as usize] = refreshed;
                        save_accounts(&data);
                        return json!({ "success": true, "username": name, "uuid": uuid });
                    }
                    Err(e) => {
                        log_line("WARN", &format!("AutoLogin refresh failed: {e}"));
                        return json!({ "success": false, "error": "Session expirée, reconnecte-toi via Microsoft." });
                    }
                }
            }
        } else if !saved.name.is_empty() && !saved.uuid.is_empty() {
            return json!({ "success": true, "username": saved.name, "uuid": saved.uuid });
        }
    }

    // Try any account
    for (i, saved) in data.accounts.iter().enumerate() {
        if saved.is_microsoft() {
            if let Some(refresh_tok) = &saved.refresh_token {
                if let Ok(refreshed) = refresh_microsoft(refresh_tok).await {
                    let name = refreshed.name.clone();
                    let uuid = refreshed.uuid.clone();
                    data.accounts[i] = refreshed;
                    data.active_index = i as i64;
                    save_accounts(&data);
                    return json!({ "success": true, "username": name, "uuid": uuid });
                }
            }
        } else if !saved.name.is_empty() && !saved.uuid.is_empty() {
            data.active_index = i as i64;
            let name = saved.name.clone();
            let uuid = saved.uuid.clone();
            save_accounts(&data);
            return json!({ "success": true, "username": name, "uuid": uuid });
        }
    }

    json!({ "success": false })
}

#[tauri::command]
pub fn auth_logout() -> Value {
    let mut data = load_accounts();
    data.active_index = -1;
    save_accounts(&data);
    json!({ "success": true })
}

#[tauri::command]
pub fn get_accounts() -> Value {
    let data = load_accounts();
    let accounts: Vec<Value> = data
        .accounts
        .iter()
        .enumerate()
        .map(|(i, a)| {
            json!({
                "name": a.name,
                "uuid": a.uuid,
                "type": if a.is_microsoft() { "microsoft" } else { "offline" },
                "active": (i as i64) == data.active_index
            })
        })
        .collect();
    json!({
        "accounts": accounts,
        "activeIndex": data.active_index
    })
}

#[tauri::command]
pub async fn switch_account(index: usize) -> Value {
    if let Some(blocked) = crate::invitations::required() { return blocked; }
    let mut data = load_accounts();
    if index >= data.accounts.len() {
        return json!({ "success": false });
    }
    let account = data.accounts[index].clone();
    if account.is_microsoft() {
        if let Some(ref_tok) = &account.refresh_token {
            match refresh_microsoft(ref_tok).await {
                Ok(refreshed) => {
                    let name = refreshed.name.clone();
                    let uuid = refreshed.uuid.clone();
                    data.accounts[index] = refreshed;
                    data.active_index = index as i64;
                    save_accounts(&data);
                    return json!({ "success": true, "username": name, "uuid": uuid });
                }
                Err(e) => {
                    return json!({ "success": false, "error": format!("Session expirée: {e}") });
                }
            }
        }
    }
    if !account.name.is_empty() && !account.uuid.is_empty() {
        data.active_index = index as i64;
        save_accounts(&data);
        return json!({ "success": true, "username": account.name, "uuid": account.uuid });
    }
    json!({ "success": false, "error": "Session invalide" })
}

#[tauri::command]
pub fn remove_account(index: usize) -> Value {
    let mut data = load_accounts();
    if index >= data.accounts.len() {
        return json!({ "success": false });
    }
    let was_active = data.active_index == (index as i64);
    data.accounts.remove(index);

    if data.accounts.is_empty() {
        data.active_index = -1;
    } else if was_active {
        data.active_index = (data.accounts.len() as i64) - 1;
    } else if data.active_index > (index as i64) {
        data.active_index -= 1;
    }

    save_accounts(&data);

    let active_acc = if data.active_index >= 0 && (data.active_index as usize) < data.accounts.len() {
        let a = &data.accounts[data.active_index as usize];
        Some(json!({ "name": a.name, "uuid": a.uuid }))
    } else {
        None
    };

    json!({
        "success": true,
        "activeIndex": data.active_index,
        "activeAccount": active_acc
    })
}

// ============================================================
// Config & Themes
// ============================================================

#[tauri::command]
pub fn get_system_ram() -> u64 {
    let mut sys = sysinfo::System::new_all();
    sys.refresh_memory();
    sys.total_memory() / (1024 * 1024 * 1024)
}

#[tauri::command]
pub fn get_config() -> Value {
    load_config()
}

#[tauri::command]
pub fn save_config_cmd(config: Value) -> Value {
    if config["onboardingCompleted"] == true {
        if let Some(blocked) = crate::invitations::required() { return blocked; }
    }
    if save_config(&config) { json!({ "success": true }) }
    else { json!({ "success": false, "error": "Impossible d’enregistrer la configuration." }) }
}

#[tauri::command]
pub fn get_client_mods_cmd() -> crate::config::ClientMods {
    get_client_mods()
}

#[tauri::command]
pub fn save_client_mods_cmd(mods: Value) -> Value {
    let updated = save_client_mods(mods);
    json!({ "success": true, "clientMods": updated })
}

#[tauri::command]
pub fn apply_client_mods_cmd(mods: Value) -> Value {
    // Un patch partiel ({ zoom: {...} }) est fusionne avec le stocke :
    // on ne rebasculle jamais les autres modules sur leurs defauts.
    let merged = resolve_client_mods(mods);
    sync_client_options(&merged);
    json!({ "success": true })
}

#[tauri::command]
pub async fn select_java_path() -> Value {
    let file = rfd::AsyncFileDialog::new()
        .set_title("Sélectionner l'exécutable Java")
        .add_filter("Executables", &["exe"])
        .add_filter("All Files", &["*"])
        .pick_file()
        .await;

    match file {
        Some(handle) => json!({
            "success": true,
            "path": handle.path().to_string_lossy()
        }),
        None => json!({ "success": false }),
    }
}

#[tauri::command]
pub async fn export_custom_theme(theme: Value) -> Value {
    let default_name = theme
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("mon-theme")
        .to_lowercase()
        .replace(|c: char| !c.is_alphanumeric() && c != '_' && c != '-', "-")
        + ".json";

    let file = rfd::AsyncFileDialog::new()
        .set_title("Exporter le Thème Personnalisé")
        .set_file_name(&default_name)
        .add_filter("Thème Launcher (*.json)", &["json"])
        .save_file()
        .await;

    if let Some(handle) = file {
        let path = handle.path();
        if let Ok(text) = serde_json::to_string_pretty(&theme) {
            if fs::write(path, text).is_ok() {
                return json!({ "success": true, "filePath": path.to_string_lossy() });
            }
        }
    }
    json!({ "success": false })
}

#[tauri::command]
pub async fn import_custom_theme_file() -> Value {
    let file = rfd::AsyncFileDialog::new()
        .set_title("Importer un Thème Personnalisé")
        .add_filter("Thème Launcher (*.json)", &["json"])
        .pick_file()
        .await;

    if let Some(handle) = file {
        if let Ok(content) = fs::read_to_string(handle.path()) {
            return json!({ "success": true, "content": content });
        }
    }
    json!({ "success": false })
}

#[tauri::command]
pub async fn select_image_file() -> Value {
    let file = rfd::AsyncFileDialog::new()
        .set_title("Sélectionner une Image (Fond, Bannière, etc.)")
        .add_filter("Images (*.png, *.jpg, *.jpeg, *.webp, *.gif)", &["png", "jpg", "jpeg", "webp", "gif"])
        .pick_file()
        .await;

    if let Some(handle) = file {
        let p = handle.path();
        if let Ok(bytes) = fs::read(p) {
            let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("png").to_lowercase();
            let mime = if ext == "jpg" { "jpeg" } else { &ext };
            let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            let data_uri = format!("data:image/{mime};base64,{b64}");
            return json!({
                "success": true,
                "dataUri": data_uri,
                "filePath": p.to_string_lossy()
            });
        }
    }
    json!({ "success": false })
}

#[tauri::command]
pub async fn select_audio_file() -> Value {
    let file = rfd::AsyncFileDialog::new()
        .set_title("Sélectionner un Fichier Audio (SFX)")
        .add_filter("Audio (*.mp3, *.wav, *.ogg)", &["mp3", "wav", "ogg"])
        .pick_file()
        .await;

    if let Some(handle) = file {
        let p = handle.path();
        if let Ok(bytes) = fs::read(p) {
            let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("mp3").to_lowercase();
            let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            let data_uri = format!("data:audio/{ext};base64,{b64}");
            return json!({
                "success": true,
                "dataUri": data_uri,
                "filePath": p.to_string_lossy()
            });
        }
    }
    json!({ "success": false })
}

// ============================================================
// Game & Servers
// ============================================================

#[tauri::command]
pub async fn launch_game(app: AppHandle, options: Option<Value>) -> Value {
    if let Some(blocked) = crate::invitations::required() { return blocked; }
    let data = load_accounts();
    if data.active_index < 0 || (data.active_index as usize) >= data.accounts.len() {
        return json!({ "success": false, "error": "Non connecté." });
    }

    let mut account = data.accounts[data.active_index as usize].clone();

    // Refresh Microsoft token if needed
    if account.is_microsoft() {
        if let Some(ref_tok) = &account.refresh_token {
            match refresh_microsoft(ref_tok).await {
                Ok(refreshed) => {
                    account = refreshed.clone();
                    let mut fresh_data = load_accounts();
                    if fresh_data.active_index >= 0 && (fresh_data.active_index as usize) < fresh_data.accounts.len() {
                        fresh_data.accounts[fresh_data.active_index as usize] = refreshed;
                        save_accounts(&fresh_data);
                    }
                }
                Err(e) => {
                    return json!({ "success": false, "error": format!("Session expirée. Reconnecte-toi via Microsoft: {e}") });
                }
            }
        }
    }

    let opts = options.unwrap_or_else(|| json!({}));
    let config = load_config();
    let server_id = opts
        .get("serverId")
        .and_then(|v| v.as_str())
        .or_else(|| config.get("activeServerId").and_then(|v| v.as_str()))
        .unwrap_or("adoserv2");

    let server = match get_server(server_id) {
        Some(s) => s,
        None => &SERVERS[0],
    };

    let ram = opts.get("ram").and_then(|v| v.as_u64()).unwrap_or(4) as u32;
    save_config(&json!({ "ram": ram, "activeServerId": server.id }));

    let custom_version = opts.get("version").and_then(|v| v.as_str()).map(|s| s.to_string());

    match launch_game_flow(app, account, server, ram, custom_version).await {
        Ok(_) => json!({ "success": true }),
        Err(e) => {
            log_line("ERROR", &format!("Launch error: {e}"));
            json!({ "success": false, "error": e })
        }
    }
}

#[tauri::command]
pub async fn check_server_status(
    cache: State<'_, StatusCache>,
    server_id: String,
) -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    Ok(check_status_impl(&client, &cache, &server_id).await)
}

#[tauri::command]
pub fn get_servers() -> Value {
    let cfg = load_config();
    let active_id = cfg.get("activeServerId").and_then(|v| v.as_str()).unwrap_or("adoserv2");
    let active_srv = get_server(active_id).unwrap_or(&SERVERS[0]);

    let servers: Vec<Value> = SERVERS
        .iter()
        .map(|s| {
            json!({
                "id": s.id,
                "name": s.name,
                "shortName": s.name,
                "host": s.host,
                "pingPort": s.ping_port,
                "gamePort": s.game_port,
                "displayIp": s.display_ip,
                "defaultLoader": s.loader.as_str(),
                "gameVersion": "1.21.1"
            })
        })
        .collect();

    let active_val = json!({
        "id": active_srv.id,
        "name": active_srv.name,
        "shortName": active_srv.name,
        "host": active_srv.host,
        "pingPort": active_srv.ping_port,
        "gamePort": active_srv.game_port,
        "displayIp": active_srv.display_ip,
        "defaultLoader": active_srv.loader.as_str(),
        "gameVersion": "1.21.1"
    });

    json!({
        "servers": servers,
        "activeServerId": active_srv.id,
        "activeServer": active_val
    })
}

#[tauri::command]
pub fn set_active_server(server_id: String) -> Value {
    let srv = get_server(&server_id).unwrap_or(&SERVERS[0]);
    save_config(&json!({ "activeServerId": srv.id }));
    let active_val = json!({
        "id": srv.id,
        "name": srv.name,
        "shortName": srv.name,
        "host": srv.host,
        "pingPort": srv.ping_port,
        "gamePort": srv.game_port,
        "displayIp": srv.display_ip,
        "defaultLoader": srv.loader.as_str(),
        "gameVersion": "1.21.1"
    });
    json!({
        "success": true,
        "activeServerId": srv.id,
        "activeServer": active_val
    })
}

// ============================================================
// Mods
// ============================================================

#[tauri::command]
pub fn get_mods(server_id: Option<String>) -> Value {
    let cfg = load_config();
    let s_id = server_id
        .or_else(|| cfg.get("activeServerId").and_then(|v| v.as_str()).map(|s| s.to_string()))
        .unwrap_or_else(|| "adoserv2".to_string());

    let srv = get_server(&s_id).unwrap_or(&SERVERS[0]);
    let local = list_local_mods(&s_id);
    let names: Vec<String> = local
        .iter()
        .filter_map(|m| m.get("name").and_then(|v| v.as_str()).map(|s| s.to_string()))
        .collect();

    let custom_dir = custom_mods_dir();
    let mut custom_names: Vec<String> = Vec::new();
    if let Ok(entries) = fs::read_dir(custom_dir) {
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if name.to_lowercase().ends_with(".jar") {
                custom_names.push(name);
            }
        }
    }

    json!({
        "success": true,
        "mods": names,
        "customMods": custom_names,
        "loader": srv.loader.as_str(),
        "serverId": srv.id,
        "serverName": srv.name
    })
}

#[tauri::command]
pub fn get_launcher_dir() -> Value {
    json!({
        "modsDir": mods_dir().to_string_lossy(),
        "gameDir": game_dir().to_string_lossy(),
        "launcherDir": launcher_dir().to_string_lossy(),
        "customModsDir": custom_mods_dir().to_string_lossy()
    })
}

#[tauri::command]
pub async fn sync_mods(app: AppHandle, server_id: Option<String>) -> Value {
    let cfg = load_config();
    let s_id = server_id
        .or_else(|| cfg.get("activeServerId").and_then(|v| v.as_str()).map(|s| s.to_string()))
        .unwrap_or_else(|| "adoserv2".to_string());

    match sync_mods_task(&app, &s_id).await {
        Ok(val) => {
            let count = val.get("count").and_then(|v| v.as_u64()).unwrap_or(0);
            let downloaded = val.get("downloaded").and_then(|v| v.as_u64()).unwrap_or(count);
            let removed = val.get("removed").and_then(|v| v.as_u64()).unwrap_or(0);
            let failed_count = val.get("failedCount").and_then(|v| v.as_u64()).unwrap_or(0);
            let failed = val.get("failed").cloned().unwrap_or(json!([]));
            // Tout a échoué et rien n'est à jour : ne pas afficher un succès.
            if count > 0 && downloaded == 0 && failed_count >= count {
                log_line("ERROR", &format!("sync_mods: échec des {count} téléchargement(s)"));
                return json!({ "success": false, "error": "Échec du téléchargement des mods. Vérifiez votre connexion puis réessayez." });
            }
            json!({
                "success": true,
                "count": count,
                "downloaded": downloaded,
                "removed": removed,
                "failed": failed,
                "failedCount": failed_count,
                "serverId": s_id,
                "repo": ""
            })
        }
        Err(e) => {
            log_line("ERROR", &format!("sync_mods error: {e}"));
            json!({ "success": false, "error": e })
        }
    }
}

#[tauri::command]
pub fn open_custom_mods() -> Value {
    match open_custom_mods_fs() {
        Ok(_) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e }),
    }
}

// ============================================================
// Updates
// ============================================================

#[tauri::command]
pub fn get_app_version() -> String {
    APP_VERSION.to_string()
}

#[tauri::command]
pub async fn check_for_updates() -> Value {
    check_updates_impl().await
}

#[tauri::command]
pub async fn get_latest_release_info() -> Value {
    get_release_info_impl().await
}

#[tauri::command]
pub fn check_first_launch_after_update() -> Value {
    check_first_impl()
}

#[tauri::command]
pub fn mark_version_seen() -> Value {
    mark_seen_impl()
}

#[tauri::command]
pub fn open_external(url: String) -> Value {
    if url.starts_with("http://") || url.starts_with("https://") {
        if open::that(&url).is_ok() {
            return json!({ "success": true });
        }
    }
    json!({ "success": false, "error": "URL non sécurisée ou invalide" })
}

// ============================================================
// Overlay
// ============================================================

#[tauri::command]
pub fn overlay_options(opts: Value) {
    log_line("INFO", &format!("[Overlay] Options reçues: {opts}"));
}
