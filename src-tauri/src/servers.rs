use crate::paths::{env_opt, env_or, log_line, USER_AGENT};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Loader {
    NeoForge,
    Fabric,
}

impl Loader {
    pub fn as_str(self) -> &'static str {
        match self {
            Loader::NeoForge => "neoforge",
            Loader::Fabric => "fabric",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApiKind {
    Gizmo,
    Falix,
}

#[derive(Debug, Clone)]
pub struct ServerDef {
    pub id: &'static str,
    pub name: &'static str,
    pub host: &'static str,
    pub ping_port: u16,
    pub game_port: u16,
    pub display_ip: &'static str,
    pub api: ApiKind,
    pub loader: Loader,
    pub gitea_repo: Option<&'static str>,
    pub mods_source: ModsSource,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModsSource {
    Gitea,
    B2,
}

pub const SERVERS: &[ServerDef] = &[
    ServerDef {
        id: "adoserv2",
        name: "AdoServ II",
        host: "158.178.200.70",
        ping_port: 25565,
        game_port: 25565,
        display_ip: "158.178.200.70:25565",
        api: ApiKind::Gizmo,
        loader: Loader::NeoForge,
        gitea_repo: Some("hannyvan26/AdoServ-2"),
        mods_source: ModsSource::Gitea,
    },
    ServerDef {
        id: "adoserv1",
        name: "YapapouaiyeSMP",
        host: "yapapouaiyelive.falixsrv.me",
        ping_port: 22924,
        game_port: 25565,
        display_ip: "yapapouaiyelive.falixsrv.me",
        api: ApiKind::Falix,
        loader: Loader::Fabric,
        gitea_repo: Some("hannyvan26/ModYapapouaiyeLauncher"),
        mods_source: ModsSource::Gitea,
    },
    ServerDef {
        id: "adoserv67",
        name: "AdoServ67",
        host: "91.197.6.19",
        ping_port: 22583,
        game_port: 22583,
        display_ip: "91.197.6.19:22583",
        api: ApiKind::Falix,
        loader: Loader::NeoForge,
        gitea_repo: None,
        mods_source: ModsSource::B2,
    },
];

pub fn get_server(id: &str) -> Option<&'static ServerDef> {
    SERVERS.iter().find(|s| s.id == id)
}

#[allow(dead_code)]
pub fn public_servers() -> Vec<Value> {
    SERVERS
        .iter()
        .map(|s| {
            json!({
                "id": s.id,
                "name": s.name,
                "ip": s.display_ip,
                "loader": s.loader.as_str(),
            })
        })
        .collect()
}

struct CacheEntry {
    at: Instant,
    value: Value,
}

pub struct StatusCache {
    inner: Mutex<HashMap<String, CacheEntry>>,
}

impl StatusCache {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
        }
    }

    pub fn get(&self, id: &str) -> Option<Value> {
        let map = self.inner.lock().ok()?;
        let e = map.get(id)?;
        if e.at.elapsed() < Duration::from_secs(90) {
            Some(e.value.clone())
        } else {
            None
        }
    }

    pub fn set(&self, id: &str, value: Value) {
        if let Ok(mut map) = self.inner.lock() {
            map.insert(
                id.to_string(),
                CacheEntry {
                    at: Instant::now(),
                    value,
                },
            );
        }
    }
}

fn write_varint(buf: &mut Vec<u8>, mut value: i32) {
    loop {
        let mut temp = (value & 0x7F) as u8;
        value >>= 7;
        if value != 0 {
            temp |= 0x80;
        }
        buf.push(temp);
        if value == 0 {
            break;
        }
    }
}

fn read_varint(stream: &mut TcpStream) -> std::io::Result<i32> {
    let mut num_read = 0;
    let mut result = 0i32;
    loop {
        let mut byte = [0u8; 1];
        stream.read_exact(&mut byte)?;
        let val = byte[0];
        result |= ((val & 0x7F) as i32) << (7 * num_read);
        num_read += 1;
        if num_read > 5 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "varint too long",
            ));
        }
        if val & 0x80 == 0 {
            break;
        }
    }
    Ok(result)
}

fn ping_minecraft(host: &str, port: u16) -> Result<Value, String> {
    let addr = format!("{host}:{port}");
    let mut stream = TcpStream::connect_timeout(
        &addr
            .parse()
            .map_err(|e| format!("addr: {e}"))
            .or_else(|_| {
                use std::net::ToSocketAddrs;
                (host, port)
                    .to_socket_addrs()
                    .map_err(|e| e.to_string())?
                    .next()
                    .ok_or_else(|| "no addr".to_string())
            })?,
        Duration::from_secs(4),
    )
    .map_err(|e| e.to_string())?;
    stream
        .set_read_timeout(Some(Duration::from_secs(4)))
        .ok();
    stream
        .set_write_timeout(Some(Duration::from_secs(4)))
        .ok();

    let mut handshake = Vec::new();
    write_varint(&mut handshake, 0);
    write_varint(&mut handshake, 767);
    let host_bytes = host.as_bytes();
    write_varint(&mut handshake, host_bytes.len() as i32);
    handshake.extend_from_slice(host_bytes);
    handshake.extend_from_slice(&port.to_be_bytes());
    write_varint(&mut handshake, 1);

    let mut packet = Vec::new();
    write_varint(&mut packet, handshake.len() as i32);
    packet.extend_from_slice(&handshake);
    stream.write_all(&packet).map_err(|e| e.to_string())?;

    let mut status_req = Vec::new();
    write_varint(&mut status_req, 1);
    status_req.push(0);
    stream.write_all(&status_req).map_err(|e| e.to_string())?;

    let _len = read_varint(&mut stream).map_err(|e| e.to_string())?;
    let _id = read_varint(&mut stream).map_err(|e| e.to_string())?;
    let json_len = read_varint(&mut stream).map_err(|e| e.to_string())? as usize;
    let mut json_buf = vec![0u8; json_len.min(1_000_000)];
    stream.read_exact(&mut json_buf).map_err(|e| e.to_string())?;
    serde_json::from_slice(&json_buf).map_err(|e| e.to_string())
}

async fn fetch_gizmo(client: &reqwest::Client) -> Result<Value, String> {
    let url = env_or(
        "GIZMO_STATUS_URL",
        "https://panel.gizmoservers.net/api/client/servers/status",
    );
    let token = env_opt("GIZMO_API_TOKEN").or_else(|| env_opt("GIZMO_TOKEN"));
    let mut req = client.get(&url).header("User-Agent", USER_AGENT);
    if let Some(t) = token {
        req = req.header("Authorization", format!("Bearer {t}"));
    }
    let res = req.send().await.map_err(|e| e.to_string())?;
    let status = res.status();
    let body = res.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("gizmo {status}: {body}"));
    }
    serde_json::from_str(&body).map_err(|e| e.to_string())
}

async fn fetch_falix(client: &reqwest::Client, server_id: &str) -> Result<Value, String> {
    let key = env_opt("FALIX_API_KEY").ok_or("FALIX_API_KEY manquant")?;
    let url = format!("https://api.falixnodes.net/v1/servers/{server_id}");
    let res = client
        .get(url)
        .header("User-Agent", USER_AGENT)
        .header("Authorization", key)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = res.status();
    let body = res.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("falix {status}: {body}"));
    }
    serde_json::from_str(&body).map_err(|e| e.to_string())
}

fn extract_online(payload: &Value) -> Option<bool> {
    payload
        .pointer("/online")
        .or_else(|| payload.pointer("/data/online"))
        .or_else(|| payload.pointer("/attributes/status"))
        .or_else(|| payload.pointer("/status"))
        .and_then(|v| {
            if let Some(b) = v.as_bool() {
                Some(b)
            } else if let Some(s) = v.as_str() {
                Some(matches!(
                    s.to_lowercase().as_str(),
                    "online" | "running" | "on" | "started"
                ))
            } else {
                None
            }
        })
}

pub async fn check_server_status(
    client: &reqwest::Client,
    cache: &StatusCache,
    server_id: &str,
) -> Value {
    if let Some(cached) = cache.get(server_id) {
        return cached;
    }
    let Some(server) = get_server(server_id) else {
        return json!({ "online": false, "error": "unknown server" });
    };

    let ping = ping_minecraft(server.host, server.ping_port);
    let mut online = ping.as_ref().ok().map(|_| true);
    let mut players: Option<Value> = None;
    let mut motd: Option<Value> = None;
    if let Ok(p) = &ping {
        players = p.get("players").cloned();
        motd = p.get("description").cloned();
        online = Some(true);
    }

    if online != Some(true) {
        match server.api {
            ApiKind::Gizmo => match fetch_gizmo(client).await {
                Ok(v) => online = extract_online(&v).or(online),
                Err(e) => log_line("WARN", &format!("gizmo status: {e}")),
            },
            ApiKind::Falix => {
                let falix_id = match server.id {
                    "adoserv67" => env_or("FALIX_SERVER_ID_ADOSERV67", ""),
                    _ => env_or("FALIX_SERVER_ID", ""),
                };
                if !falix_id.is_empty() {
                    match fetch_falix(client, &falix_id).await {
                        Ok(v) => online = extract_online(&v).or(online),
                        Err(e) => log_line("WARN", &format!("falix status: {e}")),
                    }
                }
            }
        }
    }

    let result = json!({
        "id": server.id,
        "name": server.name,
        "online": online.unwrap_or(false),
        "players": players,
        "motd": motd,
        "ip": server.display_ip,
        "loader": server.loader.as_str(),
    });
    cache.set(server_id, result.clone());
    result
}

#[allow(dead_code)]
#[derive(Serialize)]
pub struct ServerPublic {
    pub id: String,
    pub name: String,
    pub ip: String,
    pub loader: String,
}
