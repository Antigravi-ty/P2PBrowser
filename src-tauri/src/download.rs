use crate::{log_error, log_info, log_warn};
use futures_util::StreamExt;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, Instant};
use tauri::{command, AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;

#[derive(Clone, Debug, Serialize)]
pub struct DownloadProgressPayload {
    pub id: String,
    pub url: String,
    pub filename: String,
    pub destination: String,
    pub total_bytes: u64,
    pub received_bytes: u64,
    pub speed_bytes_per_sec: u64,
    pub progress_percent: f64,
    pub status: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct DownloadCompletedPayload {
    pub id: String,
    pub url: String,
    pub filename: String,
    pub destination: String,
    pub total_bytes: u64,
    pub status: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct DownloadFailedPayload {
    pub id: String,
    pub url: String,
    pub filename: String,
    pub error: String,
    pub status: String,
}

static ACTIVE_DOWNLOADS: LazyLock<Mutex<HashMap<String, Arc<AtomicBool>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn sanitize_filename(name: &str) -> String {
    let forbidden = ['/', '\\', '?', '%', '*', ':', '|', '"', '<', '>', '\0'];
    let cleaned: String = name
        .chars()
        .map(|c| if forbidden.contains(&c) || c.is_control() { '_' } else { c })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.');
    if trimmed.is_empty() {
        "download.bin".to_string()
    } else {
        trimmed.to_string()
    }
}

fn extract_filename_from_headers(headers: &reqwest::header::HeaderMap) -> Option<String> {
    let cd = headers.get(reqwest::header::CONTENT_DISPOSITION)?.to_str().ok()?;

    // Check filename*=UTF-8''...
    if let Some(pos) = cd.to_lowercase().find("filename*=") {
        let part = &cd[pos + 10..];
        let raw = part.split(';').next().unwrap_or("").trim().trim_matches('"');
        if let Some(encoded) = raw.strip_prefix("utf-8''").or_else(|| raw.strip_prefix("UTF-8''")) {
            if let Ok(decoded) = percent_encoding::percent_decode_str(encoded).decode_utf8() {
                return Some(sanitize_filename(&decoded));
            }
        }
    }

    // Check filename="..." or filename=...
    if let Some(pos) = cd.to_lowercase().find("filename=") {
        let part = &cd[pos + 9..];
        let raw = part.split(';').next().unwrap_or("").trim().trim_matches('"');
        if !raw.is_empty() {
            return Some(sanitize_filename(raw));
        }
    }

    None
}

fn extract_filename_from_url(url_str: &str) -> String {
    if let Ok(parsed) = url::Url::parse(url_str) {
        if let Some(segments) = parsed.path_segments() {
            let last = segments.filter(|s| !s.is_empty()).last().unwrap_or("");
            if !last.is_empty() {
                if let Ok(decoded) = percent_encoding::percent_decode_str(last).decode_utf8() {
                    return sanitize_filename(&decoded);
                }
            }
        }
    }
    "download.bin".to_string()
}

fn get_unique_destination_path(dir: &Path, filename: &str) -> PathBuf {
    let mut candidate = dir.join(filename);
    if !candidate.exists() {
        return candidate;
    }

    let p = Path::new(filename);
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("download");
    let ext = p.extension().and_then(|s| s.to_str());

    let mut counter = 1;
    loop {
        let new_name = match ext {
            Some(e) if !e.is_empty() => format!("{} ({}).{}", stem, counter, e),
            _ => format!("{} ({})", stem, counter),
        };
        candidate = dir.join(&new_name);
        if !candidate.exists() {
            return candidate;
        }
        counter += 1;
    }
}

fn get_platform_user_agent() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    }
    #[cfg(target_os = "windows")]
    {
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    }
}

async fn fetch_response(url: &str) -> Result<reqwest::Response, reqwest::Error> {
    let proxy_port = crate::socks5::get_active_proxy_port();
    let tunnel_active = crate::socks5::is_tunnel_active();
    if proxy_port > 0 && crate::socks5::is_proxy_running() && tunnel_active {
        log_info!("[Download] Routing download through P2P SOCKS5 proxy (127.0.0.1:{})", proxy_port);
        if let Ok(proxy) = reqwest::Proxy::all(format!("socks5h://127.0.0.1:{}", proxy_port)) {
            if let Ok(client) = reqwest::Client::builder()
                .user_agent(get_platform_user_agent())
                .redirect(reqwest::redirect::Policy::limited(10))
                .proxy(proxy)
                .connect_timeout(Duration::from_secs(25))
                .build()
            {
                match client.get(url).send().await {
                    Ok(resp) => {
                        log_info!("[Download] Successfully established download stream over P2P proxy tunnel");
                        return Ok(resp);
                    }
                    Err(e) => {
                        log_warn!("[Download] Proxy fetch failed: {}, retrying direct connection...", e);
                    }
                }
            }
        }
    }

    log_info!("[Download] Connecting directly to '{}'", url);
    let direct_client = reqwest::Client::builder()
        .user_agent(get_platform_user_agent())
        .redirect(reqwest::redirect::Policy::limited(10))
        .connect_timeout(Duration::from_secs(20))
        .build()?;
    direct_client.get(url).send().await
}

pub async fn start_download_task(
    app: AppHandle,
    url: String,
    suggested_filename: Option<String>,
) -> Result<String, String> {
    let task_id = format!("dl_{}_{}", chrono::Utc::now().timestamp_millis(), &url[url.len().saturating_sub(6)..]);
    let cancel_flag = Arc::new(AtomicBool::new(false));

    if let Ok(mut map) = ACTIVE_DOWNLOADS.lock() {
        map.insert(task_id.clone(), cancel_flag.clone());
    }

    let id = task_id.clone();
    let app_handle = app.clone();

    tokio::spawn(async move {
        log_info!("[Download] Task '{}' initiated for '{}'", id, url);

        let download_dir = app_handle
            .path()
            .download_dir()
            .unwrap_or_else(|_| std::env::temp_dir());

        if let Err(e) = std::fs::create_dir_all(&download_dir) {
            log_warn!("[Download] Failed to ensure download dir {:?}: {}", download_dir, e);
        }

        let resp_res = fetch_response(&url).await;
        let response = match resp_res {
            Ok(r) => {
                if !r.status().is_success() {
                    let err = format!("Server returned HTTP {}", r.status());
                    log_error!("[Download] Task '{}' failed: {}", id, err);
                    let _ = app_handle.emit_to(
                    "main",
                        "download-task-failed",
                        DownloadFailedPayload {
                            id: id.clone(),
                            url: url.clone(),
                            filename: suggested_filename.clone().unwrap_or_else(|| "download.bin".into()),
                            error: err,
                            status: "failed".into(),
                        },
                    );
                    if let Ok(mut map) = ACTIVE_DOWNLOADS.lock() {
                        map.remove(&id);
                    }
                    return;
                }
                r
            }
            Err(e) => {
                let err = format!("Network error: {}", e);
                log_error!("[Download] Task '{}' failed: {}", id, err);
                let _ = app_handle.emit_to(
                    "main",
                    "download-task-failed",
                    DownloadFailedPayload {
                        id: id.clone(),
                        url: url.clone(),
                        filename: suggested_filename.clone().unwrap_or_else(|| "download.bin".into()),
                        error: err,
                        status: "failed".into(),
                    },
                );
                if let Ok(mut map) = ACTIVE_DOWNLOADS.lock() {
                    map.remove(&id);
                }
                return;
            }
        };

        // Determine filename
        let filename = suggested_filename
            .filter(|s| !s.trim().is_empty())
            .or_else(|| extract_filename_from_headers(response.headers()))
            .unwrap_or_else(|| extract_filename_from_url(&url));

        let dest_path = get_unique_destination_path(&download_dir, &filename);
        let dest_str = dest_path.to_string_lossy().to_string();

        let total_bytes = response.content_length().unwrap_or(0);

        log_info!(
            "[Download] Task '{}': target path '{}', total size: {} bytes",
            id,
            dest_str,
            total_bytes
        );

        let mut file = match tokio::fs::File::create(&dest_path).await {
            Ok(f) => f,
            Err(e) => {
                let err = format!("Failed to create destination file: {}", e);
                log_error!("[Download] Task '{}': {}", id, err);
                let _ = app_handle.emit_to(
                    "main",
                    "download-task-failed",
                    DownloadFailedPayload {
                        id: id.clone(),
                        url: url.clone(),
                        filename: filename.clone(),
                        error: err,
                        status: "failed".into(),
                    },
                );
                if let Ok(mut map) = ACTIVE_DOWNLOADS.lock() {
                    map.remove(&id);
                }
                return;
            }
        };

        // Initial progress event
        let _ = app_handle.emit_to(
                    "main",
            "download-task-progress",
            DownloadProgressPayload {
                id: id.clone(),
                url: url.clone(),
                filename: filename.clone(),
                destination: dest_str.clone(),
                total_bytes,
                received_bytes: 0,
                speed_bytes_per_sec: 0,
                progress_percent: 0.0,
                status: "downloading".into(),
            },
        );

        let mut stream = response.bytes_stream();
        let mut received_bytes: u64 = 0;
        let mut last_progress_time = Instant::now();
        let mut last_reported_bytes: u64 = 0;
        let mut speed: u64 = 0;

        let mut failed = false;
        let mut cancelled = false;

        while let Some(chunk_res) = stream.next().await {
            if cancel_flag.load(Ordering::SeqCst) {
                cancelled = true;
                break;
            }

            match chunk_res {
                Ok(chunk) => {
                    if let Err(e) = file.write_all(&chunk).await {
                        log_error!("[Download] Task '{}' write error: {}", id, e);
                        failed = true;
                        let _ = app_handle.emit_to(
                    "main",
                            "download-task-failed",
                            DownloadFailedPayload {
                                id: id.clone(),
                                url: url.clone(),
                                filename: filename.clone(),
                                error: format!("Disk write error: {}", e),
                                status: "failed".into(),
                            },
                        );
                        break;
                    }

                    received_bytes += chunk.len() as u64;

                    let now = Instant::now();
                    let elapsed = now.duration_since(last_progress_time);
                    if elapsed >= Duration::from_millis(250) {
                        let secs = elapsed.as_secs_f64();
                        if secs > 0.0 {
                            speed = ((received_bytes.saturating_sub(last_reported_bytes)) as f64 / secs) as u64;
                        }
                        last_progress_time = now;
                        last_reported_bytes = received_bytes;

                        let percent = if total_bytes > 0 {
                            ((received_bytes as f64 / total_bytes as f64) * 100.0).min(100.0)
                        } else {
                            0.0
                        };

                        let _ = app_handle.emit_to(
                    "main",
                            "download-task-progress",
                            DownloadProgressPayload {
                                id: id.clone(),
                                url: url.clone(),
                                filename: filename.clone(),
                                destination: dest_str.clone(),
                                total_bytes,
                                received_bytes,
                                speed_bytes_per_sec: speed,
                                progress_percent: percent,
                                status: "downloading".into(),
                            },
                        );
                    }
                }
                Err(e) => {
                    log_error!("[Download] Task '{}' stream read error: {}", id, e);
                    failed = true;
                    let _ = app_handle.emit_to(
                    "main",
                        "download-task-failed",
                        DownloadFailedPayload {
                            id: id.clone(),
                            url: url.clone(),
                            filename: filename.clone(),
                            error: format!("Stream error: {}", e),
                            status: "failed".into(),
                        },
                    );
                    break;
                }
            }
        }

        let _ = file.flush().await;
        drop(file);

        if cancelled {
            log_warn!("[Download] Task '{}' cancelled by user. Cleaning partial file.", id);
            let _ = tokio::fs::remove_file(&dest_path).await;
            let _ = app_handle.emit_to(
                    "main",
                "download-task-failed",
                DownloadFailedPayload {
                    id: id.clone(),
                    url: url.clone(),
                    filename: filename.clone(),
                    error: "Cancelled by user".into(),
                    status: "failed".into(),
                },
            );
        } else if !failed {
            log_info!("[Download] Task '{}' finished successfully! Saved to '{}'", id, dest_str);
            let _ = app_handle.emit_to(
                    "main",
                "download-task-completed",
                DownloadCompletedPayload {
                    id: id.clone(),
                    url: url.clone(),
                    filename: filename.clone(),
                    destination: dest_str.clone(),
                    total_bytes: received_bytes,
                    status: "completed".into(),
                },
            );
        }

        if let Ok(mut map) = ACTIVE_DOWNLOADS.lock() {
            map.remove(&id);
        }
    });

    Ok(task_id)
}

#[command]
pub async fn start_download(
    app: AppHandle,
    url: String,
    filename: Option<String>,
) -> Result<String, String> {
    start_download_task(app, url, filename).await
}

#[command]
pub async fn cancel_download(id: String) -> Result<(), String> {
    log_info!("[Download] Request to cancel download task '{}'", id);
    if let Ok(map) = ACTIVE_DOWNLOADS.lock() {
        if let Some(flag) = map.get(&id) {
            flag.store(true, Ordering::SeqCst);
        }
    }
    Ok(())
}

#[command]
pub async fn open_download_file(path: String) -> Result<(), String> {
    log_info!("[Download] Opening downloaded file '{}'", path);
    open::that(&path).map_err(|e| format!("Failed to open file: {}", e))
}

#[command]
pub async fn show_in_folder(path: String) -> Result<(), String> {
    log_info!("[Download] Showing in folder '{}'", path);

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| format!("Failed to open explorer: {}", e))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| format!("Failed to open Finder: {}", e))?;
        return Ok(());
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let p = Path::new(&path);
        let folder = if p.is_file() {
            p.parent().unwrap_or(p)
        } else {
            p
        };
        open::that(folder).map_err(|e| format!("Failed to show folder: {}", e))?;
        Ok(())
    }
}
