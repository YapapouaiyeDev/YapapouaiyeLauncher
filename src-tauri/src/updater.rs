use crate::config::{load_config, save_config};
use crate::paths::{env_opt, log_line, APP_VERSION, USER_AGENT};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::time::Duration;

const GITHUB_OWNER: &str = "YapapouaiyeDev";
const GITHUB_REPO: &str = "YapapouaiyeLauncher";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VersionParsed {
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
    pub build: u32,
}

pub fn parse_launcher_version(v: &str) -> Option<VersionParsed> {
    let clean = v.trim().trim_start_matches('v').trim_start_matches('V');
    let (base, build_part) = match clean.split_once('-') {
        Some((b, s)) => (b, s),
        None => (clean, ""),
    };
    let parts: Vec<&str> = base.split('.').collect();
    if parts.len() < 3 {
        return None;
    }
    let major = parts[0].parse::<u32>().ok()?;
    let minor = parts[1].parse::<u32>().ok()?;
    let patch = parts[2].parse::<u32>().ok()?;
    let build = if !build_part.is_empty() {
        build_part.parse::<u32>().unwrap_or(0)
    } else {
        0
    };
    Some(VersionParsed {
        major,
        minor,
        patch,
        build,
    })
}

pub fn is_launcher_version_newer(latest: &str, current: &str) -> bool {
    let l = parse_launcher_version(latest);
    let c = parse_launcher_version(current);
    match (l, c) {
        (Some(l), Some(c)) => {
            if l.major != c.major {
                return l.major > c.major;
            }
            if l.minor != c.minor {
                return l.minor > c.minor;
            }
            if l.patch != c.patch {
                return l.patch > c.patch;
            }
            l.build > c.build
        }
        _ => latest != current,
    }
}

fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(15))
        .build()
        .expect("http")
}

pub async fn check_for_updates() -> Value {
    let client = http_client();
    let url = format!("https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/releases/latest");
    let mut req = client.get(&url).header("Accept", "application/vnd.github+json");
    if let Some(token) = env_opt("GITHUB_TOKEN").or_else(|| env_opt("GH_TOKEN")) {
        req = req.header("Authorization", format!("Bearer {token}"));
    }

    match req.send().await {
        Ok(res) if res.status().is_success() => {
            if let Ok(info) = res.json::<Value>().await {
                let tag = info
                    .get("tag_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim_start_matches('v')
                    .to_string();
                let current = APP_VERSION;
                let update_available = if !tag.is_empty() {
                    is_launcher_version_newer(&tag, current)
                } else {
                    false
                };
                return json!({
                    "success": true,
                    "version": tag,
                    "updateAvailable": update_available
                });
            }
            json!({ "success": false, "error": "JSON de release GitHub invalide" })
        }
        Ok(res) => {
            log_line("WARN", &format!("check_for_updates status: {}", res.status()));
            json!({ "success": false, "error": format!("GitHub status: {}", res.status()) })
        }
        Err(e) => {
            log_line("ERROR", &format!("check_for_updates error: {e}"));
            json!({ "success": false, "error": e.to_string() })
        }
    }
}

pub async fn get_latest_release_info() -> Value {
    let fallback_notes = format!("Yapapouaiye Launcher v{APP_VERSION} : Mise à jour automatique opérationnelle.");
    let client = http_client();

    let mut git_hub_releases: Vec<Value> = Vec::new();
    let mut latest_release: Option<Value> = None;

    let endpoints = [
        format!("https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/releases"),
        format!("https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/releases/latest"),
    ];

    for endpoint in &endpoints {
        let mut req = client.get(endpoint).header("Accept", "application/vnd.github+json");
        if let Some(token) = env_opt("GITHUB_TOKEN").or_else(|| env_opt("GH_TOKEN")) {
            req = req.header("Authorization", format!("Bearer {token}"));
        }
        if let Ok(res) = req.send().await {
            if res.status().is_success() {
                if let Ok(body) = res.json::<Value>().await {
                    if let Some(arr) = body.as_array() {
                        if !arr.is_empty() {
                            git_hub_releases = arr.clone();
                            latest_release = arr.first().cloned();
                            break;
                        }
                    } else if body.get("tag_name").is_some() {
                        git_hub_releases = vec![body.clone()];
                        latest_release = Some(body);
                        break;
                    }
                }
            }
        }
    }

    let mut db_news: Vec<Value> = Vec::new();
    let mut api_success = false;

    let mut candidate_endpoints: Vec<String> = Vec::new();
    if let Some(custom) = env_opt("NEWS_API_URL") {
        candidate_endpoints.push(custom);
    }
    candidate_endpoints.push("http://127.0.0.1:8789/api/news".into());
    candidate_endpoints.push("https://yapapouaiye-launcher.pages.dev/api/news".into());

    for ep in candidate_endpoints {
        let sep = if ep.contains('?') { "&" } else { "?" };
        let now = chrono::Utc::now().timestamp_millis();
        let full = format!("{ep}{sep}_t={now}");
        if let Ok(res) = client.get(&full).send().await {
            if res.status().is_success() {
                if let Ok(parsed) = res.json::<Value>().await {
                    if let Some(items) = parsed.get("news").or_else(|| parsed.get("entries")).and_then(|v| v.as_array()) {
                        db_news = items.clone();
                        api_success = true;
                        break;
                    }
                }
            }
        }
    }

    if !api_success {
        let candidates = [
            PathBuf::from("site/news.json"),
            PathBuf::from("../site/news.json"),
            crate::paths::launcher_dir().join("news.json"),
        ];
        for path in candidates {
            if let Ok(text) = fs::read_to_string(path) {
                if let Ok(parsed) = serde_json::from_str::<Value>(&text) {
                    if let Some(items) = parsed.get("news").or_else(|| parsed.get("entries")).and_then(|v| v.as_array()) {
                        db_news = items.clone();
                        break;
                    }
                }
            }
        }
    }

    let mut merged_news = Vec::new();
    let mut added_ids = std::collections::HashSet::new();

    for item in db_news {
        let id_str = item.get("id").and_then(|v| v.as_str()).unwrap_or("");
        let is_gh = item.get("isGithubRelease").and_then(|v| v.as_bool()).unwrap_or(false)
            || id_str.to_lowercase().starts_with("gh-");
        if is_gh {
            continue;
        }
        let post_id = if !id_str.is_empty() {
            id_str.to_string()
        } else {
            format!("news-{}", merged_news.len())
        };
        if added_ids.insert(post_id) {
            merged_news.push(item);
        }
    }

    let final_version = latest_release
        .as_ref()
        .and_then(|r| r.get("tag_name"))
        .and_then(|t| t.as_str())
        .map(|s| s.trim_start_matches('v').to_string())
        .unwrap_or_else(|| APP_VERSION.to_string());

    let final_notes = latest_release
        .as_ref()
        .and_then(|r| r.get("body"))
        .and_then(|b| b.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or(fallback_notes);

    let latest_release_url = latest_release
        .as_ref()
        .and_then(|r| r.get("html_url"))
        .and_then(|u| u.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}/releases/latest"));

    json!({
        "version": final_version,
        "notes": final_notes,
        "news": merged_news,
        "releases": git_hub_releases,
        "latestReleaseUrl": latest_release_url
    })
}

pub fn check_first_launch_after_update() -> Value {
    let cfg = load_config();
    let last_seen = cfg.get("lastSeenVersion").and_then(|v| v.as_str());
    let current = APP_VERSION;
    json!({
        "isFirstLaunchAfterUpdate": last_seen != Some(current),
        "version": current
    })
}

pub fn mark_version_seen() -> Value {
    save_config(&json!({ "lastSeenVersion": APP_VERSION }));
    json!({ "success": true })
}
