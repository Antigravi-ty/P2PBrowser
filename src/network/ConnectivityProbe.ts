/**
 * src/network/ConnectivityProbe.ts
 * Probes Google.com connectivity (generate_204) through the P2P WebRTC Proxy tunnel.
 * Emits timestamped diagnostics for network latency and reachability verification.
 */

import { GoogleProbeResult } from '../types/network';
import { P2PWebRTCTunnel } from './P2PWebRTCTunnel';

export class ConnectivityProbe {
  /**
   * Performs an end-to-end Google generate_204 probe across the WebRTC tunnel.
   * Strictly enforces a 5-second timeout (default: 5000ms).
   */
  public static async probeGoogle(
    tunnel: P2PWebRTCTunnel,
    timeoutMs: number = 5000
  ): Promise<GoogleProbeResult> {
    const startTime = performance.now();
    console.log(`[ConnectivityProbe] Starting Google 204 connectivity probe across tunnel (timeout: ${timeoutMs}ms)...`);

    return new Promise<GoogleProbeResult>((resolve) => {
      let isResolved = false;
      const timeout = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          const latencyMs = Math.round(performance.now() - startTime);
          console.warn(`[ConnectivityProbe] Google 204 check timed out after ${timeoutMs}ms (elapsed: ${latencyMs}ms)`);
          resolve({
            success: false,
            status: 408,
            latencyMs,
            checkedAt: Date.now(),
            message: `Google 204 check timed out after ${timeoutMs}ms`,
          });
        }
      }, timeoutMs);

      try {
        const streamId = tunnel.openStream('www.google.com', 80, {
          onData: (chunk) => {
            if (isResolved) return;
            const text = new TextDecoder().decode(chunk);
            console.log(`[ConnectivityProbe] Stream #${streamId} response chunk (${chunk.length} bytes):`, text.slice(0, 120).trim());
            if (text.includes('HTTP/1.1 204') || text.includes('HTTP/1.0 204') || text.includes('204 No Content')) {
              isResolved = true;
              clearTimeout(timeout);
              const latencyMs = Math.round(performance.now() - startTime);
              tunnel.closeStream(streamId);
              console.log(`[ConnectivityProbe] Google 204 Verified successfully (${latencyMs}ms)`);
              resolve({
                success: true,
                status: 204,
                latencyMs,
                checkedAt: Date.now(),
                message: `Google 204 Verified (${latencyMs}ms)`,
              });
            } else if (text.includes('HTTP/1.1 200') || text.includes('HTTP/1.1 301') || text.includes('HTTP/1.1 302')) {
              isResolved = true;
              clearTimeout(timeout);
              const latencyMs = Math.round(performance.now() - startTime);
              tunnel.closeStream(streamId);
              console.log(`[ConnectivityProbe] Google Reachable status 200/30x (${latencyMs}ms)`);
              resolve({
                success: true,
                status: 200,
                latencyMs,
                checkedAt: Date.now(),
                message: `Google Reachable (${latencyMs}ms)`,
              });
            }
          },
          onError: (err) => {
            if (isResolved) return;
            isResolved = true;
            clearTimeout(timeout);
            const latencyMs = Math.round(performance.now() - startTime);
            console.error(`[ConnectivityProbe] Stream #${streamId} error (${latencyMs}ms):`, err);
            resolve({
              success: false,
              status: 502,
              latencyMs,
              checkedAt: Date.now(),
              message: `Probe error: ${err}`,
            });
          },
          onClose: () => {
            if (!isResolved) {
              isResolved = true;
              clearTimeout(timeout);
              const latencyMs = Math.round(performance.now() - startTime);
              console.warn(`[ConnectivityProbe] Stream #${streamId} closed before Google responded (${latencyMs}ms)`);
              resolve({
                success: false,
                status: 504,
                latencyMs,
                checkedAt: Date.now(),
                message: 'Stream closed before Google responded',
              });
            }
          },
        });

        // Send HTTP GET request for generate_204
        const reqStr =
          'GET /generate_204 HTTP/1.1\r\n' +
          'Host: www.google.com\r\n' +
          'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 P2PBrowser/1.0\r\n' +
          'Connection: close\r\n\r\n';

        console.log(`[ConnectivityProbe] Dispatched HTTP GET /generate_204 on stream #${streamId}`);
        tunnel.sendStreamData(streamId, new TextEncoder().encode(reqStr));
      } catch (e: any) {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeout);
          const latencyMs = Math.round(performance.now() - startTime);
          console.error('[ConnectivityProbe] Failed to dispatch probe request:', e);
          resolve({
            success: false,
            status: 500,
            latencyMs,
            checkedAt: Date.now(),
            message: e?.message || 'Failed to dispatch probe request',
          });
        }
      }
    });
  }
}
