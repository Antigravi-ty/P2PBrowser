import { useEffect, MutableRefObject } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { P2PWebRTCTunnel } from '../network/P2PWebRTCTunnel';
import { HostStreamClosePayload, HostStreamDataPayload } from '../types/network';

export function useHostRelayEvents(tunnelRef: MutableRefObject<P2PWebRTCTunnel | null>) {
  useEffect(() => {
    if (!isTauri()) return;

    let isMounted = true;
    const unlistenFns: Array<() => void> = [];

    listen<HostStreamDataPayload>('host-stream-data', (event) => {
      const payload = event.payload;
      const streamId = payload.streamId ?? payload.stream_id;
      const data = payload.data;
      const tunnel = tunnelRef.current;
      if (streamId !== undefined && data && tunnel) {
        tunnel.sendStreamData(streamId, new Uint8Array(data));
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
        console.warn('[Host] Error registering host-stream-data listener:', err);
      });

    listen<HostStreamClosePayload>('host-stream-close', (event) => {
      const payload = event.payload;
      const streamId = payload.streamId ?? payload.stream_id;
      const tunnel = tunnelRef.current;
      if (streamId !== undefined && tunnel) {
        tunnel.closeStream(streamId);
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
        console.warn('[Host] Error registering host-stream-close listener:', err);
      });

    return () => {
      isMounted = false;
      for (const unlisten of unlistenFns) {
        unlisten();
      }
    };
  }, [tunnelRef]);
}
