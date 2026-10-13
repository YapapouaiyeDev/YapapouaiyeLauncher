use crate::paths::accounts_file;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AccountMeta {
    #[serde(default)]
    pub r#type: String,
    #[serde(default)]
    pub demo: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    #[serde(default)]
    pub access_token: String,
    #[serde(default)]
    pub client_token: String,
    #[serde(default)]
    pub uuid: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub user_properties: Value,
    #[serde(default)]
    pub refresh_token: Option<String>,
    #[serde(default)]
    pub meta: AccountMeta,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, Value>,
}

impl Account {
    pub fn is_microsoft(&self) -> bool {
        let t = self.meta.r#type.to_lowercase();
        t == "microsoft" || t == "xbox" || self.refresh_token.is_some()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountsFile {
    #[serde(default)]
    pub accounts: Vec<Account>,
    #[serde(default = "default_active")]
    pub active_index: i64,
}

fn default_active() -> i64 {
    -1
}

impl Default for AccountsFile {
    fn default() -> Self {
        Self {
            accounts: Vec::new(),
            active_index: -1,
        }
    }
}

pub fn load_accounts() -> AccountsFile {
    if let Ok(raw) = fs::read_to_string(accounts_file()) {
        if let Ok(v) = serde_json::from_str::<AccountsFile>(&raw) {
            return v;
        }
    }
    AccountsFile::default()
}

pub fn save_accounts(data: &AccountsFile) {
    if let Ok(text) = serde_json::to_string_pretty(data) {
        let _ = fs::write(accounts_file(), text);
    }
}

#[allow(dead_code)]
pub fn upsert_account(account: Account) -> AccountsFile {
    let mut data = load_accounts();
    if let Some(idx) = data.accounts.iter().position(|a| a.uuid == account.uuid) {
        data.accounts[idx] = account;
        data.active_index = idx as i64;
    } else {
        data.accounts.push(account);
        data.active_index = (data.accounts.len() as i64) - 1;
    }
    save_accounts(&data);
    data
}
