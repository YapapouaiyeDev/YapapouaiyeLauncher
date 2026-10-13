#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod accounts;
mod auth;
mod commands;
mod config;
mod invitations;
mod launcher;
mod mods;
mod nbt;
mod paths;
mod servers;
mod updater;

use launcher::LauncherState;
use paths::{ensure_dirs, load_env, log_line};
use servers::StatusCache;
use std::time::Duration;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

const BRIDGE_JS: &str = include_str!("bridge.js");

fn main() {
    load_env();
    ensure_dirs();

    log_line("INFO", "=== Démarrage de Yapapouaiye Launcher (Rust/Tauri) ===");

    let status_cache = StatusCache::new();
    let launcher_state = LauncherState::new();

    let mut builder = tauri::Builder::default()
        .manage(status_cache)
        .manage(launcher_state);

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            log_line("INFO", "Seconde instance détectée, focus sur la fenêtre principale");
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .invoke_handler(tauri::generate_handler![
            commands::minimize,
            commands::maximize,
            commands::close,
            commands::get_window_state,
            commands::auth_microsoft,
            commands::get_invitation_status,
            commands::verify_invitation,
            commands::auth_offline,
            commands::auto_login,
            commands::auth_logout,
            commands::get_accounts,
            commands::switch_account,
            commands::remove_account,
            commands::get_system_ram,
            commands::get_config,
            commands::save_config_cmd,
            commands::get_client_mods_cmd,
            commands::save_client_mods_cmd,
            commands::apply_client_mods_cmd,
            commands::select_java_path,
            commands::export_custom_theme,
            commands::import_custom_theme_file,
            commands::select_image_file,
            commands::select_audio_file,
            commands::launch_game,
            commands::check_server_status,
            commands::get_servers,
            commands::set_active_server,
            commands::get_mods,
            commands::get_launcher_dir,
            commands::sync_mods,
            commands::open_custom_mods,
            commands::get_app_version,
            commands::check_for_updates,
            commands::get_latest_release_info,
            commands::check_first_launch_after_update,
            commands::mark_version_seen,
            commands::open_external,
            commands::overlay_options,
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Create Splash Window (only window created initially)
            let splash = WebviewWindowBuilder::new(
                &app_handle,
                "splash",
                WebviewUrl::App("splash.html".into()),
            )
            .title("Yapapouaiye Launcher")
            .inner_size(1100.0, 700.0)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .center()
            .resizable(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .build();

            if let Err(e) = &splash {
                log_line("WARN", &format!("Splash non créé: {e}"));
            }

            // Set up splash transition: main window is created and shown only when splash finishes
            let app_clone = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                // Splash display delay (5.0s to let splash animation run)
                tokio::time::sleep(Duration::from_millis(5000)).await;

                // Create and display main window cleanly
                let main_win_res = WebviewWindowBuilder::new(
                    &app_clone,
                    "main",
                    WebviewUrl::App("index.html".into()),
                )
                .title("Yapapouaiye Launcher")
                .inner_size(1100.0, 700.0)
                .min_inner_size(900.0, 600.0)
                .decorations(false)
                .transparent(false)
                .center()
                .resizable(true)
                .visible(true)
                .initialization_script(BRIDGE_JS)
                .build();

                if let Err(e) = main_win_res {
                    log_line("ERROR", &format!("Erreur création main window: {e}"));
                }

                // Short delay to let main window render over the expanding splash shape, then close splash
                tokio::time::sleep(Duration::from_millis(700)).await;

                if let Some(s) = app_clone.get_webview_window("splash") {
                    let _ = s.close();
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Erreur lors de l'exécution de Tauri");
}
