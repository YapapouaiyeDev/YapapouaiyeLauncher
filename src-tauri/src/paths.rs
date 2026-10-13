use std::fs;
use std::path::{Path, PathBuf};

pub const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
#[allow(dead_code)]
pub const APP_USER_MODEL_ID: &str = "com.yapapouaiye.launcher";
pub const USER_AGENT: &str = concat!("YapapouaiyeLauncher/", env!("CARGO_PKG_VERSION"));

pub fn launcher_dir() -> PathBuf {
    dirs::data_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".yapapouaiye-launcher")
}

pub fn game_dir() -> PathBuf {
    launcher_dir().join("minecraft")
}

pub fn mods_dir() -> PathBuf {
    game_dir().join("mods")
}

pub fn custom_mods_dir() -> PathBuf {
    launcher_dir().join("mods-custom")
}

pub fn accounts_file() -> PathBuf {
    launcher_dir().join("accounts.json")
}

pub fn config_file() -> PathBuf {
    launcher_dir().join("config.json")
}

pub fn log_file() -> PathBuf {
    launcher_dir().join("launcher.log")
}

pub fn mods_hash_file(server_id: &str) -> PathBuf {
    launcher_dir().join(format!("mods-hash-{server_id}.json"))
}

pub fn server_mods_dir(server_id: &str) -> PathBuf {
    launcher_dir().join("mods").join(server_id)
}

pub fn runtime_dir() -> PathBuf {
    launcher_dir().join("runtime")
}

#[allow(dead_code)]
pub fn natives_dir() -> PathBuf {
    game_dir().join("natives")
}

pub fn ensure_dirs() {
    for dir in [
        launcher_dir(),
        game_dir(),
        mods_dir(),
        custom_mods_dir(),
        launcher_dir().join("mods"),
        runtime_dir(),
    ] {
        let _ = fs::create_dir_all(dir);
    }
}

pub fn log_line(level: &str, message: &str) {
    ensure_dirs();
    let line = format!(
        "[{}] [{level}] {message}\n",
        chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
    );
    let _ = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_file())
        .and_then(|mut f| {
            use std::io::Write;
            f.write_all(line.as_bytes())
        });
    eprintln!("{line}");
}

pub fn load_env() {
    let candidates = [
        launcher_dir().join(".env"),
        PathBuf::from(".env"),
        PathBuf::from("../.env"),
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.join(".env")))
            .unwrap_or_else(|| PathBuf::from(".env")),
    ];
    for path in candidates {
        if path.exists() {
            let _ = dotenvy::from_path(&path);
        }
    }
    let _ = dotenvy::dotenv();
}

pub fn env_or(key: &str, fallback: &str) -> String {
    std::env::var(key)
        .ok()
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

pub fn env_opt(key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|v| !v.is_empty())
}

pub fn copy_dir_jars(src: &Path, dest: &Path) {
    let Ok(entries) = fs::read_dir(src) else {
        return;
    };
    let _ = fs::create_dir_all(dest);
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if name_str.to_lowercase().ends_with(".jar") {
            let _ = fs::copy(entry.path(), dest.join(name));
        }
    }
}
