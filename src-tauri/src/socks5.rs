use crate::models::{
    ClientSocks5ClosePayload, ClientSocks5DataPayload, ClientSocks5OpenPayload,
};
use crate::{log_error, log_info, log_warn};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU16, AtomicU32, Ordering};
use std::sync::{LazyLock, Mutex};
use tauri::{command, AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;

static ACTIVE_PROXY_PORT: AtomicU16 = AtomicU16::new(10808);
static PROXY_ABORT_HANDLE: Mutex<Option<tokio::task::AbortHandle>> = Mutex::new(None);
static P2P_TUNNEL_ACTIVE: AtomicBool = AtomicBool::new(false);
static SOCKS5_STREAM_COUNTER: AtomicU32 = AtomicU32::new(1000);

pub fn get_active_proxy_port() -> u16 {
    ACTIVE_PROXY_PORT.load(Ordering::SeqCst)
}

pub fn is_proxy_running() -> bool {
    PROXY_ABORT_HANDLE.lock().map(|h| h.is_some()).unwrap_or(false)
}

pub fn is_tunnel_active() -> bool {
    P2P_TUNNEL_ACTIVE.load(Ordering::SeqCst)
}

struct ClientSocks5Control {
    sender: mpsc::Sender<Vec<u8>>,
    ack_sender: Option<tokio::sync::oneshot::Sender<bool>>,
    abort_handle: tokio::task::AbortHandle,
}

static CLIENT_SOCKS5_STREAMS: LazyLock<Mutex<HashMap<u32, ClientSocks5Control>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn remove_client_socks5_stream(stream_id: u32) {
    if let Ok(mut map) = CLIENT_SOCKS5_STREAMS.lock() {
        if let Some(control) = map.remove(&stream_id) {
            control.abort_handle.abort();
            log_info!("[ClientSOCKS5] Terminated client stream #{}", stream_id);
        }
    }
}

/// SOCKS5 Proxy Handler (RFC 1928)
/// Relays local browser connections either:
/// 1) Over the WebRTC P2P DataChannel to the Remote Host (when P2P tunnel is active)
/// 2) Or directly to destination TCP socket (local direct fallback)
async fn handle_socks5_client(
    app: AppHandle,
    mut client: TcpStream,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Step 1: Version and Auth Negotiation
    let mut ver_buf = [0u8; 2];
    client.read_exact(&mut ver_buf).await?;
    if ver_buf[0] != 0x05 {
        return Err("Unsupported SOCKS version".into());
    }
    let nmethods = ver_buf[1] as usize;
    let mut methods = vec![0u8; nmethods];
    client.read_exact(&mut methods).await?;

    // Respond: 0x05, 0x00 (NO AUTH REQUIRED)
    client.write_all(&[0x05, 0x00]).await?;

    // Step 2: Request details
    let mut req_header = [0u8; 4];
    client.read_exact(&mut req_header).await?;
    let cmd = req_header[1];
    let atyp = req_header[3];

    if cmd != 0x01 {
        // Only CONNECT supported
        client
            .write_all(&[0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
            .await?;
        return Err("Unsupported command (only CONNECT supported)".into());
    }

    let target_host = match atyp {
        0x01 => {
            // IPv4
            let mut ipv4 = [0u8; 4];
            client.read_exact(&mut ipv4).await?;
            format!("{}.{}.{}.{}", ipv4[0], ipv4[1], ipv4[2], ipv4[3])
        }
        0x03 => {
            // Domain name
            let mut len_buf = [0u8; 1];
            client.read_exact(&mut len_buf).await?;
            let domain_len = len_buf[0] as usize;
            let mut domain = vec![0u8; domain_len];
            client.read_exact(&mut domain).await?;
            String::from_utf8_lossy(&domain).to_string()
        }
        0x04 => {
            // IPv6
            let mut ipv6 = [0u8; 16];
            client.read_exact(&mut ipv6).await?;
            "127.0.0.1".to_string()
        }
        _ => {
            client
                .write_all(&[0x05, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
                .await?;
            return Err("Unsupported address type".into());
        }
    };

    let mut port_buf = [0u8; 2];
    client.read_exact(&mut port_buf).await?;
    let target_port = u16::from_be_bytes(port_buf);
    let target_addr = format!("{}:{}", target_host, target_port);

    if P2P_TUNNEL_ACTIVE.load(Ordering::SeqCst) {
        // Mode A: P2P WebRTC Tunnel Routing
        let stream_id = SOCKS5_STREAM_COUNTER.fetch_add(1, Ordering::SeqCst);
        log_info!("[SOCKS5] P2P tunnel active: routing stream #{} -> {}", stream_id, target_addr);

        let (tx_inbound, mut rx_inbound) = mpsc::channel::<Vec<u8>>(128);
        let (ack_tx, ack_rx) = tokio::sync::oneshot::channel::<bool>();

        let (mut read_half, mut write_half) = client.into_split();
        let app_reader = app.clone();
        let reader_task = tokio::spawn(async move {
            let mut buf = [0u8; 16384];
            loop {
                match read_half.read(&mut buf).await {
                    Ok(0) => {
                        // Client write-half closed (half-close / EOF). Notify remote Host,
                        // but DO NOT remove stream yet: inbound data from Host must still be written to client!
                        let _ = app_reader.emit_to(
                            "main",
                            "client-socks5-close",
                            ClientSocks5ClosePayload {
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
                            "client-socks5-data",
                            ClientSocks5DataPayload {
                                stream_id,
                                data,
                            },
                        );
                    }
                    Err(e) => {
                        let _ = app_reader.emit_to(
                            "main",
                            "client-socks5-close",
                            ClientSocks5ClosePayload {
                                stream_id,
                                error: Some(e.to_string()),
                            },
                        );
                        remove_client_socks5_stream(stream_id);
                        break;
                    }
                }
            }
        });

        if let Ok(mut map) = CLIENT_SOCKS5_STREAMS.lock() {
            map.insert(
                stream_id,
                ClientSocks5Control {
                    sender: tx_inbound,
                    ack_sender: Some(ack_tx),
                    abort_handle: reader_task.abort_handle(),
                },
            );
        }

        // Notify frontend WebRTC tunnel to initiate multiplexed stream to Host
        let _ = app.emit_to(
            "main",
            "client-socks5-stream-open",
            ClientSocks5OpenPayload {
                stream_id,
                host: target_host.clone(),
                port: target_port,
            },
        );

        // Await WebRTC connection acknowledgment (up to 16s to match host TCP connect timeout)
        match tokio::time::timeout(std::time::Duration::from_secs(16), ack_rx).await {
            Ok(Ok(true)) => {
                // SOCKS5 SUCCESS reply (0x00 = succeeded)
                if let Err(e) = write_half
                    .write_all(&[0x05, 0x00, 0x00, 0x01, 127, 0, 0, 1, 0, 0])
                    .await
                {
                    remove_client_socks5_stream(stream_id);
                    return Err(e.into());
                }
                log_info!("[SOCKS5] Stream #{} established successfully over P2P", stream_id);
            }
            _ => {
                // Connection failed or timed out (0x04 = Host unreachable)
                log_warn!("[SOCKS5] Stream #{} failed or timed out waiting for WebRTC ack", stream_id);
                let _ = write_half
                    .write_all(&[0x05, 0x04, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
                    .await;
                remove_client_socks5_stream(stream_id);
                return Err("WebRTC stream establishment failed or timed out".into());
            }
        }

        // Forward inbound data chunks from remote Host -> local browser socket
        while let Some(chunk) = rx_inbound.recv().await {
            if let Err(_) = write_half.write_all(&chunk).await {
                break;
            }
        }
        let _ = write_half.shutdown().await;
        reader_task.abort();
        remove_client_socks5_stream(stream_id);
        Ok(())
    } else {
        // Mode B: Direct Local TCP Fallback
        log_info!("[SOCKS5] Direct TCP fallback: connecting to {}", target_addr);
        match TcpStream::connect(&target_addr).await {
            Ok(mut target) => {
                client
                    .write_all(&[0x05, 0x00, 0x00, 0x01, 127, 0, 0, 1, 0, 0])
                    .await?;
                let _ = tokio::io::copy_bidirectional(&mut client, &mut target).await;
                Ok(())
            }
            Err(e) => {
                log_warn!("[SOCKS5] Direct connection to {} failed: {}", target_addr, e);
                client
                    .write_all(&[0x05, 0x04, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
                    .await?;
                Err(e.into())
            }
        }
    }
}

/// Start local lightweight SOCKS5 Proxy Server with automatic port collision fallback (up to 100 ports + dynamic OS allocation)
#[command]
pub async fn start_socks5_proxy(app: AppHandle, port: Option<u16>) -> Result<u16, String> {
    let initial_port = port.unwrap_or_else(|| ACTIVE_PROXY_PORT.load(Ordering::SeqCst));
    log_info!("[SOCKS5] Starting SOCKS5 proxy server probe starting from port {}", initial_port);
    let mut bound_listener = None;

    // Sequentially probe up to 100 ports starting from initial_port
    let max_probe = initial_port.saturating_add(100);
    for p in initial_port..=max_probe {
        if let Ok(listener) = TcpListener::bind(format!("127.0.0.1:{}", p)).await {
            bound_listener = Some(listener);
            break;
        }
    }

    // If 100 ports were busy, attempt #101: dynamic OS ephemeral port allocation (port 0)
    let listener = match bound_listener {
        Some(l) => l,
        None => TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| {
                let err = format!(
                    "Failed to bind SOCKS5 proxy after probing 100 ports ({}-{}) and OS automatic port: {}. Please diagnose in Terminal via `lsof -i :{}`.",
                    initial_port, max_probe, e, initial_port
                );
                log_error!("[SOCKS5] {}", err);
                err
            })?,
    };

    let local_port = listener.local_addr().map_err(|e| e.to_string())?.port();
    ACTIVE_PROXY_PORT.store(local_port, Ordering::SeqCst);
    log_info!("[SOCKS5] Proxy server successfully listening on 127.0.0.1:{}", local_port);

    // Abort previous listener task if still running to prevent socket leakage into TIME_WAIT
    if let Ok(mut handle_guard) = PROXY_ABORT_HANDLE.lock() {
        if let Some(h) = handle_guard.take() {
            h.abort();
            log_info!("[SOCKS5] Aborted previous proxy listener task");
        }
    }

    let app_handle = app.clone();
    let task = tokio::spawn(async move {
        while let Ok((socket, _)) = listener.accept().await {
            let app_c = app_handle.clone();
            tokio::spawn(async move {
                let _ = handle_socks5_client(app_c, socket).await;
            });
        }
    });

    if let Ok(mut handle_guard) = PROXY_ABORT_HANDLE.lock() {
        *handle_guard = Some(task.abort_handle());
    }

    Ok(local_port)
}

/// Enables or disables P2P WebRTC tunneling for the local SOCKS5 proxy
#[command]
pub fn set_client_tunnel_mode(active: bool) {
    log_info!("[SOCKS5] Setting client P2P tunnel mode: {}", active);
    P2P_TUNNEL_ACTIVE.store(active, Ordering::SeqCst);
    if !active {
        if let Ok(mut map) = CLIENT_SOCKS5_STREAMS.lock() {
            for (_, control) in map.drain() {
                control.abort_handle.abort();
            }
        }
    }
}

/// Acknowledges client SOCKS5 stream initiation after WebRTC open handshake
#[command]
pub async fn client_socks5_ack(stream_id: u32, success: bool) -> Result<(), String> {
    log_info!("[ClientSOCKS5] Acknowledging stream #{}: success={}", stream_id, success);
    let ack_sender = {
        let mut map = CLIENT_SOCKS5_STREAMS.lock().map_err(|e| e.to_string())?;
        map.get_mut(&stream_id).and_then(|c| c.ack_sender.take())
    };
    if let Some(sender) = ack_sender {
        let _ = sender.send(success);
        Ok(())
    } else {
        Err(format!("Stream #{} ack sender not found", stream_id))
    }
}

/// Receives data chunks from remote Host over WebRTC DataChannel and forwards to local browser SOCKS5 socket
#[command]
pub async fn client_socks5_recv_data(stream_id: u32, data: Vec<u8>) -> Result<(), String> {
    let sender = {
        let map = CLIENT_SOCKS5_STREAMS.lock().map_err(|e| e.to_string())?;
        map.get(&stream_id).map(|c| c.sender.clone())
    };
    if let Some(tx) = sender {
        tx.send(data).await.map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err(format!("Stream #{} not found or already closed", stream_id))
    }
}

/// Closes a client SOCKS5 stream
#[command]
pub async fn client_socks5_close_stream(stream_id: u32) -> Result<(), String> {
    log_info!("[ClientSOCKS5] Explicit close for stream #{}", stream_id);
    remove_client_socks5_stream(stream_id);
    Ok(())
}
