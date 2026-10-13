use crate::accounts::Account;
use crate::config::load_config;
use crate::nbt::ensure_server_in_list;
use crate::paths::{custom_mods_dir, game_dir, launcher_dir, log_line, mods_dir, server_mods_dir};
use crate::servers::{Loader, ServerDef};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone)]
pub struct LauncherState {
    pub running_game: Arc<Mutex<Option<u32>>>,
}

impl LauncherState {
    pub fn new() -> Self {
        Self {
            running_game: Arc::new(Mutex::new(None)),
        }
    }
}

fn emit_progress(app: &AppHandle, task: &str, percent: i64) {
    let _ = app.emit(
        "progress",
        json!({
            "type": "download",
            "task": task,
            "percent": percent,
            "value": percent
        }),
    );
    log_line("INFO", &format!("[Launch Progress] {task} ({percent}%)"));
}

pub fn find_java_executable() -> Option<PathBuf> {
    let cfg = load_config();
    if let Some(custom) = cfg.get("javaPath").and_then(|v| v.as_str()) {
        let p = PathBuf::from(custom);
        if p.exists() {
            return Some(p);
        }
    }

    let g_dir = game_dir();
    let l_dir = launcher_dir();

    let candidates = [
        g_dir.join("runtime").join("java-runtime-delta").join("bin").join("java.exe"),
        g_dir.join("runtime").join("java-runtime-gamma").join("bin").join("java.exe"),
        g_dir.join("runtime").join("java-runtime-alpha").join("bin").join("java.exe"),
        l_dir.join("runtime").join("java-runtime-delta").join("bin").join("java.exe"),
        l_dir.join("runtime").join("java-runtime-gamma").join("bin").join("java.exe"),
    ];

    for path in candidates {
        if path.exists() {
            return Some(path);
        }
    }

    // Check JAVA_HOME
    if let Ok(jh) = std::env::var("JAVA_HOME") {
        let p = PathBuf::from(jh).join("bin").join("java.exe");
        if p.exists() {
            return Some(p);
        }
    }

    // Check system which
    if let Ok(p) = which::which("java.exe").or_else(|_| which::which("java")) {
        return Some(p);
    }

    None
}

fn maven_to_path(name: &str) -> Option<PathBuf> {
    // format: group:artifact:version[:classifier][@ext]
    let (group_artifact_version, ext) = match name.split_once('@') {
        Some((gav, ext)) => (gav, ext),
        None => (name, "jar"),
    };
    let parts: Vec<&str> = group_artifact_version.split(':').collect();
    if parts.len() < 3 {
        return None;
    }
    let group_dir = parts[0].replace('.', "/");
    let artifact = parts[1];
    let version = parts[2];
    let classifier = if parts.len() > 3 {
        format!("-{}", parts[3])
    } else {
        String::new()
    };
    let filename = format!("{artifact}-{version}{classifier}.{ext}");
    Some(PathBuf::from(group_dir).join(artifact).join(version).join(filename))
}

fn resolve_library_path(game_path: &Path, loader_path: &Path, lib: &Value) -> Option<PathBuf> {
    if let Some(artifact_path) = lib.pointer("/downloads/artifact/path").and_then(|v| v.as_str()) {
        let p1 = loader_path.join("libraries").join(artifact_path);
        if p1.exists() {
            return Some(p1);
        }
        let p2 = game_path.join("libraries").join(artifact_path);
        if p2.exists() {
            return Some(p2);
        }
    }

    if let Some(name) = lib.get("name").and_then(|v| v.as_str()) {
        if let Some(rel) = maven_to_path(name) {
            let p1 = loader_path.join("libraries").join(&rel);
            if p1.exists() {
                return Some(p1);
            }
            let p2 = game_path.join("libraries").join(&rel);
            if p2.exists() {
                return Some(p2);
            }
            // Return p2 as candidate even if not verified yet
            return Some(p2);
        }
    }

    None
}

pub fn stage_mods_for_launch(server_id: &str, mc_version: &str, loader: &Loader) {
    let dest = mods_dir();
    let _ = fs::create_dir_all(&dest);

    // Clear existing jar files
    if let Ok(entries) = fs::read_dir(&dest) {
        for e in entries.flatten() {
            let p = e.path();
            if p.extension().and_then(|s| s.to_str()).map(|s| s.eq_ignore_ascii_case("jar")).unwrap_or(false) {
                let _ = fs::remove_file(p);
            }
        }
    }

    // Copy server mods
    crate::paths::copy_dir_jars(&server_mods_dir(server_id), &dest);
    // Copy custom user mods
    crate::paths::copy_dir_jars(&custom_mods_dir(), &dest);

    // Select the companion compiled for the actual Minecraft version.
    let filename = match (loader, mc_version) {
        (Loader::NeoForge, "26.2") => "nexlux-26.2.jar",
        (Loader::NeoForge, "1.21.1") => "nexlux-1.1.0.jar",
        _ => return,
    };
    let candidates = [PathBuf::from("mods").join(filename), PathBuf::from("src/assets").join(filename)];
    for candidate in candidates {
        if candidate.exists() {
            for name in ["nexlux-26.2.jar", "nexlux-1.1.0.jar"] {
                let _ = fs::remove_file(dest.join(name));
            }
            if let Err(err) = fs::copy(&candidate, dest.join(filename)) {
                log_line("ERROR", &format!("NexLux: {err}"));
            }
            break;
        }
    }

}

pub async fn launch_game_flow(
    app: AppHandle,
    account: Account,
    server: &ServerDef,
    ram: u32,
    custom_version: Option<String>,
) -> Result<(), String> {
    emit_progress(&app, "Préparation de Minecraft…", 5);

    // 1. Stage mods
    let mc_version = custom_version.unwrap_or_else(|| "1.21.1".to_string());
    stage_mods_for_launch(server.id, &mc_version, &server.loader);

    // 2. Ensure server is in servers.dat
    ensure_server_in_list();

    // 3. Find Java
    emit_progress(&app, "Recherche de Java 21…", 15);
    let java_bin = find_java_executable().ok_or_else(|| {
        "Java 21 introuvable. Veuillez configurer le chemin Java dans les Paramètres.".to_string()
    })?;
    log_line("INFO", &format!("Utilisation de Java: {}", java_bin.display()));

    let g_dir = game_dir();

    // 4. Base version JSON
    let version_json_path = g_dir.join("versions").join(&mc_version).join(format!("{mc_version}.json"));
    let client_jar_path = g_dir.join("versions").join(&mc_version).join(format!("{mc_version}.jar"));

    if !version_json_path.exists() {
        return Err(format!(
            "Fichier de version Minecraft introuvable: {}",
            version_json_path.display()
        ));
    }

    let version_raw = fs::read_to_string(&version_json_path).map_err(|e| e.to_string())?;
    let version_json: Value = serde_json::from_str(&version_raw).map_err(|e| e.to_string())?;

    // 5. Check for loader JSON
    let loader_path = g_dir.join("loader");
    let mut loader_json: Option<Value> = None;
    let mut main_class = version_json
        .get("mainClass")
        .and_then(|v| v.as_str())
        .unwrap_or("net.minecraft.client.main.Main")
        .to_string();

    match server.loader {
        Loader::NeoForge => {
            // Find latest neoforge folder in loader/versions
            let loader_versions_dir = loader_path.join("versions");
            if let Ok(entries) = fs::read_dir(&loader_versions_dir) {
                let mut neo_dirs: Vec<PathBuf> = entries
                    .flatten()
                    .filter(|e| e.path().is_dir())
                    .map(|e| e.path())
                    .filter(|p| {
                        p.file_name()
                            .and_then(|n| n.to_str())
                            .map(|s| s.starts_with("neoforge-"))
                            .unwrap_or(false)
                    })
                    .collect();
                neo_dirs.sort();
                if let Some(latest_dir) = neo_dirs.last() {
                    let dir_name = latest_dir.file_name().unwrap().to_string_lossy();
                    let json_file = latest_dir.join(format!("{dir_name}.json"));
                    if json_file.exists() {
                        if let Ok(txt) = fs::read_to_string(&json_file) {
                            if let Ok(parsed) = serde_json::from_str::<Value>(&txt) {
                                if let Some(mc) = parsed.get("mainClass").and_then(|v| v.as_str()) {
                                    main_class = mc.to_string();
                                }
                                loader_json = Some(parsed);
                            }
                        }
                    }
                }
            }
        }
        Loader::Fabric => {
            let loader_versions_dir = loader_path.join("versions");
            if let Ok(entries) = fs::read_dir(&loader_versions_dir) {
                let mut fabric_dirs: Vec<PathBuf> = entries
                    .flatten()
                    .filter(|e| e.path().is_dir())
                    .map(|e| e.path())
                    .filter(|p| {
                        p.file_name()
                            .and_then(|n| n.to_str())
                            .map(|s| s.starts_with("fabric-"))
                            .unwrap_or(false)
                    })
                    .collect();
                fabric_dirs.sort();
                if let Some(latest_dir) = fabric_dirs.last() {
                    let dir_name = latest_dir.file_name().unwrap().to_string_lossy();
                    let json_file = latest_dir.join(format!("{dir_name}.json"));
                    if json_file.exists() {
                        if let Ok(txt) = fs::read_to_string(&json_file) {
                            if let Ok(parsed) = serde_json::from_str::<Value>(&txt) {
                                if let Some(mc) = parsed.get("mainClass").and_then(|v| v.as_str()) {
                                    main_class = mc.to_string();
                                }
                                loader_json = Some(parsed);
                            }
                        }
                    }
                }
            }
        }
    }

    emit_progress(&app, "Construction du classpath…", 40);

    // 6. Build Classpath
    let mut classpath_entries: Vec<PathBuf> = Vec::new();
    let mut seen_filenames: HashSet<String> = HashSet::new();

    // Add loader libraries first if present
    if let Some(lj) = &loader_json {
        if let Some(libs) = lj.get("libraries").and_then(|v| v.as_array()) {
            for lib in libs {
                if let Some(p) = resolve_library_path(&g_dir, &loader_path, lib) {
                    if let Some(fname) = p.file_name().and_then(|f| f.to_str()) {
                        if p.exists() && seen_filenames.insert(fname.to_string()) {
                            classpath_entries.push(p);
                        }
                    }
                }
            }
        }
    }

    // Add base libraries
    if let Some(libs) = version_json.get("libraries").and_then(|v| v.as_array()) {
        for lib in libs {
            if let Some(p) = resolve_library_path(&g_dir, &loader_path, lib) {
                if let Some(fname) = p.file_name().and_then(|f| f.to_str()) {
                    if p.exists() && seen_filenames.insert(fname.to_string()) {
                        classpath_entries.push(p);
                    }
                }
            }
        }
    }

    // Add client jar
    if client_jar_path.exists() {
        classpath_entries.push(client_jar_path);
    }

    let classpath_str = classpath_entries
        .into_iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join(";");

    // 7. Build JVM arguments
    emit_progress(&app, "Assemblage des arguments de lancement…", 70);
    let mut jvm_args: Vec<String> = Vec::new();
    jvm_args.push(format!("-Xmx{ram}G"));
    jvm_args.push("-Xms1G".to_string());
    jvm_args.push("-XX:+UnlockExperimentalVMOptions".to_string());
    jvm_args.push("-XX:G1NewSizePercent=20".to_string());
    jvm_args.push("-XX:G1ReservePercent=20".to_string());
    jvm_args.push("-XX:MaxGCPauseMillis=50".to_string());
    jvm_args.push("-XX:G1HeapRegionSize=32M".to_string());
    jvm_args.push("-Dfml.ignoreInvalidMinecraftCertificates=true".to_string());

    let natives_dir = g_dir.join("versions").join(&mc_version).join("natives");
    let _ = fs::create_dir_all(&natives_dir);
    let natives_str = natives_dir.to_string_lossy().replace('\\', "/");
    jvm_args.push(format!("-Djava.library.path={natives_str}"));
    jvm_args.push(format!("-Djna.tmpdir={natives_str}"));
    jvm_args.push(format!("-Dorg.lwjgl.system.SharedLibraryExtractPath={natives_str}"));
    jvm_args.push(format!("-Dio.netty.native.workdir={natives_str}"));

    // User configured JVM args
    let cfg = load_config();
    if let Some(user_jvm) = cfg.get("jvmArgs").and_then(|v| v.as_str()) {
        for arg in user_jvm.split_whitespace() {
            if !arg.is_empty() {
                jvm_args.push(arg.to_string());
            }
        }
    }

    // Add loader JVM arguments if present
    if let Some(lj) = &loader_json {
        if let Some(loader_jvm) = lj.pointer("/arguments/jvm").and_then(|v| v.as_array()) {
            let lib_dir_str = loader_path.join("libraries").to_string_lossy().replace('\\', "/");
            for arg_val in loader_jvm {
                if let Some(raw_arg) = arg_val.as_str() {
                    let formatted = raw_arg
                        .replace("${version_name}", &mc_version)
                        .replace("${library_directory}", &lib_dir_str)
                        .replace("${classpath_separator}", ";");
                    jvm_args.push(formatted);
                }
            }
        }
    }

    // Add classpath
    jvm_args.push("-cp".to_string());
    jvm_args.push(classpath_str);

    // 8. Main Class
    let mut full_cmd_args: Vec<String> = jvm_args;
    full_cmd_args.push(main_class);

    // 9. Game arguments
    let asset_index = version_json
        .pointer("/assetIndex/id")
        .and_then(|v| v.as_str())
        .unwrap_or("17");
    let assets_dir_str = g_dir.join("assets").to_string_lossy().replace('\\', "/");
    let game_dir_str = g_dir.to_string_lossy().replace('\\', "/");

    let user_type = if account.is_microsoft() { "msa" } else { "legacy" };

    full_cmd_args.push("--username".to_string());
    full_cmd_args.push(account.name.clone());
    full_cmd_args.push("--version".to_string());
    full_cmd_args.push(mc_version.clone());
    full_cmd_args.push("--gameDir".to_string());
    full_cmd_args.push(game_dir_str);
    full_cmd_args.push("--assetsDir".to_string());
    full_cmd_args.push(assets_dir_str);
    full_cmd_args.push("--assetIndex".to_string());
    full_cmd_args.push(asset_index.to_string());
    full_cmd_args.push("--uuid".to_string());
    full_cmd_args.push(account.uuid.clone());
    full_cmd_args.push("--accessToken".to_string());
    full_cmd_args.push(if account.access_token.is_empty() { "0".into() } else { account.access_token.clone() });
    full_cmd_args.push("--userType".to_string());
    full_cmd_args.push(user_type.to_string());
    full_cmd_args.push("--versionType".to_string());
    full_cmd_args.push("release".to_string());

    // Screen resolution
    let resolution = cfg.get("resolution").and_then(|v| v.as_str()).unwrap_or("1280x720");
    let (w, h) = resolution.split_once('x').unwrap_or(("1280", "720"));
    full_cmd_args.push("--width".to_string());
    full_cmd_args.push(w.to_string());
    full_cmd_args.push("--height".to_string());
    full_cmd_args.push(h.to_string());

    // Target server auto-join
    let mut parts = mc_version.split('.').filter_map(|part| part.parse::<u32>().ok());
    let major = parts.next().unwrap_or(1);
    let minor = parts.next().unwrap_or(0);
    if major > 1 || minor >= 20 {
        let host = if server.host.contains(':') && !server.host.starts_with('[') {
            format!("[{}]", server.host)
        } else {
            server.host.to_string()
        };
        full_cmd_args.push("--quickPlayMultiplayer".to_string());
        full_cmd_args.push(format!("{host}:{}", server.game_port));
    } else {
        full_cmd_args.push("--server".to_string());
        full_cmd_args.push(server.host.to_string());
        full_cmd_args.push("--port".to_string());
        full_cmd_args.push(server.game_port.to_string());
    }

    // Add loader game arguments if present
    if let Some(lj) = &loader_json {
        if let Some(loader_game) = lj.pointer("/arguments/game").and_then(|v| v.as_array()) {
            for arg_val in loader_game {
                if let Some(s) = arg_val.as_str() {
                    full_cmd_args.push(s.to_string());
                }
            }
        }
    }

    emit_progress(&app, "Lancement du processus Minecraft…", 100);

    log_line("INFO", &format!("Lancement de Java: {} avec {} arguments", java_bin.display(), full_cmd_args.len()));

    let mut cmd = Command::new(java_bin);
    cmd.args(&full_cmd_args);
    cmd.current_dir(&g_dir);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("Erreur spawn Java: {e}"))?;
    let pid = child.id();
    log_line("INFO", &format!("Minecraft démarré avec PID {pid}"));

    if let Some(state) = app.try_state::<LauncherState>() {
        if let Ok(mut g) = state.running_game.lock() {
            *g = Some(pid);
        }
    }

    // Minimize launcher window if configured
    let minimize_on_launch = cfg.get("minimizeOnLaunch").and_then(|v| v.as_bool()).unwrap_or(false);
    let close_on_launch = cfg.get("closeOnLaunch").and_then(|v| v.as_bool()).unwrap_or(false);

    if let Some(main_win) = app.get_webview_window("main") {
        if close_on_launch {
            let _ = main_win.close();
        } else if minimize_on_launch {
            let _ = main_win.minimize();
        }
    }

    // Stream logs
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let app_clone = app.clone();
    if let Some(out) = stdout {
        let app_handle = app_clone.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(out);
            for line in reader.lines().flatten() {
                let _ = app_handle.emit("game-log", &line);
            }
        });
    }

    let app_clone2 = app.clone();
    if let Some(err) = stderr {
        let app_handle = app_clone2.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(err);
            for line in reader.lines().flatten() {
                let _ = app_handle.emit("game-log", &line);
            }
        });
    }

    // Wait for process exit in background thread
    let app_clone3 = app.clone();
    std::thread::spawn(move || {
        let status = child.wait();
        let code = status.map(|s| s.code().unwrap_or(0)).unwrap_or(-1);
        log_line("INFO", &format!("Processus Minecraft terminé avec code {code}"));

        if let Some(state) = app_clone3.try_state::<LauncherState>() {
            if let Ok(mut g) = state.running_game.lock() {
                *g = None;
            }
        }

        if let Some(main_win) = app_clone3.get_webview_window("main") {
            let _ = main_win.unminimize();
            let _ = main_win.show();
            let _ = main_win.set_focus();
        }

        let client_mods = crate::config::get_client_mods();
        crate::config::save_config(&json!({ "clientMods": client_mods }));
        let _ = app_clone3.emit("client-mods-updated", &client_mods);
        let _ = app_clone3.emit("game-closed", code);
    });

    Ok(())
}
