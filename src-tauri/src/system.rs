use crate::models::SystemInfo;
use tauri::{command, AppHandle, Manager};

/// Retrieves platform and OS runtime info
#[command]
pub fn get_system_info() -> SystemInfo {
    let os = std::env::consts::OS.to_string();
    let is_macos = os == "macos";
    let is_windows = os == "windows";

    SystemInfo {
        os,
        is_macos,
        is_windows,
        enhanced_mode_supported: true,
    }
}

/// Opens Developer Tools for the specified webview or window (defaults to main window)
#[command]
pub fn open_devtools(app: AppHandle, label: Option<String>) -> Result<(), String> {
    let target = label.unwrap_or_else(|| "main".to_string());
    crate::log_info!("[System] open_devtools requested for target '{}'", target);
    if let Some(_wv) = app.get_webview(&target) {
        #[cfg(any(debug_assertions, feature = "devtools"))]
        {
            _wv.open_devtools();
            crate::log_info!("[System] Successfully opened devtools for webview '{}'", target);
            return Ok(());
        }
    }
    if let Some(_win) = app.get_webview_window(&target) {
        #[cfg(any(debug_assertions, feature = "devtools"))]
        {
            _win.open_devtools();
            crate::log_info!("[System] Successfully opened devtools for webview_window '{}'", target);
            return Ok(());
        }
    }
    if let Some(_win) = app.get_webview_window("main") {
        #[cfg(any(debug_assertions, feature = "devtools"))]
        {
            _win.open_devtools();
            crate::log_info!("[System] Fallback opened devtools for 'main' window");
        }
    }
    Ok(())
}
