use crate::paths::{config_file, game_dir, log_line};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientModNightVision {
    #[serde(default)]
    pub enabled: bool,
    #[serde(rename = "gammaLevel", default = "default_gamma_level")]
    pub gamma_level: u32,
    #[serde(default = "default_rshift")]
    pub keybind: String,
}

fn default_rshift() -> String {
    "RSHIFT".into()
}

fn default_key_c() -> String {
    "C".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientModNoFog {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(rename = "netherFog", default = "default_true")]
    pub nether_fog: bool,
    #[serde(rename = "waterFog", default = "default_true")]
    pub water_fog: bool,
    #[serde(rename = "skyFog", default = "default_true")]
    pub sky_fog: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientModFps {
    #[serde(default)]
    pub enabled: bool,
    #[serde(rename = "fastMath", default = "default_true")]
    pub fast_math: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientModZoom {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(rename = "smoothZoom", default = "default_true")]
    pub smooth_zoom: bool,
    #[serde(default = "default_key_c")]
    pub keybind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientModFullBright {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(rename = "gammaLevel", default = "default_gamma_level")]
    pub gamma_level: u32,
}

fn default_gamma_level() -> u32 {
    100
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientModToggle {
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

fn default_false() -> bool {
    false
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientModArmorHud {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(rename = "showNumbers", default = "default_true")]
    pub show_numbers: bool,
}

impl Default for ClientModToggle {
    fn default() -> Self {
        Self { enabled: true }
    }
}

impl Default for ClientModArmorHud {
    fn default() -> Self {
        Self { enabled: true, show_numbers: true }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientMods {
    #[serde(rename = "fullBright", default = "default_full_bright")]
    pub full_bright: ClientModFullBright,
    #[serde(rename = "nightVision", default)]
    pub night_vision: ClientModNightVision,
    #[serde(rename = "noFog", default)]
    pub no_fog: ClientModNoFog,
    #[serde(rename = "fpsBoost", default)]
    pub fps_boost: ClientModFps,
    #[serde(default)]
    pub zoom: ClientModZoom,
    #[serde(default)]
    pub keystrokes: ClientModToggle,
    #[serde(rename = "armorHud", default)]
    pub armor_hud: ClientModArmorHud,
    #[serde(default)]
    pub speed: ClientModToggle,
    #[serde(default)]
    pub fps: ClientModToggle,
    #[serde(default)]
    pub ping: ClientModToggle,
}

fn default_full_bright() -> ClientModFullBright {
    ClientModFullBright {
        enabled: true,
        gamma_level: 100,
    }
}

impl Default for ClientMods {
    fn default() -> Self {
        Self {
            full_bright: default_full_bright(),
            night_vision: ClientModNightVision::default(),
            no_fog: ClientModNoFog::default(),
            fps_boost: ClientModFps::default(),
            zoom: ClientModZoom::default(),
            keystrokes: ClientModToggle::default(),
            armor_hud: ClientModArmorHud::default(),
            speed: ClientModToggle::default(),
            fps: ClientModToggle::default(),
            ping: ClientModToggle::default(),
        }
    }
}

impl Default for ClientModNightVision {
    fn default() -> Self {
        Self { enabled: false, gamma_level: 100, keybind: "RSHIFT".into() }
    }
}

impl Default for ClientModNoFog {
    fn default() -> Self {
        Self { enabled: true, nether_fog: true, water_fog: true, sky_fog: true }
    }
}

impl Default for ClientModFps {
    fn default() -> Self {
        // Aligne sur Electron : fpsBoost desactive par defaut.
        Self { enabled: false, fast_math: true }
    }
}

impl Default for ClientModZoom {
    fn default() -> Self {
        Self { enabled: true, smooth_zoom: true, keybind: "C".into() }
    }
}

impl Default for ClientModFullBright {
    fn default() -> Self {
        Self { enabled: true, gamma_level: 100 }
    }
}

pub fn load_config() -> Value {
    match fs::read_to_string(config_file()) {
        Ok(raw) => {
            if raw.trim().is_empty() {
                return default_config_value();
            }
            match serde_json::from_str::<Value>(&raw) {
                Ok(v) => normalize_config_value(v),
                Err(err) => {
                    // Backup du fichier corrompu au lieu de tout abandonner :
                    // le prochain save_config repart des defauts + patch,
                    // sans ecraser silencieusement les reglages sains.
                    let backup = config_file().with_extension(format!(
                        "corrupt-{}.bak",
                        std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|d| d.as_millis())
                            .unwrap_or(0)
                    ));
                    let _ = fs::copy(config_file(), &backup);
                    log_line("ERROR", &format!("config.json illisible, sauvegarde en {backup:?}: {err}"));
                    default_config_value()
                }
            }
        }
        Err(_) => default_config_value(),
    }
}

fn default_config_value() -> Value {
    json!({ "ram": 4, "activeServerId": "adoserv2" })
}

fn normalize_config_value(v: Value) -> Value {
    let mut out = default_config_value();
    if let (Some(dst), Some(src)) = (out.as_object_mut(), v.as_object()) {
        for (k, val) in src {
            dst.insert(k.clone(), val.clone());
        }
    }
    // Garantit les bornes critiques sans supprimer les cles inconnues.
    if out.get("ram").and_then(|r| r.as_u64()).is_none() {
        if let Some(o) = out.as_object_mut() {
            o.insert("ram".into(), json!(4));
        }
    }
    if out.get("activeServerId").and_then(|s| s.as_str()).map(|s| s.is_empty()).unwrap_or(true) {
        if let Some(o) = out.as_object_mut() {
            o.insert("activeServerId".into(), json!("adoserv2"));
        }
    }
    out
}

pub fn save_config(patch: &Value) -> bool {
    // Relit le brut (sans normalisation destructive) puis ecrit en atomique
    // via fichier tmp + rename : pas de troncature en cas de crash.
    let existing = load_config();
    let mut merged = existing;
    if let (Some(dst), Some(src)) = (merged.as_object_mut(), patch.as_object()) {
        for (k, v) in src {
            dst.insert(k.clone(), v.clone());
        }
    }
    if let Ok(text) = serde_json::to_string_pretty(&merged) {
        let cfg = config_file();
        if let Some(parent) = cfg.parent() {
            if fs::create_dir_all(parent).is_err() { return false; }
        }
        let tmp = cfg.with_extension("tmp");
        if fs::write(&tmp, text).is_ok() {
            return fs::rename(&tmp, &cfg).is_ok();
        }
    }
    false
}

pub fn get_client_mods() -> ClientMods {
    let cfg = load_config();
    let mut mods = ClientMods::default();
    if let Some(raw) = cfg.get("clientMods") {
        if let Ok(parsed) = serde_json::from_value::<ClientMods>(raw.clone()) {
            mods = parsed;
        } else if let Ok(partial) = serde_json::from_value::<Value>(raw.clone()) {
            if let Ok(merged) = serde_json::from_value(merge_json(
                serde_json::to_value(&mods).unwrap_or(json!({})),
                partial,
            )) {
                mods = merged;
            }
        }
    }
    mods
}

fn merge_json(base: Value, patch: Value) -> Value {
    // Deep merge : les sous-objets (modules client) sont fusionnes cle par
    // cle au lieu d'etre remplaces (evite de perdre gammaLevel/keybind/...).
    match (base, patch) {
        (Value::Object(mut b), Value::Object(p)) => {
            for (k, v) in p {
                let merged = match b.remove(&k) {
                    Some(existing) => merge_json(existing, v),
                    None => v,
                };
                b.insert(k, merged);
            }
            Value::Object(b)
        }
        (_, patch) => patch,
    }
}

pub fn save_client_mods(patch: Value) -> ClientMods {
    let mods = resolve_client_mods(patch);
    save_config(&json!({ "clientMods": mods }));
    sync_client_options(&mods);
    mods
}

pub fn resolve_client_mods(patch: Value) -> ClientMods {
    let current = serde_json::to_value(get_client_mods()).unwrap_or(json!({}));
    let merged_val = merge_json(current, patch);
    serde_json::from_value(merged_val).unwrap_or_default()
}

pub fn sync_client_options(mods: &ClientMods) {
    let dir = game_dir();
    let _ = fs::create_dir_all(&dir);
    let options_path = dir.join("options.txt");
    let mut map: BTreeMap<String, String> = BTreeMap::new();
    if let Ok(raw) = fs::read_to_string(&options_path) {
        for line in raw.lines() {
            if let Some((k, v)) = line.split_once(':') {
                map.insert(k.trim().to_string(), v.trim().to_string());
            }
        }
    }
    if mods.full_bright.enabled {
        let level = if mods.full_bright.gamma_level >= 1 {
            mods.full_bright.gamma_level
        } else {
            100
        };
        map.insert("gamma".into(), format!("{level}.0"));
    } else if map
        .get("gamma")
        .and_then(|g| g.parse::<f32>().ok())
        .unwrap_or(1.0)
        > 1.5
    {
        map.insert("gamma".into(), "1.0".into());
    }
    if mods.no_fog.enabled {
        map.entry("renderDistance".into())
            .or_insert_with(|| "12".into());
    }
    if !map.contains_key("gamma") {
        map.insert(
            "gamma".into(),
            if mods.full_bright.enabled {
                "100.0".into()
            } else {
                "1.0".into()
            },
        );
    }
    map.insert("menuBackgroundBlurriness".into(), "0".into());
    let out = map
        .into_iter()
        .filter(|(k, _)| !k.is_empty())
        .map(|(k, v)| format!("{k}:{v}"))
        .collect::<Vec<_>>()
        .join("\n");
    if let Err(err) = fs::write(options_path, out) {
        log_line("ERROR", &format!("options.txt: {err}"));
    }

    // Write Yapapouaiye Client config for companion mod in-game
    // (11 cles comme Electron : le mod en jeu voit la meme config
    // quel que soit le runtime, pas de divergence au lancement).
    let config_dir = dir.join("config");
    let _ = fs::create_dir_all(&config_dir);
    let client_json = serde_json::json!({
        "fullBright": mods.full_bright.enabled,
        "nightVision": mods.night_vision.enabled,
        "noFog": mods.no_fog.enabled,
        "zoom": mods.zoom.enabled,
        "fpsBoost": mods.fps_boost.enabled,
        "keystrokes": mods.keystrokes.enabled,
        "armorHud": mods.armor_hud.enabled,
        "armorHudNumbers": mods.armor_hud.show_numbers,
        "speed": mods.speed.enabled,
        "fps": mods.fps.enabled,
        "ping": mods.ping.enabled
    });
    if let Ok(client_str) = serde_json::to_string_pretty(&client_json) {
        let _ = fs::write(config_dir.join("yapapouaiye_client.json"), &client_str);
        let _ = fs::write(config_dir.join("lunar_client.json"), &client_str);
    }
}

