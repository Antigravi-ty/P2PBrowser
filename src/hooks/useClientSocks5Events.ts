import { useEffect, useRef, MutableRefObject } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { P2PWebRTCTunnel } from '../network/P2PWebRTCTunnel';
import {
  ClientSocks5ClosePayload,
  ClientSocks5DataPayload,
  ClientSocks5OpenPayload,
} from '../types/network';

export function useClientSocks5Events(
  tunnelRef: MutableRefObject<P2PWebRTCTunnel | null>,
  addLog: (level: 'info' | 'warn' | 'error', text: string) => void
) {
  // Keep addLog in a ref so listener registration is decoupled from component re-renders
  const addLogRef = useRef(addLog);
  addLogRef.current = addLog;

  // Persistent per-stream sequential Promise FIFO queue across re-renders
  const streamWriteQueuesRef = useRef<Map<number, Promise<void>>>(new Map());

  const enqueueStreamWrite = (streamId: number, task: () => Promise<void>) => {
    const queues = streamWriteQueuesRef.current;
    const current = queues.get(streamId) || Promise.resolve();
    const next = current
      .then(task)
      .catch((err) => {
        console.error(`[ClientSOCKS5] Error in sequential write for stream #${streamId}:`, err);
      });
    queues.set(streamId, next);
    return next;
  };

  useEffect(() => {
    if (!isTauri()) return;

    let isMounted = true;
    const unlistenFns: Array<() => void> = [];

    listen<ClientSocks5OpenPayload>('client-socks5-stream-open', (event) => {
      const payload = event.payload;
      const streamId = payload.streamId ?? payload.stream_id;
      const host = payload.host;
      const port = payload.port;
      const tunnel = tunnelRef.current;

      if (
        streamId !== undefined &&
        tunnel &&
        (tunnel.getState() === 'p2p_connected' || tunnel.getState() === 'ready')
      ) {
        console.log(`[ClientSOCKS5] Forwarding inbound stream #${streamId} (${host}:${port}) over P2P DataChannel to Host`);
        addLogRef.current('info', `[Client] Stream #${streamId} proxying -> ${host}:${port}`);

        let ackSent = false;
        const sendAck = (success: boolean) => {
          if (ackSent) return;
          ackSent = true;
          if (ackTimer) clearTimeout(ackTimer);
          invoke('client_socks5_ack', {
            streamId,
            stream_id: streamId,
            success,
          }).catch((err) => {
            console.error(`[ClientSOCKS5] Error sending stream ack for #${streamId}:`, err);
          });
        };

        // Fallback timeout: aligned with host connect timeout (18s)
        const ackTimer = setTimeout(() => {
          if (!ackSent) {
            console.warn(`[ClientSOCKS5] Stream #${streamId} ACK timed out waiting for Host`);
            sendAck(false);
          }
        }, 18000);

        tunnel.openStreamWithCustomId(streamId, host, port, {
          onAck: (success: boolean, error?: string) => {
            if (success) {
              sendAck(true);
            } else {
              console.warn(`[ClientSOCKS5] Host failed to connect stream #${streamId} (${host}:${port}):`, error);
              sendAck(false);
            }
          },
          onData: (chunk) => {
            // Strictly preserve FIFO chunk ordering when piping to Rust SOCKS5 socket
            enqueueStreamWrite(streamId, async () => {
              try {
                await invoke('client_socks5_recv_data', {
                  streamId,
                  stream_id: streamId,
                  data: Array.from(chunk),
                });
              } catch (err) {
                console.error(`[ClientSOCKS5] Error forwarding chunk to proxy for stream #${streamId}:`, err);
              }
            });
          },
          onClose: () => {
            if (!ackSent) sendAck(false);
            console.log(`[ClientSOCKS5] Stream #${streamId} closed by remote host`);
            // Drain all pending chunks in the sequential queue before shutting down the client socket
            enqueueStreamWrite(streamId, async () => {
              await invoke('client_socks5_close_stream', {
                streamId,
                stream_id: streamId,
              }).catch(() => {});
              streamWriteQueuesRef.current.delete(streamId);
            });
          },
          onError: (err) => {
            if (!ackSent) sendAck(false);
            console.warn(`[ClientSOCKS5] Stream #${streamId} encountered error:`, err);
            invoke('client_socks5_close_stream', {
              streamId,
              stream_id: streamId,
            }).catch(() => {});
            streamWriteQueuesRef.current.delete(streamId);
          },
        });
      } else {
        console.warn(`[ClientSOCKS5] Stream #${streamId} requested to ${host}:${port} but P2P tunnel is not connected!`);
        invoke('client_socks5_ack', {
          streamId: streamId ?? 0,
          stream_id: streamId ?? 0,
          success: false,
        }).catch(() => {});
      }
    })
      .then((unlisten) => {
        if (!isMounted) {
          unlisten();
        } else {
          unlistenFns.push(unlisten);
        }
      })
      .catch((err) => {
        console.warn('[ClientSOCKS5] Error registering stream-open listener:', err);
      });

    listen<ClientSocks5DataPayload>('client-socks5-data', (event) => {
      const payload = event.payload;
      const streamId = payload.streamId ?? payload.stream_id;
      const data = payload.data;
      const tunnel = tunnelRef.current;
      if (streamId !== undefined && data && tunnel) {
        const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data);
        tunnel.sendStreamData(streamId, uint8);
      }
    })
      .then((unlisten) => {
        if (!isMounted) {
          unlisten();
        } else {
          unlistenFns.push(unlisten);
        }
      })
      .catch((err) => {
        console.warn('[ClientSOCKS5] Error registering stream-data listener:', err);
      });

    listen<ClientSocks5ClosePayload>('client-socks5-close', (event) => {
      const payload = event.payload;
      const streamId = payload.streamId ?? payload.stream_id;
      const tunnel = tunnelRef.current;
      if (streamId !== undefined && tunnel) {
        // If there is an actual client socket error (e.g. connection reset), abort tunnel stream.
        // If payload.error is None/null, it's a client half-close (EOF on browser write-half).
        // DO NOT kill the tunnel stream, so downstream response from server can complete!
        if (payload.error) {
          console.warn(`[ClientSOCKS5] Stream #${streamId} client-side error: ${payload.error}. Aborting tunnel stream.`);
          tunnel.closeStream(streamId);
          streamWriteQueuesRef.current.delete(streamId);
        }
      }
    })
      .then((unlisten) => {
        if (!isMounted) {
          unlisten();
        } else {
          unlistenFns.push(unlisten);
        }
      })
      .catch((err) => {
        console.warn('[ClientSOCKS5] Error registering stream-close listener:', err);
      });

    return () => {
      isMounted = false;
      for (const unlisten of unlistenFns) {
        unlisten();
      }
      streamWriteQueuesRef.current.clear();
    };
  }, [tunnelRef]);
}
