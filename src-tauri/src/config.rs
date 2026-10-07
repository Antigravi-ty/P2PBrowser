use crate::{log_error, log_info};
use std::fs;
use std::path::PathBuf;
use tauri::{command, AppHandle, Manager};

pub fn resolve_config_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .or_else(|_| app.path().app_data_dir())
        .unwrap_or_else(|_| std::env::temp_dir().join("com.p2pbrowser.desktop"))
}

/// Returns the filesystem path to this Tauri application's configuration directory
#[command]
pub async fn get_app_config_dir(app: AppHandle) -> Result<String, String> {
    let dir = resolve_config_dir(&app);
    let _ = fs::create_dir_all(&dir);
    Ok(dir.to_string_lossy().to_string())
}

/// Opens the application configuration directory in the operating system's native file explorer
#[command]
pub async fn open_app_config_folder(app: AppHandle) -> Result<String, String> {
    let dir = resolve_config_dir(&app);
    if let Err(e) = fs::create_dir_all(&dir) {
        log_error!("[Config] Failed to create config dir {:?}: {}", dir, e);
        return Err(format!("Failed to create config dir: {}", e));
    }

    // Ensure default settings.json exists so user can inspect and edit it immediately
    let settings_file = dir.join("settings.json");
    if !settings_file.exists() {
        let default_content = r#"{
  "logFilter": {
    "filteringEnabled": true,
    "minLevel": "all",
    "categories": {
      "webviewLayout": false,
      "socks5": true,
      "p2pTunnel": true,
      "hostRelay": true,
      "probe": true,
      "downloads": true,
      "tauri": false,
      "app": true,
      "others": true
    }
  }
}
"#;
        let _ = fs::write(&settings_file, default_content);
    }

    log_info!("[Config] Opening config folder: {:?}", dir);
    let path_str = dir.to_string_lossy().to_string();
    open::that(&dir).map_err(|e| format!("Failed to open folder: {}", e))?;
    Ok(path_str)
}

/// Reads the persistent settings.json file from the application configuration directory
#[command]
pub async fn load_app_config(app: AppHandle) -> Result<String, String> {
    let dir = resolve_config_dir(&app);
    let settings_file = dir.join("settings.json");
    if settings_file.exists() {
        match fs::read_to_string(&settings_file) {
            Ok(content) => Ok(content),
            Err(e) => Err(format!("Failed to read settings.json: {}", e)),
        }
    } else {
        Ok("{}".to_string())
    }
}

/// Saves the given JSON configuration content to settings.json in the configuration directory
#[command]
pub async fn save_app_config(app: AppHandle, content: String) -> Result<(), String> {
    let dir = resolve_config_dir(&app);
    if let Err(e) = fs::create_dir_all(&dir) {
        log_error!("[Config] Failed to create config dir {:?}: {}", dir, e);
        return Err(format!("Failed to create config dir: {}", e));
    }
    let settings_file = dir.join("settings.json");
    fs::write(&settings_file, content).map_err(|e| format!("Failed to write settings.json: {}", e))?;
    log_info!("[Config] Saved settings to {:?}", settings_file);
    Ok(())
}
