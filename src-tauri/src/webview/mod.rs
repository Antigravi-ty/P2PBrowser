use crate::models::{TabStatePayload, UrlPayload};
use crate::{log_error, log_info, log_warn};
use tauri::utils::config::Color;
use tauri::webview::WebviewBuilder;
use tauri::{command, AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl};

const TAB_INJECT_SCRIPT: &str = include_str!("tab_script.js");

pub fn is_download_url(url: &url::Url) -> bool {
    let path = url.path().to_lowercase();
    const EXTENSIONS: &[&str] = &[
        ".zip", ".tar", ".gz", ".tgz", ".bz2", ".xz", ".7z", ".rar",
        ".exe", ".msi", ".dmg", ".pkg", ".deb", ".rpm", ".iso", ".apk",
        ".bin", ".appimage", ".torrent",
    ];
    if EXTENSIONS.iter().any(|ext| path.ends_with(ext)) {
        return true;
    }
    if path.contains("/releases/download/") || path.contains("/archive/refs/") || url.host_str() == Some("codeload.github.com") {
        return true;
    }
    false
}


/// Creates a dedicated child webview for a browser tab with isolated data directory and proxy configuration.
/// Completely avoids WebView2 HRESULT 0x8007139F by isolating UserDataFolder per tab in native Rust.
#[command]
pub async fn create_tab_webview(
    app: AppHandle,
    window_label: String,
    label: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    proxy_url: Option<String>,
    dark_mode: Option<bool>,
    user_agent: Option<String>,
    background_color: Option<[u8; 4]>,
) -> Result<(), String> {
    log_info!(
        "[WebviewLayout] create_tab_webview for '{}' on window '{}' (proxy: {:?}, url: '{}')",
        label,
        window_label,
        proxy_url,
        url
    );

    // Clean up any lingering webview with this label before recreation
    if let Some(existing) = app.get_webview(&label) {
        log_info!("[WebviewLayout] Closing existing webview instance for '{}'", label);
        let _ = existing.close();
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }

    let window = app
        .get_window(&window_label)
        .ok_or_else(|| {
            let err = format!("Window '{}' not found", window_label);
            log_error!("[WebviewLayout] {}", err);
            err
        })?;

    // Shared profile data directory under AppData/Local/com.p2pbrowser.desktop/webviews/shared_profile
    // Sharing the profile across tabs ensures shared cookies, localStorage, and persistent login sessions across tabs and OAuth popups.
    let local_data = app
        .path()
        .app_local_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("p2p_browser"));
    let data_dir = local_data.join("webviews").join("shared_profile");
    if let Err(e) = std::fs::create_dir_all(&data_dir) {
        log_warn!("[WebviewLayout] Failed to create shared tab data dir {:?}: {}", data_dir, e);
    } else {
        log_info!("[WebviewLayout] Shared tab data directory for '{}': {:?}", label, data_dir);
    }

    let parsed_url = if url.starts_with("http://") || url.starts_with("https://") {
        WebviewUrl::External(url.parse().map_err(|e| format!("Invalid URL '{}': {}", url, e))?)
    } else {
        WebviewUrl::App("about:blank".into())
    };

    let ua = user_agent.unwrap_or_else(|| {
        #[cfg(target_os = "macos")]
        {
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36".to_string()
        }
        #[cfg(target_os = "windows")]
        {
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36".to_string()
        }
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36".to_string()
        }
    });

    let mut builder = WebviewBuilder::new(&label, parsed_url)
        .data_directory(data_dir)
        .user_agent(&ua)
        .devtools(true);

    if let Some(ref proxy) = proxy_url {
        if !proxy.trim().is_empty() {
            if let Ok(u) = proxy.parse() {
                log_info!("[WebviewLayout] Setting proxy '{}' for webview '{}'", proxy, label);
                builder = builder.proxy_url(u);
            } else {
                log_warn!("[WebviewLayout] Invalid proxy URL '{}' for webview '{}'", proxy, label);
            }
        }
    }

    let bg_color = if let Some(c) = background_color {
        Color(c[0], c[1], c[2], c[3])
    } else if dark_mode.unwrap_or(false) {
        Color(13, 17, 23, 255)
    } else {
        Color(255, 255, 255, 255)
    };
    builder = builder.background_color(bg_color);

    let init_script = TAB_INJECT_SCRIPT.replace("__WEBVIEW_LABEL__", &label);
    builder = builder.initialization_script(&init_script);

    // Native document title synchronization
    let title_label = label.clone();
    let title_app = app.clone();
    builder = builder.on_document_title_changed(move |wv, title| {
        let cur_url = wv.url().map(|u| u.to_string()).unwrap_or_default();
        let _ = title_app.emit_to(
            "main",
            "tab-state-changed",
            TabStatePayload {
                label: title_label.clone(),
                url: cur_url,
                title,
            },
        );
    });

    // Native page load navigation synchronization
    let load_label = label.clone();
    let load_app = app.clone();
    builder = builder.on_page_load(move |_wv, payload| {
        let cur_url = payload.url().to_string();
        let _ = load_app.emit_to(
            "main",
            "tab-state-changed",
            TabStatePayload {
                label: load_label.clone(),
                url: cur_url,
                title: String::new(),
            },
        );
    });

    // Native on_navigation interceptor for download URLs
    let nav_app = app.clone();
    builder = builder.on_navigation(move |nav_url| {
        let url_str = nav_url.as_str();
        if is_download_url(nav_url) {
            log_info!("[WebviewDownload] Native on_navigation intercepted download: {}", url_str);
            let app_h = nav_app.clone();
            let dl_url = url_str.to_string();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = crate::download::start_download_task(app_h, dl_url, None).await {
                    log_error!("[WebviewDownload] Failed to start intercepted download: {}", e);
                }
            });
            return false;
        }
        true
    });

    // Native on_new_window handler (intercept target="_blank" and window.open)
    let new_win_app = app.clone();
    builder = builder.on_new_window(move |target_url, _features| {
        let url_str = target_url.as_str();
        if is_download_url(&target_url) {
            log_info!("[WebviewDownload] Native on_new_window intercepted download: {}", url_str);
            let app_h = new_win_app.clone();
            let dl_url = url_str.to_string();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = crate::download::start_download_task(app_h, dl_url, None).await {
                    log_error!("[WebviewDownload] Failed to start intercepted download: {}", e);
                }
            });
            tauri::webview::NewWindowResponse::Deny
        } else {
            log_info!("[WebviewLayout] Native on_new_window opening in new tab: {}", url_str);
            let _ = new_win_app.emit_to("main", "open-new-tab", UrlPayload { url: url_str.to_string() });
            tauri::webview::NewWindowResponse::Deny
        }
    });

    // Native on_download interceptor
    let dl_app = app.clone();
    builder = builder.on_download(move |_wv, event| match event {
        tauri::webview::DownloadEvent::Requested { url, .. } => {
            let dl_url = url.to_string();
            log_info!("[WebviewDownload] Native on_download intercepted: {}", dl_url);
            let app_h = dl_app.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = crate::download::start_download_task(app_h, dl_url, None).await {
                    log_error!("[WebviewDownload] Failed to start intercepted download: {}", e);
                }
            });
            false
        }
        _ => true,
    });

    let pos = LogicalPosition::new(x, y);
    let size = LogicalSize::new(width, height);

    window
        .add_child(builder, pos, size)
        .map_err(|e| {
            let err = format!("Failed to create child webview '{}': {}", label, e);
            log_error!("[WebviewLayout] {}", err);
            err
        })?;

    log_info!("[WebviewLayout] Webview '{}' successfully created and attached to window '{}'", label, window_label);
    Ok(())
}

/// Navigates an existing child webview to a new URL
#[command]
pub async fn navigate_tab_webview(
    app: AppHandle,
    label: String,
    url: String,
) -> Result<(), String> {
    log_info!("[WebviewLayout] navigate_tab_webview for label '{}' -> '{}'", label, url);

    let webview = app.get_webview(&label)
        .ok_or_else(|| {
            let err = format!("Webview '{}' not found", label);
            log_error!("[WebviewLayout] {}", err);
            err
        })?;

    let parsed_url: url::Url = url.parse()
        .map_err(|e| {
            let err = format!("Invalid URL '{}': {}", url, e);
            log_error!("[WebviewLayout] {}", err);
            err
        })?;

    webview.navigate(parsed_url)
        .map_err(|e| {
            let err = format!("Failed to navigate webview '{}': {}", label, e);
            log_error!("[WebviewLayout] {}", err);
            err
        })?;

    log_info!("[WebviewLayout] Successfully navigated webview '{}' to '{}'", label, url);
    Ok(())
}

/// Reloads an existing child webview
#[command]
pub async fn reload_tab_webview(
    app: AppHandle,
    label: String,
) -> Result<(), String> {
    log_info!("[WebviewLayout] reload_tab_webview for label '{}'", label);

    let webview = app.get_webview(&label)
        .ok_or_else(|| {
            let err = format!("Webview '{}' not found", label);
            log_error!("[WebviewLayout] {}", err);
            err
        })?;

    webview.reload()
        .map_err(|e| {
            let err = format!("Failed to reload webview '{}': {}", label, e);
            log_error!("[WebviewLayout] {}", err);
            err
        })?;

    log_info!("[WebviewLayout] Successfully reloaded webview '{}'", label);
    Ok(())
}

/// Explicitly closes an existing child webview
#[command]
pub async fn close_tab_webview(
    app: AppHandle,
    label: String,
) -> Result<(), String> {
    log_info!("[WebviewLayout] close_tab_webview for label '{}'", label);

    if let Some(webview) = app.get_webview(&label) {
        webview.close()
            .map_err(|e| {
                let err = format!("Failed to close webview '{}': {}", label, e);
                log_error!("[WebviewLayout] {}", err);
                err
            })?;
        log_info!("[WebviewLayout] Successfully closed webview '{}'", label);
    } else {
        log_info!("[WebviewLayout] Webview '{}' was not found (already closed)", label);
    }

    Ok(())
}

#[command]
pub async fn tab_state_update(app: AppHandle, label: String, url: String, title: String) -> Result<(), String> {
    let _ = app.emit_to("main", "tab-state-changed", TabStatePayload { label, url, title });
    Ok(())
}

#[command]
pub async fn open_new_tab_requested(app: AppHandle, url: String) -> Result<(), String> {
    log_info!("[WebviewLayout] open_new_tab_requested: {}", url);
    let _ = app.emit_to("main", "open-new-tab", UrlPayload { url });
    Ok(())
}

#[command]
pub async fn start_download_requested(app: AppHandle, url: String) -> Result<(), String> {
    log_info!("[Download] start_download_requested: {}", url);
    crate::download::start_download_task(app, url, None)
        .await
        .map(|_| ())
}
