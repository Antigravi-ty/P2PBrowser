use crate::models::{HostStreamClosePayload, HostStreamDataPayload};
use crate::{log_error, log_info, log_warn};
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use tauri::{command, AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::mpsc;

struct HostStreamControl {
    sender: mpsc::Sender<Vec<u8>>,
    abort_handle: tokio::task::AbortHandle,
}

static HOST_STREAMS: LazyLock<Mutex<HashMap<u32, HostStreamControl>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn remove_host_stream(stream_id: u32) {
    if let Ok(mut map) = HOST_STREAMS.lock() {
        if let Some(control) = map.remove(&stream_id) {
            control.abort_handle.abort();
            log_info!("[HostRelay] Terminated native TCP stream #{}", stream_id);
        }
    }
}

/// Native TCP Relay: opens a direct outbound TCP stream on the Host machine.
/// Intercepted transparently by Surge Enhanced Mode / TUN adapter / system routing without browser CORS.
#[command]
pub async fn host_open_tcp_stream(
    app: AppHandle,
    stream_id: u32,
    host: String,
    port: u16,
) -> Result<(), String> {
    let target_addr = if host.contains(':') && !host.starts_with('[') {
        format!("[{}]:{}", host, port)
    } else {
        format!("{}:{}", host, port)
    };
    log_info!("[HostRelay] Opening native TCP stream #{} -> {}", stream_id, target_addr);

    let connect_timeout = std::time::Duration::from_secs(15);
    let socket = match tokio::time::timeout(connect_timeout, TcpStream::connect(&target_addr)).await {
        Ok(Ok(stream)) => stream,
        Ok(Err(e)) => {
            let err = format!("Connection to {} failed: {}", target_addr, e);
            log_warn!("[HostRelay] Stream #{}: {}", stream_id, err);
            return Err(err);
        }
        Err(_) => {
            let err = format!("Connection to {} timed out after 15s", target_addr);
            log_error!("[HostRelay] Stream #{}: {}", stream_id, err);
            return Err(err);
        }
    };

    let (mut read_half, mut write_half) = socket.into_split();
    let (tx, mut rx) = mpsc::channel::<Vec<u8>>(128);

    let app_reader = app.clone();
    let reader_task = tokio::spawn(async move {
        let mut buf = [0u8; 16384];
        loop {
            match read_half.read(&mut buf).await {
                Ok(0) => {
                    log_info!("[HostRelay] Stream #{} read EOF from remote target", stream_id);
                    let _ = app_reader.emit_to(
                        "main",
                        "host-stream-close",
                        HostStreamClosePayload {
                            stream_id,
                            error: None,
                        },
                    );
                    break;
                }
                Ok(n) => {
                    let data = buf[..n].to_vec();
                    let _ = app_reader.emit_to(
                        "main",
                        "host-stream-data",
                        HostStreamDataPayload {
                            stream_id,
                            data,
                        },
                    );
                }
                Err(e) => {
                    log_warn!("[HostRelay] Stream #{} read error: {}", stream_id, e);
                    let _ = app_reader.emit_to(
                        "main",
                        "host-stream-close",
                        HostStreamClosePayload {
                            stream_id,
                            error: Some(e.to_string()),
                        },
                    );
                    break;
                }
            }
        }
        remove_host_stream(stream_id);
    });

    let app_writer = app.clone();
    tokio::spawn(async move {
        while let Some(chunk) = rx.recv().await {
            if let Err(e) = write_half.write_all(&chunk).await {
                log_warn!("[HostRelay] Stream #{} write error: {}", stream_id, e);
                let _ = app_writer.emit_to(
                    "main",
                    "host-stream-close",
                    HostStreamClosePayload {
                        stream_id,
                        error: Some(e.to_string()),
                    },
                );
                break;
            }
        }
        let _ = write_half.shutdown().await;
    });

    if let Ok(mut map) = HOST_STREAMS.lock() {
        if let Some(old) = map.remove(&stream_id) {
            old.abort_handle.abort();
        }
        map.insert(
            stream_id,
            HostStreamControl {
                sender: tx,
                abort_handle: reader_task.abort_handle(),
            },
        );
    }

    log_info!("[HostRelay] Stream #{} active and ready for data forwarding", stream_id);
    Ok(())
}

/// Forwards data received from WebRTC peer to target native TCP stream
#[command]
pub async fn host_send_tcp_data(stream_id: u32, data: Vec<u8>) -> Result<(), String> {
    let sender = {
        let map = HOST_STREAMS.lock().map_err(|e| e.to_string())?;
        map.get(&stream_id).map(|c| c.sender.clone())
    };

    if let Some(tx) = sender {
        tx.send(data).await.map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err(format!("Stream #{} not found or already closed", stream_id))
    }
}

/// Closes the native TCP stream and terminates reader/writer tasks
#[command]
pub async fn host_close_tcp_stream(stream_id: u32) -> Result<(), String> {
    log_info!("[HostRelay] Closing stream #{}", stream_id);
    remove_host_stream(stream_id);
    Ok(())
}

/// Closes all active native TCP streams (e.g. on host disconnect or shutdown)
#[command]
pub async fn host_close_all_tcp_streams() -> Result<(), String> {
    log_info!("[HostRelay] Closing all active native TCP streams");
    if let Ok(mut map) = HOST_STREAMS.lock() {
        for (id, control) in map.drain() {
            log_info!("[HostRelay] Aborting stream #{}", id);
            control.abort_handle.abort();
        }
    }
    Ok(())
}
