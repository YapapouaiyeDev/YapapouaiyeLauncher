use crate::paths::launcher_dir;
use serde_json::{json, Value};
use std::{
    fs,
    sync::LazyLock,
    time::{SystemTime, UNIX_EPOCH},
};

static VERIFY_LOCK: LazyLock<tokio::sync::Mutex<()>> =
    LazyLock::new(|| tokio::sync::Mutex::new(()));

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn read() -> Result<Value, String> {
    let file = launcher_dir().join("invitation.json");
    if !file.exists() {
        return Ok(
            json!({ "clientId": uuid::Uuid::new_v4().to_string(), "accepted": false, "retryAt": 0 }),
        );
    }
    let raw = fs::read_to_string(file).map_err(|e| e.to_string())?;
    let state: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    if state["clientId"]
        .as_str()
        .and_then(|id| uuid::Uuid::parse_str(id).ok())
        .is_none()
    {
        return Err("État d’invitation illisible.".into());
    }
    Ok(state)
}

fn write(state: &Value) -> Result<(), String> {
    fs::create_dir_all(launcher_dir()).map_err(|e| e.to_string())?;
    let file = launcher_dir().join("invitation.json");
    let tmp = launcher_dir().join("invitation.json.tmp");
    fs::write(&tmp, state.to_string()).map_err(|e| e.to_string())?;
    fs::rename(tmp, file).map_err(|e| e.to_string())
}

pub fn status() -> Value {
    match read() {
        Ok(state) => json!({
            "accepted": state["accepted"] == true,
            "retryAfter": state["retryAt"].as_u64().unwrap_or(0).saturating_sub(now()).div_ceil(1000)
        }),
        Err(_) => json!({ "accepted": false, "error": "État d’invitation illisible." }),
    }
}

pub fn required() -> Option<Value> {
    if status()["accepted"] == true {
        return None;
    }
    Some(
        json!({ "success": false, "code": "INVITATION_REQUIRED", "error": "Validez votre code d’invitation dans l’assistant de premier démarrage." }),
    )
}

pub async fn verify(code: String) -> Value {
    let Ok(_guard) = VERIFY_LOCK.try_lock() else {
        return json!({ "success": false, "error": "Validation déjà en cours." });
    };
    match verify_inner(code).await {
        Ok(value) => value,
        Err(_) => {
            json!({ "success": false, "error": "Impossible de valider ou d’enregistrer l’invitation. Réessayez." })
        }
    }
}

async fn verify_inner(code: String) -> Result<Value, String> {
    let mut state = read()?;
    if state["accepted"] == true {
        return Ok(json!({ "success": true }));
    }
    let remaining = state["retryAt"]
        .as_u64()
        .unwrap_or(0)
        .saturating_sub(now())
        .div_ceil(1000);
    if remaining > 0 {
        return Ok(
            json!({ "success": false, "code": "INVITATION_COOLDOWN", "retryAfter": remaining }),
        );
    }
    let code = code.trim();
    if code.is_empty() || code.chars().count() > 128 {
        return Ok(
            json!({ "success": false, "error": "Entrez un code d’invitation (128 caractères maximum)." }),
        );
    }
    write(&state)?;
    let base = std::env::var("LAUNCHER_SITE_API")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "https://yapapouaiye-launcher.pages.dev".into());
    let result: Value = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?
        .post(format!(
            "{}/api/invitation-verify",
            base.trim_end_matches('/')
        ))
        .json(&json!({ "code": code, "clientId": state["clientId"] }))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    if result["success"] == true && result["invitationId"].is_string() {
        state["accepted"] = json!(true);
        state["invitationId"] = result["invitationId"].clone();
        state["retryAt"] = json!(0);
        write(&state)?;
        return Ok(json!({ "success": true }));
    }
    let kind = result["code"].as_str().unwrap_or("");
    if kind == "INVITATION_INVALID" || kind == "INVITATION_COOLDOWN" {
        let minimum = if kind == "INVITATION_INVALID" { 10 } else { 1 };
        let retry = result["retryAfter"]
            .as_u64()
            .unwrap_or(10)
            .clamp(minimum, 60);
        state["retryAt"] = json!(now() + retry * 1000);
        write(&state)?;
        return Ok(
            json!({ "success": false, "code": kind, "retryAfter": retry, "error": result["error"] }),
        );
    }
    Ok(
        json!({ "success": false, "error": result["error"].as_str().unwrap_or("Validation des invitations indisponible.") }),
    )
}
