use crate::models::ProbeResponse;
use crate::{log_error, log_info, log_warn};
use std::time::Instant;
use tauri::command;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

/// Probes Google.com generate_204 through the proxy with strict 5-second timeout
#[command]
pub async fn check_google_204(port: Option<u16>) -> Result<ProbeResponse, String> {
    let start = Instant::now();
    let proxy_port = port.unwrap_or_else(crate::socks5::get_active_proxy_port);
    log_info!("[GoogleProbe] Checking Google 204 connectivity via 127.0.0.1:{}...", proxy_port);

    let probe_routine = async {
        let mut stream = TcpStream::connect(format!("127.0.0.1:{}", proxy_port))
            .await
            .map_err(|e| format!("Local SOCKS5 proxy not reachable: {}", e))?;

        // SOCKS5 handshake to www.google.com:80
        stream
            .write_all(&[0x05, 0x01, 0x00])
            .await
            .map_err(|e| format!("SOCKS5 init failed: {}", e))?;

        let mut resp = [0u8; 2];
        stream
            .read_exact(&mut resp)
            .await
            .map_err(|e| format!("SOCKS5 handshake read failed: {}", e))?;

        // Connect request for www.google.com:80
        let host = b"www.google.com";
        let mut req = vec![0x05, 0x01, 0x00, 0x03, host.len() as u8];
        req.extend_from_slice(host);
        req.extend_from_slice(&80u16.to_be_bytes());

        stream
            .write_all(&req)
            .await
            .map_err(|e| format!("SOCKS5 connect command failed: {}", e))?;

        let mut reply = [0u8; 10];
        stream
            .read_exact(&mut reply)
            .await
            .map_err(|e| format!("SOCKS5 reply read failed: {}", e))?;

        // Send HTTP GET /generate_204
        let http_get = b"GET /generate_204 HTTP/1.1\r\nHost: www.google.com\r\nUser-Agent: P2PBrowser/1.0\r\nConnection: close\r\n\r\n";
        stream
            .write_all(http_get)
            .await
            .map_err(|e| format!("HTTP GET send failed: {}", e))?;

        let mut http_resp = [0u8; 128];
        let n = stream.read(&mut http_resp).await.unwrap_or(0);
        let resp_str = String::from_utf8_lossy(&http_resp[..n]);

        if resp_str.contains("204") || resp_str.contains("200") {
            Ok(true)
        } else {
            Ok(false)
        }
    };

    match tokio::time::timeout(std::time::Duration::from_millis(5000), probe_routine).await {
        Ok(Ok(true)) => {
            let latency = start.elapsed().as_millis() as u64;
            log_info!("[GoogleProbe] Google 204 Verified successfully ({}ms)", latency);
            Ok(ProbeResponse {
                success: true,
                status: 204,
                latency_ms: latency,
                message: format!("Google 204 Verified ({}ms)", latency),
            })
        }
        Ok(Ok(false)) => {
            let latency = start.elapsed().as_millis() as u64;
            log_warn!("[GoogleProbe] Unexpected response from Google ({}ms)", latency);
            Ok(ProbeResponse {
                success: false,
                status: 504,
                latency_ms: latency,
                message: "Unexpected response from Google".into(),
            })
        }
        Ok(Err(err_msg)) => {
            let latency = start.elapsed().as_millis() as u64;
            log_warn!("[GoogleProbe] Google probe error ({}ms): {}", latency, err_msg);
            Ok(ProbeResponse {
                success: false,
                status: 502,
                latency_ms: latency,
                message: err_msg,
            })
        }
        Err(_) => {
            let latency = start.elapsed().as_millis() as u64;
            log_error!("[GoogleProbe] Google 204 check timed out after 5000ms");
            Ok(ProbeResponse {
                success: false,
                status: 408,
                latency_ms: latency,
                message: "Google 204 check timed out after 5000ms".into(),
            })
        }
    }
}
