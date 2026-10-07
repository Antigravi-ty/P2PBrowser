import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  AppRole,
  EventLogItem,
  GoogleProbeResult,
  ServerTelemetry,
  TunnelState,
} from '../types/network';
import {
  DEFAULT_SIGNALING_URL,
  generateRandomRoomCode,
} from '../network/SignalingConfig';
import { WebSocketSignalingClient } from '../network/WebSocketSignalingClient';
import { P2PWebRTCTunnel } from '../network/P2PWebRTCTunnel';
import { tabWebviewManager } from '../network/TabWebviewManager';
import { ActiveView } from '../components/Sidebar';

export function useP2PTunnel() {
  const [role, setRole] = useState<AppRole>('client');
  const [activeView, setActiveView] = useState<ActiveView>('browser');
  const [roomId, setRoomId] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [signalingUrl, setSignalingUrl] = useState<string>(DEFAULT_SIGNALING_URL);
  const [socks5Port, setSocks5Port] = useState<number>(10808);

  // Tunnel, Telemetry & Logs
  const [tunnelState, setTunnelState] = useState<TunnelState>('idle');
  const [signalingStatusMsg, setSignalingStatusMsg] = useState<string>('');
  const [isHostServerRunning, setIsHostServerRunning] = useState<boolean>(false);
  const [isStartingServer, setIsStartingServer] = useState<boolean>(false);
  const [transportType, setTransportType] = useState<string>('auto');
  const [eventLogs, setEventLogs] = useState<EventLogItem[]>([]);
  const [telemetry, setTelemetry] = useState<ServerTelemetry>({
    activeClients: [],
    activeStreams: [],
    totalBytesUp: 0,
    totalBytesDown: 0,
    speedUpBps: 0,
    speedDownBps: 0,
    surgeEnhancedModeDetected: true,
    isSignalingConnected: false,
  });

  const tunnelRef = useRef<P2PWebRTCTunnel | null>(null);
  const signalingRef = useRef<WebSocketSignalingClient | null>(null);
  const proxyInitializedRef = useRef(false);

  const addLog = useCallback((level: 'info' | 'warn' | 'error', text: string) => {
    const timeStr = new Date().toISOString();
    setEventLogs((prev) => [
      { id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, time: timeStr, level, text },
      ...prev.slice(0, 99),
    ]);
  }, []);

  // Initialize internal SOCKS5 proxy & cleanup orphan webviews ONCE upon app mounting
  useEffect(() => {
    tabWebviewManager.cleanupOrphanWebviews();

    if (isTauri() && !proxyInitializedRef.current) {
      proxyInitializedRef.current = true;
      invoke<number>('start_socks5_proxy', { port: 10808 })
        .then((actualPort) => {
          console.log(`[SOCKS5] Internal bridge successfully listening on 127.0.0.1:${actualPort}`);
          setSocks5Port(actualPort);
          tabWebviewManager.setProxyPort(actualPort);
        })
        .catch((err) => {
          const errorMsg = String(err?.message || err);
          console.error('[SOCKS5] Error initializing internal proxy:', errorMsg);
          alert(
            `[SOCKS5 Proxy Error]\n\n${errorMsg}\n\n` +
            `Diagnosis:\n` +
            `1. Open Terminal and run: lsof -i :10808\n` +
            `2. Check if another proxy application is holding ports.\n` +
            `3. If ports were recently in use, wait 10-30 seconds for TIME_WAIT sockets to release, then reload.`
          );
        });
    } else {
      tabWebviewManager.setProxyPort(10808);
    }
  }, []);

  // Switch role handler:
  const handleRoleChange = (newRole: AppRole) => {
    setRole(newRole);
    if (newRole === 'host') {
      setActiveView('info');
      if (!roomId || !/^[a-zA-Z0-9-]+$/.test(roomId.trim())) {
        setRoomId(generateRandomRoomCode());
      }
    } else {
      setActiveView('browser');
    }
  };

  // User updates SOCKS5 port from Settings Modal
  const handleUpdateSocks5Port = async (newPort: number) => {
    setSocks5Port(newPort);
    tabWebviewManager.setProxyPort(newPort);
    if (isTauri()) {
      try {
        const actualPort = await invoke<number>('start_socks5_proxy', { port: newPort });
        console.log(`[SOCKS5] Internal bridge re-bound on 127.0.0.1:${actualPort}`);
        setSocks5Port(actualPort);
        tabWebviewManager.setProxyPort(actualPort);
      } catch (err: any) {
        const errorMsg = String(err?.message || err);
        console.error('[SOCKS5] Error updating proxy port:', errorMsg);
        alert(
          `[SOCKS5 Proxy Error]\n\n${errorMsg}\n\n` +
          `Diagnosis:\n` +
          `1. Open Terminal and run: lsof -i :${newPort}\n` +
          `2. Wait 10-30s for sockets to release and retry.`
        );
      }
    }
  };

  // Stop server or disconnect tunnel
  const handleDisconnect = () => {
    if (tunnelRef.current) {
      tunnelRef.current.close();
      tunnelRef.current = null;
    }
    if (signalingRef.current) {
      signalingRef.current.close();
      signalingRef.current = null;
    }
    setTunnelState('idle');
    setSignalingStatusMsg('');
    setIsHostServerRunning(false);
    setIsStartingServer(false);
    setTelemetry((prev) => ({
      ...prev,
      activeClients: [],
      activeStreams: [],
      isSignalingConnected: false,
    }));
    if (isTauri()) {
      invoke('host_close_all_tcp_streams').catch(() => {});
      invoke('set_client_tunnel_mode', { active: false }).catch(() => {});
    }
    addLog('warn', role === 'host' ? 'Host server stopped.' : 'P2P tunnel disconnected.');
  };

  // Host Create Server:
  const handleHostCreateServer = async (
    force: boolean = false,
    probeGoogleFn?: () => Promise<GoogleProbeResult>,
    promptConfirmFn?: (probeMsg: string) => void
  ) => {
    if (isStartingServer || isHostServerRunning) return;

    if (!force) {
      setIsStartingServer(true);
      addLog('info', '[Host] Pre-flight check: Verifying Google 204 connectivity before activating server...');

      if (probeGoogleFn) {
        const probeRes = await probeGoogleFn();
        if (!probeRes.success) {
          setIsStartingServer(false);
          addLog('warn', `[Host] Pre-flight Google check failed (${probeRes.message}). Requesting user confirmation to force start...`);
          promptConfirmFn?.(probeRes.message);
          return;
        }
        addLog('info', `[Host] Pre-flight Google verified (${probeRes.latencyMs}ms). Connecting to Token Server...`);
      }
    } else {
      setIsStartingServer(true);
      addLog('warn', '[Host] Force starting host server without verified Google 204 connectivity.');
    }

    let targetRoomId = roomId.trim();
    if (!targetRoomId || !/^[a-zA-Z0-9-]+$/.test(targetRoomId)) {
      targetRoomId = generateRandomRoomCode();
      setRoomId(targetRoomId);
    }

    handleDisconnect();

    setTunnelState('signaling');
    addLog('info', `Connecting to signaling server (${signalingUrl}) for room #${targetRoomId} as host...`);

    const signaling = new WebSocketSignalingClient({
      workerUrl: signalingUrl,
      roomId: targetRoomId,
      password,
      role: 'host',
      clientName: 'P2P Host Server',
    });
    signalingRef.current = signaling;

    const tunnel = new P2PWebRTCTunnel(signaling, 'host');
    tunnelRef.current = tunnel;

    tunnel.onStateChange = (state, message) => {
      console.log(`[App] Host Tunnel State -> ${state}: ${message || ''}`);
      setTunnelState(state);
      setTransportType(tunnel.getTransportType());
      addLog('info', `Host Tunnel State: ${state} - ${message || ''}`);
    };

    tunnel.onTelemetryUpdate = (data) => {
      setTelemetry({ ...data });
    };

    tunnel.onLogEntry = (entry) => {
      addLog(entry.level, `[${entry.category}] ${entry.message}`);
    };

    tunnel.onRemoteLog = (entry) => {
      setEventLogs((prev) => [
        {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          time: entry.timestamp,
          level: entry.level === 'debug' || entry.level === 'log' ? 'info' : (entry.level as any),
          text: entry.message,
        },
        ...prev.slice(0, 199),
      ]);
    };

    // Server stream dispatch & data forwarding (Native TCP Relay / Surge TUN)
    tunnel.onServerStreamRequested = (streamId, host, port, t) => {
      console.log(`[Host] Inbound stream #${streamId} requested to ${host}:${port}`);
      addLog('info', `[Host] Stream #${streamId} incoming request -> ${host}:${port}`);

      if (isTauri()) {
        let isOpened = false;
        let isFailed = false;
        let writeQueue = Promise.resolve();

        const enqueueHostWrite = (chunk: Uint8Array) => {
          writeQueue = writeQueue.then(async () => {
            if (isFailed) return;
            try {
              await invoke('host_send_tcp_data', {
                streamId,
                stream_id: streamId,
                data: Array.from(chunk),
              });
            } catch (e) {
              console.error(`[Host] Error forwarding chunk on stream #${streamId}:`, e);
            }
          });
        };

        const pendingQueue: Uint8Array[] = [];

        // Open native TCP stream in Rust backend (bypasses browser CORS; intercepted by Surge TUN)
        invoke('host_open_tcp_stream', {
          streamId,
          stream_id: streamId,
          host,
          port,
        })
          .then(() => {
            isOpened = true;
            t.acknowledgeStream(streamId, true);
            addLog('info', `[Host] Stream #${streamId} connected to ${host}:${port}`);

            // Sequentially flush any chunks received before socket connection was established
            while (pendingQueue.length > 0) {
              const chunk = pendingQueue.shift()!;
              enqueueHostWrite(chunk);
            }
          })
          .catch((err: any) => {
            isFailed = true;
            const errMsg = String(err?.message || err);
            console.error(`[Host] Stream #${streamId} connect failed:`, errMsg);
            addLog('warn', `[Host] Stream #${streamId} connect to ${host}:${port} failed: ${errMsg}`);
            t.acknowledgeStream(streamId, false, errMsg);
            t.closeStream(streamId);
          });

        t.registerStreamListener(streamId, {
          onData: (chunk) => {
            if (isFailed) return;
            if (!isOpened) {
              pendingQueue.push(chunk);
            } else {
              enqueueHostWrite(chunk);
            }
          },
          onClose: () => {
            console.log(`[Host] Stream #${streamId} closed by peer.`);
            addLog('info', `[Host] Stream #${streamId} closed.`);
            writeQueue.finally(() => {
              invoke('host_close_tcp_stream', {
                streamId,
                stream_id: streamId,
              }).catch(() => {});
            });
          },
        });
      } else {
        // Pure Web Fallback
        t.acknowledgeStream(streamId, true);
        addLog('warn', `[Host] Stream #${streamId} requested to ${host}:${port} in pure web mode. Native TCP streaming requires desktop runtime.`);
      }
    };

    signaling.onProgress = (msg) => {
      setSignalingStatusMsg(msg);
      addLog('info', `[Host] ${msg}`);
    };

    try {
      await signaling.connect({ timeoutMs: 5000, maxRetries: 5, concurrentProbes: 2 });
      setIsHostServerRunning(true);
      setIsStartingServer(false);
      setTelemetry((prev) => ({
        ...prev,
        isSignalingConnected: true,
      }));
      tunnel.emitTelemetry();
      addLog('info', `[Host] Host active! Connected to Token Server in room #${targetRoomId}. Accepting incoming peers.`);
    } catch (e: any) {
      console.error('[App] Failed to connect signaling:', e);
      setIsStartingServer(false);
      setIsHostServerRunning(false);
      setTunnelState('error');
      setSignalingStatusMsg(`Failed to connect signaling: ${e?.message || e}`);
      addLog('error', `Failed to connect signaling: ${e?.message || e}`);
    }
  };

  // Client Connect P2P
  const handleClientConnect = async (probeGoogleFn?: (tunnel: P2PWebRTCTunnel) => void) => {
    const trimmed = roomId.trim();
    if (!/^[a-zA-Z0-9-]+$/.test(trimmed)) {
      alert('Please enter a valid room code (letters, numbers, and hyphens) to connect.');
      return;
    }

    handleDisconnect();

    setTunnelState('signaling');
    const initMsg = `Connecting to signaling server (${signalingUrl}) for room #${trimmed} as client...`;
    setSignalingStatusMsg(initMsg);
    addLog('info', initMsg);

    const signaling = new WebSocketSignalingClient({
      workerUrl: signalingUrl,
      roomId: trimmed,
      password,
      role: 'client',
      clientName: 'P2P Client Browser',
    });
    signalingRef.current = signaling;

    signaling.onProgress = (msg) => {
      setSignalingStatusMsg(msg);
      addLog('info', `[Client] ${msg}`);
    };

    const tunnel = new P2PWebRTCTunnel(signaling, 'client');
    tunnelRef.current = tunnel;

    tunnel.onLogEntry = (entry) => {
      addLog(entry.level, `[${entry.category}] ${entry.message}`);
    };

    tunnel.onStateChange = (state, message) => {
      console.log(`[App] Tunnel State -> ${state}: ${message || ''}`);
      setTunnelState(state);
      setTransportType(tunnel.getTransportType());
      if (message) {
        setSignalingStatusMsg(message);
      }
      addLog('info', `Tunnel State: ${state} - ${message || ''}`);

      if (state === 'p2p_connected') {
        if (isTauri()) {
          invoke('set_client_tunnel_mode', { active: true }).catch((err) => {
            console.error('[App] Error activating client SOCKS5 tunnel mode:', err);
          });
        }
        probeGoogleFn?.(tunnel);
      } else if (state === 'closed' || state === 'error' || state === 'idle') {
        if (isTauri()) {
          invoke('set_client_tunnel_mode', { active: false }).catch(() => {});
        }
      }
    };

    tunnel.onTelemetryUpdate = (data) => {
      setTelemetry({ ...data });
    };

    try {
      await signaling.connect({ timeoutMs: 5000, maxRetries: 5, concurrentProbes: 2 });
    } catch (e: any) {
      console.error('[App] Failed to connect signaling:', e);
      setTunnelState('error');
      const errStr = e?.message || String(e);
      setSignalingStatusMsg(`Failed to connect signaling: ${errStr}`);
      addLog('error', `Failed to connect signaling: ${errStr}`);
    }
  };

  // Host Toggle Token Server (disconnect WebSocket signaling without dropping active peers)
  const handleToggleTokenServer = async () => {
    if (!tunnelRef.current) return;
    if (tunnelRef.current.isSignalingConnected()) {
      tunnelRef.current.disconnectSignaling();
      setTelemetry((prev) => ({ ...prev, isSignalingConnected: false }));
      addLog('warn', '[Host] Token server disconnected. Existing P2P client peers maintained.');
    } else {
      addLog('info', '[Host] Reconnecting to Token Server...');
      try {
        await tunnelRef.current.reconnectSignaling();
        setTelemetry((prev) => ({ ...prev, isSignalingConnected: true }));
        tunnelRef.current.emitTelemetry();
        addLog('info', '[Host] Token server reconnected. Ready for new incoming peers.');
      } catch (e: any) {
        addLog('error', `[Host] Token server reconnect failed: ${e?.message || e}`);
      }
    }
  };

  // Host Disconnect specific client peer
  const handleDisconnectPeer = (peerId: string) => {
    if (tunnelRef.current) {
      tunnelRef.current.disconnectPeer(peerId);
      addLog('info', `[Host] Client peer #${peerId} disconnected by host.`);
    }
  };

  // Host Generate Random Room Code
  const handleGenerateRandomRoom = () => {
    const newCode = generateRandomRoomCode();
    setRoomId(newCode);
    addLog('info', `[Host] Generated new random room code: #${newCode}`);
  };

  // Host Client Log Capture Settings
  const [requireClientLogs, setRequireClientLogs] = useState<boolean>(true);

  const handleToggleRequireClientLogs = (enabled: boolean) => {
    setRequireClientLogs(enabled);
    if (tunnelRef.current) {
      tunnelRef.current.setRequireClientLogs(enabled);
      addLog('info', `[Host] Global Client Log Capture requirement set to: ${enabled ? 'ENABLED' : 'DISABLED'}`);
    }
  };

  const handlePushLogConfig = (peerId?: string, enabled = true) => {
    if (tunnelRef.current) {
      const cfgId = tunnelRef.current.pushLogConfigToPeer(peerId, enabled);
      addLog('info', `[Host] Pushed diagnostic configuration [${cfgId}] to ${peerId ? `client #${peerId}` : 'all clients'}`);
    }
  };

  // Host Request Client Diagnostic Logs
  const handleRequestClientLogs = (peerId?: string) => {
    if (tunnelRef.current) {
      tunnelRef.current.requestClientLogs(peerId);
      addLog('info', `[Host] Requested diagnostic logs from ${peerId ? `client #${peerId}` : 'all client peer(s)'}...`);
    }
  };

  return {
    role,
    setRole,
    activeView,
    setActiveView,
    roomId,
    setRoomId,
    password,
    setPassword,
    signalingUrl,
    setSignalingUrl,
    socks5Port,
    setSocks5Port,
    tunnelState,
    signalingStatusMsg,
    isHostServerRunning,
    isStartingServer,
    transportType,
    telemetry,
    eventLogs,
    addLog,
    tunnelRef,
    signalingRef,
    requireClientLogs,
    handleToggleRequireClientLogs,
    handlePushLogConfig,
    handleRoleChange,
    handleUpdateSocks5Port,
    handleDisconnect,
    handleHostCreateServer,
    handleClientConnect,
    handleToggleTokenServer,
    handleDisconnectPeer,
    handleGenerateRandomRoom,
    handleRequestClientLogs,
  };
}
