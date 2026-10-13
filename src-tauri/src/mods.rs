use crate::paths::{
    copy_dir_jars, custom_mods_dir, env_opt, env_or, game_dir, log_line, mods_dir, mods_hash_file,
    server_mods_dir, USER_AGENT,
};
use crate::servers::{get_server, Loader, ModsSource, ServerDef};
use hmac::{Hmac, Mac};
use md5::Md5;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Emitter};

type HmacSha256 = Hmac<Sha256>;

fn http() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .expect("http")
}

fn sha256_file(path: &Path) -> Option<String> {
    let mut f = fs::File::open(path).ok()?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = f.read(&mut buf).ok()?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Some(hex::encode(hasher.finalize()))
}

fn md5_file(path: &Path) -> Option<String> {
    let mut f = fs::File::open(path).ok()?;
    let mut hasher = Md5::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = f.read(&mut buf).ok()?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Some(hex::encode(hasher.finalize()))
}

/// Config B2 avec les mêmes valeurs par défaut que le launcher Electron.
/// Les jars AdoServ67 sont à la RACINE du bucket → préfixe "" par défaut
/// (l'ancien défaut "mods/" listait un dossier vide = 0 mod sans erreur).
fn b2_cfg(key: &str, fallback: &str) -> String {
    env_opt(key).unwrap_or_else(|| fallback.to_string())
}

// Clés lecture-seule du bucket (identiques au launcher Electron —
// la publication utilise des clés master séparées via .env, jamais embarquées).
const B2_REGION_FALLBACK: &str = "eu-central-003";
const B2_BUCKET_FALLBACK: &str = "adoserv67";
const B2_KEY_ID_FALLBACK: &str = "0037d97c4a6b9440000000001";
const B2_APP_KEY_FALLBACK: &str = "K003EUdKUJNstI0k9WSA4+bU+1ItRMc";

fn load_hash_cache(server_id: &str) -> HashMap<String, String> {
    fs::read_to_string(mods_hash_file(server_id))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_hash_cache(server_id: &str, map: &HashMap<String, String>) {
    if let Ok(text) = serde_json::to_string_pretty(map) {
        let _ = fs::write(mods_hash_file(server_id), text);
    }
}

fn emit_progress(app: &AppHandle, msg: &str, percent: i64) {
    let _ = app.emit(
        "progress",
        json!({ "type": "download", "task": msg, "percent": percent }),
    );
    log_line("INFO", msg);
}

fn gitea_base() -> String {
    env_or("GITEA_URL", "https://gitea.com").trim_end_matches('/').to_string()
}

fn gitea_headers(req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    let mut req = req.header("User-Agent", USER_AGENT);
    if let Some(token) = env_opt("GITEA_TOKEN") {
        req = req.header("Authorization", format!("token {token}"));
    }
    req
}

#[derive(Clone, Debug)]
struct RemoteMod {
    name: String,
    sha: String,
    download_url: String,
    #[allow(dead_code)]
    size: u64,
}

async fn list_gitea_mods(server: &ServerDef) -> Result<Vec<RemoteMod>, String> {
    let repo = server
        .gitea_repo
        .map(|s| s.to_string())
        .or_else(|| {
            Some(format!(
                "{}/{}",
                env_or("GITEA_OWNER", "hannyvan26"),
                env_or("GITEA_REPO", "AdoServ-2")
            ))
        })
        .ok_or("repo gitea manquant")?;
    let branch = env_or("GITEA_BRANCH", "main");
    let url = format!(
        "{}/api/v1/repos/{}/contents/mods?ref={}",
        gitea_base(),
        repo,
        urlencoding::encode(&branch)
    );
    let res = gitea_headers(http().get(&url))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = res.status();
    let text = res.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("gitea list {status}: {text}"));
    }
    let arr: Vec<Value> = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    Ok(arr
        .into_iter()
        .filter_map(|item| {
            let name = item.get("name")?.as_str()?.to_string();
            if !name.to_lowercase().ends_with(".jar") {
                return None;
            }
            let sha = item
                .get("sha")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let download_url = item
                .get("download_url")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| {
                    format!(
                        "{}/api/v1/repos/{}/raw/{}/mods/{}",
                        gitea_base(),
                        repo,
                        branch,
                        name
                    )
                });
            let size = item.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
            Some(RemoteMod {
                name,
                sha,
                download_url,
                size,
            })
        })
        .collect())
}

fn aws_sign(
    method: &str,
    host: &str,
    path: &str,
    query: &str,
    payload_hash: &str,
    key_id: &str,
    secret: &str,
    region: &str,
    extra_headers: &[(&str, &str)],
) -> (String, String) {
    let now = chrono::Utc::now();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date_stamp = now.format("%Y%m%d").to_string();
    let service = "s3";
    let mut headers: Vec<(String, String)> = vec![
        ("host".into(), host.to_string()),
        ("x-amz-content-sha256".into(), payload_hash.to_string()),
        ("x-amz-date".into(), amz_date.clone()),
    ];
    for (k, v) in extra_headers {
        headers.push((k.to_lowercase(), v.to_string()));
    }
    headers.sort_by(|a, b| a.0.cmp(&b.0));
    let signed_headers = headers
        .iter()
        .map(|(k, _)| k.as_str())
        .collect::<Vec<_>>()
        .join(";");
    let canonical_headers = headers
        .iter()
        .map(|(k, v)| format!("{k}:{}\n", v.trim()))
        .collect::<String>();
    let canonical_request = format!(
        "{method}\n{path}\n{query}\n{canonical_headers}\n{signed_headers}\n{payload_hash}"
    );
    let mut hasher = Sha256::new();
    hasher.update(canonical_request.as_bytes());
    let canonical_hash = hex::encode(hasher.finalize());
    let credential_scope = format!("{date_stamp}/{region}/{service}/aws4_request");
    let string_to_sign = format!("AWS4-HMAC-SHA256\n{amz_date}\n{credential_scope}\n{canonical_hash}");

    fn hmac(key: &[u8], data: &[u8]) -> Vec<u8> {
        let mut mac = HmacSha256::new_from_slice(key).expect("hmac");
        mac.update(data);
        mac.finalize().into_bytes().to_vec()
    }
    let k_date = hmac(format!("AWS4{secret}").as_bytes(), date_stamp.as_bytes());
    let k_region = hmac(&k_date, region.as_bytes());
    let k_service = hmac(&k_region, service.as_bytes());
    let k_signing = hmac(&k_service, b"aws4_request");
    let signature = hex::encode(hmac(&k_signing, string_to_sign.as_bytes()));
    let auth = format!(
        "AWS4-HMAC-SHA256 Credential={key_id}/{credential_scope}, SignedHeaders={signed_headers}, Signature={signature}"
    );
    (amz_date, auth)
}

/// Jeu de caractères non-échappés par segment de clé (équivalent JS encodeURIComponent).
const SEGMENT_SET: &percent_encoding::AsciiSet = &percent_encoding::NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'~');

fn encode_key(key: &str) -> String {
    key.split('/')
        .map(|s| percent_encoding::utf8_percent_encode(s, SEGMENT_SET).to_string())
        .collect::<Vec<_>>()
        .join("/")
}

fn b2_host(endpoint: &str) -> String {
    endpoint
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .trim_end_matches('/')
        .to_string()
}

fn b2_payload_hash() -> String {
    let mut h = Sha256::new();
    h.update(b"");
    hex::encode(h.finalize())
}

async fn b2_list_prefix(
    endpoint: &str,
    bucket: &str,
    host: &str,
    prefix: &str,
    key_id: &str,
    app_key: &str,
    region: &str,
) -> Result<Vec<RemoteMod>, String> {
    let path = format!("/{bucket}");
    let query = format!(
        "list-type=2&prefix={}",
        percent_encoding::utf8_percent_encode(prefix, percent_encoding::NON_ALPHANUMERIC)
    );
    let payload_hash = b2_payload_hash();
    let (amz_date, auth) = aws_sign(
        "GET", host, &path, &query, &payload_hash, key_id, app_key, region, &[],
    );
    let url = format!("{endpoint}{path}?{query}");
    let res = http()
        .get(&url)
        .header("Authorization", auth)
        .header("x-amz-date", amz_date)
        .header("x-amz-content-sha256", payload_hash)
        .header("Host", host)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = res.status();
    let text = res.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("b2 list {status}: {text}"));
    }
    parse_s3_list(&text, endpoint, bucket)
}

/// Lit le manifest mods.json optionnel (mêmes clés que le launcher Electron :
/// tableau ou {"mods": [...]}, champs sha|etag|hash + size) pour enrichir
/// les entrées du listing (sinon sha = ETag S3 uniquement).
async fn enrich_b2_manifest(
    listed: &mut [RemoteMod],
    endpoint: &str,
    bucket: &str,
    used_prefix: &str,
    key_id: &str,
    app_key: &str,
    region: &str,
) {
    let clean_prefix = used_prefix.trim_matches('/');
    let manifest_key = if clean_prefix.is_empty() {
        "mods.json".to_string()
    } else {
        format!("{clean_prefix}/mods.json")
    };
    let url = format!(
        "{}/{}/{}",
        endpoint.trim_end_matches('/'),
        bucket,
        encode_key(&manifest_key)
    );
    let bytes = match signed_b2_get_bytes(&url, key_id, app_key, region).await {
        Ok(b) => b,
        Err(_) => return, // manifest optionnel
    };
    let raw = String::from_utf8_lossy(&bytes).trim().to_string();
    apply_b2_manifest(listed, &raw);
}

/// Fusion pure manifest → listing (testable sans réseau).
fn apply_b2_manifest(listed: &mut [RemoteMod], raw: &str) {
    let raw = raw.trim();
    if !(raw.starts_with('{') || raw.starts_with('[')) {
        return;
    }
    let parsed: Value = match serde_json::from_str(raw) {
        Ok(v) => v,
        Err(_) => return,
    };
    let arr = if parsed.is_array() {
        parsed
    } else {
        parsed.get("mods").cloned().unwrap_or(Value::Null)
    };
    let list = match arr.as_array() {
        Some(a) => a,
        None => return,
    };
    let mut meta_by_name: HashMap<String, &Value> = HashMap::new();
    for m in list {
        if let Some(name) = m.get("file").or_else(|| m.get("name")).and_then(|v| v.as_str()) {
            let base = name.rsplit('/').next().unwrap_or(name).to_lowercase();
            meta_by_name.insert(base, m);
        }
    }
    for remote_mod in listed.iter_mut() {
        if let Some(meta) = meta_by_name.get(&remote_mod.name.to_lowercase()) {
            if let Some(sha) = meta
                .get("sha")
                .or_else(|| meta.get("etag"))
                .or_else(|| meta.get("hash"))
                .and_then(|v| v.as_str())
            {
                if !sha.is_empty() {
                    remote_mod.sha = sha.to_string();
                }
            }
            if let Some(size) = meta.get("size").and_then(|v| v.as_u64()) {
                if size > 0 {
                    remote_mod.size = size;
                }
            }
        }
    }
}

async fn signed_b2_get_bytes(url: &str, key_id: &str, app_key: &str, region: &str) -> Result<Vec<u8>, String> {
    let parsed = url::Url::parse(url).map_err(|e| e.to_string())?;
    let host = parsed.host_str().unwrap_or("").to_string();
    let path = parsed.path().to_string();
    let query = parsed.query().unwrap_or("");
    let payload_hash = b2_payload_hash();
    let (amz_date, auth) = aws_sign(
        "GET",
        &host,
        &path,
        query,
        &payload_hash,
        key_id,
        app_key,
        region,
        &[],
    );
    let res = http()
        .get(url)
        .header("Authorization", auth)
        .header("x-amz-date", amz_date)
        .header("x-amz-content-sha256", payload_hash)
        .header("Host", host)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("b2 get {} -> {}", url, res.status()));
    }
    res.bytes()
        .await
        .map(|b| b.to_vec())
        .map_err(|e| e.to_string())
}

async fn list_b2_mods() -> Result<Vec<RemoteMod>, String> {
    let region = b2_cfg("B2_REGION", B2_REGION_FALLBACK);
    let bucket = b2_cfg("B2_BUCKET", B2_BUCKET_FALLBACK);
    let endpoint = b2_cfg(
        "B2_ENDPOINT",
        &format!("https://s3.{region}.backblazeb2.com"),
    );
    let prefix = b2_cfg("B2_MODS_PREFIX", "");
    let key_id = b2_cfg("B2_KEY_ID", B2_KEY_ID_FALLBACK);
    let app_key = b2_cfg("B2_APP_KEY", B2_APP_KEY_FALLBACK);

    let host = b2_host(&endpoint);
    log_line("INFO", &format!("B2 listing bucket={bucket} prefix=\"{prefix}\""));

    // Un préfixe configuré qui ne retourne rien = probablement un mauvais
    // préfixe (ex "mods/" alors que les jars sont à la racine) : on essaie
    // la racine avant de conclure, au lieu de valider un wipe.
    let mut prefixes = vec![prefix.clone()];
    if !prefix.is_empty() {
        prefixes.push(String::new());
    }
    let mut used_prefix = prefix.clone();
    let mut listed_ok = false;
    let mut last_err = String::from("listing B2 impossible");
    let mut listed: Vec<RemoteMod> = Vec::new();
    for p in &prefixes {
        match b2_list_prefix(&endpoint, &bucket, &host, p, &key_id, &app_key, &region).await {
            Ok(items) => {
                listed_ok = true;
                if items.is_empty() {
                    log_line(
                        "WARN",
                        &format!("B2 listing prefix=\"{p}\" : 0 jar, essai du préfixe suivant..."),
                    );
                    continue;
                }
                used_prefix = p.clone();
                listed = items;
                break;
            }
            Err(e) => {
                last_err = e.clone();
                log_line("WARN", &format!("B2 listing prefix=\"{p}\" failed: {e}"));
            }
        }
    }
    if !listed.is_empty() {
        enrich_b2_manifest(&mut listed, &endpoint, &bucket, &used_prefix, &key_id, &app_key, &region).await;
        log_line("INFO", &format!("B2 listing: {} jar(s) (prefix=\"{used_prefix}\")", listed.len()));
        return Ok(listed);
    }
    if listed_ok {
        // Listing réussi mais vide sur tous les préfixes : on retourne []
        // et c'est sync_mods qui refusera de wiper (garde-fou anti-vide).
        log_line("WARN", "B2 listing: 0 jar sur tous les préfixes");
        return Ok(vec![]);
    }
    Err(last_err)
}

fn parse_s3_list(xml: &str, endpoint: &str, bucket: &str) -> Result<Vec<RemoteMod>, String> {
    let mut mods = Vec::new();
    // Découpe par blocs <Contents> : ETag/Size sont lus dans le bloc du
    // fichier, jamais mélangés avec le fichier suivant.
    for chunk in xml.split("<Contents>").skip(1) {
        let body = chunk.split("</Contents>").next().unwrap_or(chunk);
        let key = match extract_tag(body, "Key") {
            Some(k) => k,
            None => continue,
        };
        let name = key.rsplit('/').next().unwrap_or(&key).to_string();
        if !name.to_lowercase().ends_with(".jar") {
            continue;
        }
        let etag = extract_tag(body, "ETag").unwrap_or_default().replace('"', "");
        let size = extract_tag(body, "Size")
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        let download_url = format!(
            "{}/{}/{}",
            endpoint.trim_end_matches('/'),
            bucket,
            encode_key(&key)
        );
        mods.push(RemoteMod {
            name,
            sha: etag,
            download_url,
            size,
        });
    }
    Ok(mods)
}

fn extract_tag(s: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let i = s.find(&open)?;
    let after = &s[i + open.len()..];
    let j = after.find(&close)?;
    Some(after[..j].to_string())
}

async fn signed_b2_get(url: &str) -> Result<reqwest::Response, String> {
    let region = b2_cfg("B2_REGION", B2_REGION_FALLBACK);
    let key_id = b2_cfg("B2_KEY_ID", B2_KEY_ID_FALLBACK);
    let app_key = b2_cfg("B2_APP_KEY", B2_APP_KEY_FALLBACK);
    let parsed = url::Url::parse(url).map_err(|e| e.to_string())?;
    let host = parsed.host_str().unwrap_or("").to_string();
    let path = parsed.path().to_string();
    let query = parsed.query().unwrap_or("");
    let payload_hash = {
        let mut h = Sha256::new();
        h.update(b"");
        hex::encode(h.finalize())
    };
    let (amz_date, auth) = aws_sign(
        "GET",
        &host,
        &path,
        query,
        &payload_hash,
        &key_id,
        &app_key,
        &region,
        &[],
    );
    http()
        .get(url)
        .header("Authorization", auth)
        .header("x-amz-date", amz_date)
        .header("x-amz-content-sha256", payload_hash)
        .header("Host", host)
        .send()
        .await
        .map_err(|e| e.to_string())
}

async fn download_file(url: &str, dest: &Path, signed: bool, expected_size: u64) -> Result<(), String> {
    let res = if signed {
        signed_b2_get(url).await?
    } else {
        gitea_headers(http().get(url))
            .send()
            .await
            .map_err(|e| e.to_string())?
    };
    if !res.status().is_success() {
        return Err(format!("download {} -> {}", url, res.status()));
    }
    let bytes = res.bytes().await.map_err(|e| e.to_string())?;
    if bytes.is_empty() {
        return Err("fichier vide reçu".to_string());
    }
    if expected_size > 0 && bytes.len() as u64 != expected_size {
        return Err(format!(
            "taille inattendue ({} vs {} octets attendus)",
            bytes.len(),
            expected_size
        ));
    }
    if let Some(parent) = dest.parent() {
        let _ = fs::create_dir_all(parent);
    }
    // Écriture vers un ".part" + renommage : un téléchargement interrompu
    // ne remplace jamais un .jar valide, même si le launcher est tué.
    let part = dest.with_extension("jar.part");
    fs::write(&part, &bytes).map_err(|e| e.to_string())?;
    fs::rename(&part, dest).map_err(|e| e.to_string())
}

fn clear_jars(dir: &Path) {
    if let Ok(entries) = fs::read_dir(dir) {
        for e in entries.flatten() {
            let p = e.path();
            if p.extension().and_then(|x| x.to_str()).map(|s| s.eq_ignore_ascii_case("jar")).unwrap_or(false) {
                let _ = fs::remove_file(p);
            }
        }
    }
}

fn migrate_legacy_mods() {
    let dest = server_mods_dir("adoserv2");
    if dest.exists() {
        return;
    }
    let legacy = launcher_mods_root();
    if !legacy.exists() {
        return;
    }
    let _ = fs::create_dir_all(&dest);
    copy_dir_jars(&legacy, &dest);
}

fn launcher_mods_root() -> PathBuf {
    crate::paths::launcher_dir().join("mods")
}

pub fn list_local_mods(server_id: &str) -> Vec<Value> {
    migrate_legacy_mods();
    let dir = server_mods_dir(server_id);
    let mut out = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for e in entries.flatten() {
            let p = e.path();
            if p.extension()
                .and_then(|x| x.to_str())
                .map(|s| s.eq_ignore_ascii_case("jar"))
                .unwrap_or(false)
            {
                let meta = e.metadata().ok();
                out.push(json!({
                    "name": p.file_name().and_then(|n| n.to_str()).unwrap_or_default(),
                    "size": meta.as_ref().map(|m| m.len()).unwrap_or(0),
                    "mtime": meta.and_then(|m| m.modified().ok()).and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0),
                }));
            }
        }
    }
    out.sort_by(|a, b| {
        a.get("name")
            .and_then(|v| v.as_str())
            .cmp(&b.get("name").and_then(|v| v.as_str()))
    });
    out
}

/// Un mod local est à jour si : le hash en cache correspond, OU la taille
/// distante connue correspond ET (sha vide déjà vérifié), OU l'empreinte
/// MD5 du fichier correspond à l'ETag S3 (cas : cache perdu).
/// Une taille distante connue et différente force le re-téléchargement.
fn file_up_to_date(dest: &Path, sha: &str, size: u64, cached: Option<&String>) -> bool {
    if sha.is_empty() || !dest.exists() {
        return false;
    }
    if let Ok(meta) = fs::metadata(dest) {
        if size > 0 && meta.len() != size {
            return false;
        }
    } else {
        return false;
    }
    if let Some(c) = cached {
        if c == sha {
            return true;
        }
    }
    // ETag S3 simple (sans suffixe multipart "-N") = MD5 hex du contenu.
    if sha.len() == 32 && sha.chars().all(|c| c.is_ascii_hexdigit()) {
        if let Some(md5) = md5_file(dest) {
            if md5.eq_ignore_ascii_case(sha) {
                return true;
            }
        }
    }
    false
}

pub async fn sync_mods(app: &AppHandle, server_id: &str) -> Result<Value, String> {
    let server = get_server(server_id).ok_or("serveur inconnu")?;
    migrate_legacy_mods();
    emit_progress(app, "Analyse des mods distants…", 5);
    let remote = match server.mods_source {
        ModsSource::Gitea => list_gitea_mods(server).await?,
        ModsSource::B2 => list_b2_mods().await?,
    };
    // GARDE-FOU ANTI-WIPE : un listing distant VIDE (mauvais préfixe, mauvais
    // dossier, bucket vidé par erreur) ne doit JAMAIS effacer les mods locaux
    // ni écraser le cache. Avant : wipe + hash {} + "Mods synchronisés".
    if remote.is_empty() {
        return Err(
            "Aucun mod trouvé sur le dépôt distant — synchronisation annulée, fichiers locaux conservés."
                .to_string(),
        );
    }
    let dest = server_mods_dir(server_id);
    let _ = fs::create_dir_all(&dest);
    // Purge les ".part" orphelins d'un téléchargement tué en plein vol.
    if let Ok(entries) = fs::read_dir(&dest) {
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if name.to_lowercase().ends_with(".part") {
                let _ = fs::remove_file(e.path());
            }
        }
    }
    let mut cache = load_hash_cache(server_id);
    let remote_lower: HashSet<String> = remote.iter().map(|m| m.name.to_lowercase()).collect();

    let mut removed = 0;
    if let Ok(entries) = fs::read_dir(&dest) {
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if name.to_lowercase().ends_with(".jar") && !remote_lower.contains(&name.to_lowercase()) {
                let _ = fs::remove_file(e.path());
                cache.remove(&name);
                removed += 1;
            }
        }
    }

    let total = remote.len().max(1);
    let mut downloaded = 0;
    let mut failed: Vec<String> = Vec::new();
    for (i, remote_mod) in remote.iter().enumerate() {
        let dest_file = dest.join(&remote_mod.name);
        let pct = 10 + ((i as i64 * 80) / total as i64);
        if file_up_to_date(
            &dest_file,
            &remote_mod.sha,
            remote_mod.size,
            cache.get(&remote_mod.name),
        ) {
            emit_progress(app, &format!("OK {}", remote_mod.name), pct);
            continue;
        }
        emit_progress(app, &format!("Téléchargement {}", remote_mod.name), pct);
        // Un mod en échec ne bloque plus toute la synchro : on continue
        // avec les autres et on le retentera à la prochaine synchro.
        match download_file(
            &remote_mod.download_url,
            &dest_file,
            server.mods_source == ModsSource::B2,
            remote_mod.size,
        )
        .await
        {
            Ok(()) => {
                if remote_mod.sha.is_empty() {
                    if let Some(h) = sha256_file(&dest_file) {
                        cache.insert(remote_mod.name.clone(), h);
                    }
                } else {
                    cache.insert(remote_mod.name.clone(), remote_mod.sha.clone());
                }
                downloaded += 1;
            }
            Err(e) => {
                log_line(
                    "WARN",
                    &format!("Échec téléchargement {}: {e}", remote_mod.name),
                );
                failed.push(remote_mod.name.clone());
            }
        }
    }
    save_hash_cache(server_id, &cache);
    apply_server_mods(server_id);
    if failed.is_empty() {
        emit_progress(app, "Mods synchronisés", 100);
    } else {
        emit_progress(
            app,
            &format!("Synchro partielle : {} échec(s)", failed.len()),
            100,
        );
    }
    Ok(json!({
        "ok": true,
        "count": remote.len(),
        "downloaded": downloaded,
        "removed": removed,
        "failed": failed,
        "failedCount": failed.len(),
        "mods": list_local_mods(server_id),
    }))
}

pub fn apply_server_mods(server_id: &str) {
    let dest = mods_dir();
    let _ = fs::create_dir_all(&dest);
    clear_jars(&dest);
    copy_dir_jars(&server_mods_dir(server_id), &dest);
    copy_dir_jars(&custom_mods_dir(), &dest);
}

pub fn open_custom_mods() -> Result<(), String> {
    let dir = custom_mods_dir();
    let _ = fs::create_dir_all(&dir);
    open::that(dir).map_err(|e| e.to_string())
}

#[allow(dead_code)]
pub fn md5_hex(data: &[u8]) -> String {
    let mut h = Md5::new();
    h.update(data);
    hex::encode(h.finalize())
}

#[allow(dead_code)]
pub fn loader_of(server_id: &str) -> Loader {
    get_server(server_id)
        .map(|s| s.loader)
        .unwrap_or(Loader::NeoForge)
}

#[allow(dead_code)]
pub fn game_root() -> PathBuf {
    game_dir()
}

#[cfg(test)]
mod tests {
    use super::*;

    // Listing XML RÉEL du bucket adoserv67 (racine) — 18 jars + mods.json.
    const FIXTURE_XML: &str = include_str!("../test-fixtures/b2-listing.xml");

    #[test]
    fn parse_real_b2_listing_finds_all_jars() {
        let mods = parse_s3_list(FIXTURE_XML, "https://s3.eu-central-003.backblazeb2.com", "adoserv67")
            .expect("parse");
        assert_eq!(mods.len(), 18, "18 jars attendus, trouvés : {:?}", mods.iter().map(|m| &m.name).collect::<Vec<_>>());
        let nexlux = mods.iter().find(|m| m.name == "nexlux-1.1.0.jar").expect("nexlux présent");
        assert_eq!(nexlux.size, 65564);
        assert!(!nexlux.sha.is_empty(), "ETag présent");
        // mods.json (non-jar) doit être exclu
        assert!(mods.iter().all(|m| m.name.to_lowercase().ends_with(".jar")));
        // URL de téléchargement bien formée
        assert!(nexlux.download_url.starts_with("https://s3.eu-central-003.backblazeb2.com/adoserv67/nexlux-1.1.0.jar"));
    }

    #[test]
    fn encode_key_escapes_segments() {
        assert_eq!(encode_key("a b+c.jar"), "a%20b%2Bc.jar");
        assert_eq!(encode_key("sub/dir/file.jar"), "sub/dir/file.jar");
        assert_eq!(encode_key("iris-neoforge-1.8.14-beta.1+mc1.21.1.jar"), "iris-neoforge-1.8.14-beta.1%2Bmc1.21.1.jar");
    }

    #[test]
    fn manifest_array_enriches_sha_and_size() {
        let mut listed = vec![
            RemoteMod { name: "nexlux-1.1.0.jar".into(), sha: "etag-old".into(), download_url: String::new(), size: 1 },
            RemoteMod { name: "autre.jar".into(), sha: "etag-y".into(), download_url: String::new(), size: 2 },
        ];
        apply_b2_manifest(
            &mut listed,
            r#"[{"name":"nexlux-1.1.0.jar","sha":"53f257a46ae49c7480c8f444ac1da3befd8095f0","size":65564}]"#,
        );
        assert_eq!(listed[0].sha, "53f257a46ae49c7480c8f444ac1da3befd8095f0");
        assert_eq!(listed[0].size, 65564);
        assert_eq!(listed[1].sha, "etag-y", "non listé = inchangé");
    }

    #[test]
    fn manifest_object_with_mods_and_hash_field() {
        let mut listed = vec![
            RemoteMod { name: "a.jar".into(), sha: "e".into(), download_url: String::new(), size: 0 },
        ];
        apply_b2_manifest(&mut listed, r#"{"mods":[{"name":"a.jar","hash":"abc123","size":42}]}"#);
        assert_eq!(listed[0].sha, "abc123");
        assert_eq!(listed[0].size, 42);
    }

    #[test]
    fn up_to_date_logic() {
        let dir = std::env::temp_dir().join("nexlux-sync-test");
        let _ = fs::create_dir_all(&dir);
        let f = dir.join("dummy.jar");
        fs::write(&f, b"hello-mods").unwrap();
        let md5 = md5_hex(b"hello-mods");
        // ETag (MD5) + cache ou non → à jour
        assert!(file_up_to_date(&f, &md5, 10, None));
        assert!(file_up_to_date(&f, &md5, 10, Some(&md5)));
        // Mauvais sha → à re-télécharger
        assert!(!file_up_to_date(&f, "00000000000000000000000000000000", 10, None));
        // Taille différente → à re-télécharger même avec cache égal
        assert!(!file_up_to_date(&f, &md5, 999, Some(&md5)));
        assert!(!file_up_to_date(&f, &md5, 999, None));
        // Fichier manquant → jamais à jour
        assert!(!file_up_to_date(&dir.join("absent.jar"), &md5, 10, Some(&md5)));
        let _ = fs::remove_dir_all(&dir);
    }
}
