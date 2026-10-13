use crate::accounts::{upsert_account, Account, AccountMeta};
use crate::paths::{env_or, log_line, USER_AGENT};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::mpsc;
use std::time::Duration;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use uuid::Uuid;

const MS_CLIENT_ID: &str = "00000000402b5328";
const REDIRECT: &str = "https://login.live.com/oauth20_desktop.srf";

fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(30))
        .build()
        .expect("http")
}

async fn post_form(url: &str, form: &[(&str, &str)]) -> Result<Value, String> {
    let res = http_client()
        .post(url)
        .form(form)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = res.status();
    let text = res.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("{url} -> {status}: {text}"));
    }
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

async fn post_json(url: &str, body: &Value) -> Result<Value, String> {
    let res = http_client()
        .post(url)
        .json(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = res.status();
    let text = res.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("{url} -> {status}: {text}"));
    }
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

async fn get_json_auth(url: &str, token: &str) -> Result<Value, String> {
    let res = http_client()
        .get(url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = res.status();
    let text = res.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("{url} -> {status}: {text}"));
    }
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

#[allow(dead_code)]
pub async fn exchange_microsoft_code(code: &str) -> Result<Account, String> {
    let token = post_form(
        "https://login.live.com/oauth20_token.srf",
        &[
            ("client_id", MS_CLIENT_ID),
            ("code", code),
            ("grant_type", "authorization_code"),
            ("redirect_uri", REDIRECT),
        ],
    )
    .await?;
    complete_microsoft_login(token).await
}

pub async fn refresh_microsoft(refresh_token: &str) -> Result<Account, String> {
    let token = post_form(
        "https://login.live.com/oauth20_token.srf",
        &[
            ("client_id", MS_CLIENT_ID),
            ("refresh_token", refresh_token),
            ("grant_type", "refresh_token"),
            ("redirect_uri", REDIRECT),
        ],
    )
    .await?;
    complete_microsoft_login(token).await
}

async fn complete_microsoft_login(ms_token: Value) -> Result<Account, String> {
    let access = ms_token
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("access_token Microsoft manquant")?
        .to_string();
    let refresh = ms_token
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let xbl = post_json(
        "https://user.auth.xboxlive.com/user/authenticate",
        &json!({
            "Properties": {
                "AuthMethod": "RPS",
                "SiteName": "user.auth.xboxlive.com",
                "RpsTicket": format!("d={access}")
            },
            "RelyingParty": "http://auth.xboxlive.com",
            "TokenType": "JWT"
        }),
    )
    .await?;
    let xbl_token = xbl
        .get("Token")
        .and_then(|v| v.as_str())
        .ok_or("XBL token")?;
    let uhs = xbl
        .pointer("/DisplayClaims/xui/0/uhs")
        .and_then(|v| v.as_str())
        .ok_or("XBL uhs")?;

    let xsts = post_json(
        "https://xsts.auth.xboxlive.com/xsts/authorize",
        &json!({
            "Properties": {
                "SandboxId": "RETAIL",
                "UserTokens": [xbl_token]
            },
            "RelyingParty": "rp://api.minecraftservices.com/",
            "TokenType": "JWT"
        }),
    )
    .await?;
    let xsts_token = xsts
        .get("Token")
        .and_then(|v| v.as_str())
        .ok_or("XSTS token")?;

    let mc = post_json(
        "https://api.minecraftservices.com/authentication/login_with_xbox",
        &json!({ "identityToken": format!("XBL3.0 x={uhs};{xsts_token}") }),
    )
    .await?;
    let mc_token = mc
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("Minecraft access_token")?
        .to_string();

    let profile = get_json_auth(
        "https://api.minecraftservices.com/minecraft/profile",
        &mc_token,
    )
    .await?;
    let name = profile
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or("profil Minecraft: pas de nom (compte Game Pass / pas de licence ?)")?
        .to_string();
    let uuid = profile
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("profil Minecraft: pas d'UUID")?
        .to_string();

    Ok(Account {
        access_token: mc_token,
        client_token: Uuid::new_v4().to_string(),
        uuid,
        name,
        user_properties: json!({}),
        refresh_token: refresh,
        meta: AccountMeta {
            r#type: "Xbox".into(),
            demo: false,
        },
        extra: serde_json::Map::new(),
    })
}

pub fn offline_account(username: &str) -> Account {
    let name = username.trim();
    let uuid = Uuid::new_v5(
        &Uuid::NAMESPACE_URL,
        format!("OfflinePlayer:{name}").as_bytes(),
    )
    .to_string()
    .replace('-', "");
    Account {
        access_token: "0".into(),
        client_token: Uuid::new_v4().to_string(),
        uuid,
        name: name.to_string(),
        user_properties: json!({}),
        refresh_token: None,
        meta: AccountMeta {
            r#type: "offline".into(),
            demo: false,
        },
        extra: serde_json::Map::new(),
    }
}

fn extract_code_from_url(url: &str) -> Option<String> {
    let parsed = url::Url::parse(url).ok()?;
    let pairs: HashMap<_, _> = parsed.query_pairs().into_owned().collect();
    if let Some(err) = pairs.get("error") {
        log_line("WARN", &format!("oauth error: {err}"));
        return None;
    }
    pairs.get("code").cloned()
}

#[allow(dead_code)]
fn local_oauth_listener() -> Result<(u16, mpsc::Receiver<String>), String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        if let Ok((mut stream, _)) = listener.accept() {
            let mut buf = [0u8; 4096];
            if let Ok(n) = stream.read(&mut buf) {
                let req = String::from_utf8_lossy(&buf[..n]);
                let first = req.lines().next().unwrap_or("");
                let path = first.split_whitespace().nth(1).unwrap_or("");
                let url = format!("http://127.0.0.1{path}");
                let html = "<html><body style='background:#111;color:#eee;font-family:sans-serif;text-align:center;padding:40px'>Connexion Microsoft terminee. Vous pouvez fermer cet onglet.</body></html>";
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{html}",
                    html.len()
                );
                let _ = stream.write_all(resp.as_bytes());
                let _ = tx.send(url);
            }
        }
    });
    Ok((port, rx))
}

fn close_ms_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("ms-auth") {
        let _ = w.close();
    }
}

pub async fn auth_microsoft_flow(app: tauri::AppHandle) -> Result<Account, String> {
    let client_id = env_or("MS_CLIENT_ID", MS_CLIENT_ID);
    // Le client public Minecraft (00000000402b5328) n'a qu'UN SEUL redirect_uri
    // enregistré côté Microsoft : https://login.live.com/oauth20_desktop.srf
    // Tout http://127.0.0.1:PORT est rejeté ("redirect_uri is not valid"),
    // d'où l'écran d'erreur + timeout. On utilise donc le redirect officiel
    // et on intercepte la navigation de retour pour récupérer le code.
    let auth_url = format!(
        "https://login.live.com/oauth20_authorize.srf?client_id={}&response_type=code&redirect_uri={}&scope=XboxLive.signin%20offline_access",
        urlencoding::encode(&client_id),
        urlencoding::encode(REDIRECT)
    );
    log_line("INFO", "Ouverture de la connexion Microsoft...");

    // Ferme une éventuelle fenêtre résiduelle d'une tentative précédente
    // (sinon "a webview with label `ms-auth` already exists").
    close_ms_window(&app);

    let (tx, rx) = mpsc::channel::<Result<String, String>>();
    let _win = WebviewWindowBuilder::new(
        &app,
        "ms-auth",
        WebviewUrl::External(auth_url.parse().map_err(|e: url::ParseError| e.to_string())?),
    )
    .title("Connexion Microsoft")
    .inner_size(480.0, 700.0)
    .center()
    .on_navigation(move |url| {
        let s = url.as_str();
        if s.starts_with(REDIRECT) {
            let result = (|| -> Result<String, String> {
                let pairs: HashMap<_, _> = url.query_pairs().into_owned().collect();
                if let Some(err) = pairs.get("error") {
                    let desc = pairs
                        .get("error_description")
                        .cloned()
                        .unwrap_or_default();
                    return Err(format!("Microsoft: {err} {desc}"));
                }
                pairs
                    .get("code")
                    .cloned()
                    .ok_or_else(|| "code OAuth manquant".to_string())
            })();
            let _ = tx.send(result);
            return false; // bloque la navigation vers la page de retour
        }
        true
    })
    .build()
    .map_err(|e| e.to_string())?;

    // Attente du code (180s max) avec détection de fermeture manuelle :
    // si l'utilisateur ferme la fenêtre, on annule tout de suite.
    let deadline = std::time::Instant::now() + Duration::from_secs(180);
    let code = loop {
        match rx.recv_timeout(Duration::from_secs(2)) {
            Ok(Ok(code)) => break code,
            Ok(Err(e)) => {
                close_ms_window(&app);
                return Err(e);
            }
            Err(_) => {
                if app.get_webview_window("ms-auth").is_none() {
                    return Err("Connexion annulée".to_string());
                }
                if std::time::Instant::now() >= deadline {
                    close_ms_window(&app);
                    return Err("timeout connexion Microsoft".to_string());
                }
            }
        }
    };

    close_ms_window(&app);

    let token = post_form(
        "https://login.live.com/oauth20_token.srf",
        &[
            ("client_id", client_id.as_str()),
            ("code", code.as_str()),
            ("grant_type", "authorization_code"),
            ("redirect_uri", REDIRECT),
        ],
    )
    .await?;
    complete_microsoft_login(token).await
}

#[allow(dead_code)]
pub fn persist_account(account: Account) -> Account {
    let data = upsert_account(account.clone());
    let _ = data;
    account
}

#[allow(dead_code)]
pub fn emit_progress(app: &tauri::AppHandle, payload: Value) {
    let _ = app.emit("progress", payload);
}

#[allow(dead_code)]
pub fn extract_code(url: &str) -> Option<String> {
    extract_code_from_url(url)
}
