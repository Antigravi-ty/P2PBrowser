import React from 'react';
import {
  ServerIcon,
  GlobeIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ClockIcon,
  ShieldCheckIcon,
  TerminalIcon,
  SyncIcon,
  GearIcon,
  CheckCircleFillIcon,
  AlertIcon,
  InfoIcon,
  CopyIcon,
  DownloadIcon,
} from '@primer/octicons-react';
import { AppRole, GoogleProbeResult, ServerTelemetry, TunnelState } from '../types/network';
import { copyLogsToClipboard, exportDiagnosticsFile } from '../utils/logger';

interface ServerDashboardProps {
  role?: AppRole;
  roomCode: string;
  fullRoomKey: string;
  telemetry: ServerTelemetry;
  eventLogs?: Array<{ id: string; time: string; level: string; text: string }>;
  isServerActive: boolean;
  isStartingServer: boolean;
  tunnelState?: TunnelState;
  transportType?: string;
  socks5Port?: number;
  signalingUrl?: string;
  googleResult: GoogleProbeResult | null;
  isCheckingGoogle: boolean;
  bypassedGoogle?: boolean;
  onOpenSettings: () => void;
  onGenerateRandomRoom: () => void;
  onCreateServer: (force?: boolean) => void;
  onStopServer: () => void;
  onToggleTokenServer: () => void;
  onDisconnectPeer: (peerId: string) => void;
  onSwitchToBrowser: () => void;
  onRecheckGoogle: () => void;
  onConnectClient?: () => void;
  onRequestContinueWithoutGoogle?: () => void;
  onRequestForceStartServer?: () => void;
  onRequestClientLogs?: (peerId?: string) => void;
  requireClientLogs?: boolean;
  onToggleRequireClientLogs?: (enabled: boolean) => void;
  onPushLogConfig?: (peerId?: string, enabled?: boolean) => void;
}

export const ServerDashboard: React.FC<ServerDashboardProps> = ({
  role = 'host',
  roomCode,
  fullRoomKey,
  telemetry,
  eventLogs = [],
  isServerActive,
  isStartingServer,
  tunnelState = 'idle',
  transportType = 'auto',
  socks5Port = 10808,
  signalingUrl,
  googleResult,
  isCheckingGoogle,
  bypassedGoogle = false,
  onOpenSettings,
  onGenerateRandomRoom,
  onCreateServer,
  onStopServer,
  onToggleTokenServer,
  onDisconnectPeer,
  onSwitchToBrowser,
  onRecheckGoogle,
  onConnectClient,
  onRequestContinueWithoutGoogle,
  onRequestForceStartServer,
  onRequestClientLogs,
  requireClientLogs = true,
  onToggleRequireClientLogs,
  onPushLogConfig,
}) => {
  const [copyLogsStatus, setCopyLogsStatus] = React.useState<string | null>(null);
  const [pushedFeedback, setPushedFeedback] = React.useState<string | null>(null);
  const [logFilterTab, setLogFilterTab] = React.useState<'all' | 'client' | 'host'>('all');
  const commitHash = typeof __APP_COMMIT_HASH__ !== 'undefined' ? __APP_COMMIT_HASH__ : 'dev';

  const handleCopyAllLogs = async () => {
    const res = await copyLogsToClipboard();
    if (res.success) {
      setCopyLogsStatus(`Copied ${res.count} logs!`);
    } else {
      setCopyLogsStatus('Copy failed');
    }
    setTimeout(() => setCopyLogsStatus(null), 2500);
  };

  const handleExportDiagnostics = () => {
    exportDiagnosticsFile({
      role,
      roomCode,
      tunnelState,
      transportType,
      activeClientsCount: telemetry.activeClients.length,
      connectedPeers: telemetry.activeClients.map((c) => ({
        peerId: c.peerId,
        syncedConfigId: c.syncedConfigId,
        bufferedLogsCount: c.bufferedLogsCount,
        transport: c.transportType,
      })),
      totalBytesUp: telemetry.totalBytesUp,
      totalBytesDown: telemetry.totalBytesDown,
    });
  };

  const handlePushConfigWithFeedback = (peerId?: string) => {
    onPushLogConfig?.(peerId, true);
    setPushedFeedback(peerId ? `Pushed to #${peerId}` : 'Filter broadcasted');
    setTimeout(() => setPushedFeedback(null), 2500);
  };

  const clientLogsCount = eventLogs.filter((l) => l.text.includes('[Client #') || l.text.includes('[Client')).length;
  const hostLogsCount = eventLogs.length - clientLogsCount;
  const filteredEventLogs = eventLogs.filter((log) => {
    if (logFilterTab === 'client') return log.text.includes('[Client #') || log.text.includes('[Client');
    if (logFilterTab === 'host') return !log.text.includes('[Client #') && !log.text.includes('[Client');
    return true;
  });

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const isTokenServerOnline = telemetry.isSignalingConnected !== false;
  const isClientConnected = tunnelState === 'ready' || tunnelState === 'p2p_connected';
  const isClientConnecting = tunnelState === 'signaling' || tunnelState === 'ice_gathering';

  return (
    <div
      style={{
        flex: 1,
        padding: '24px',
        overflowY: 'auto',
        backgroundColor: 'var(--bg-canvas)',
        color: 'var(--fg-default)',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* Header status & Controls */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          backgroundColor: 'var(--card-bg)',
          border: '1px solid var(--border-default)',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          gap: '16px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {role === 'host' ? (
            <ServerIcon size={32} fill={isServerActive ? 'var(--color-success)' : 'var(--fg-muted)'} />
          ) : (
            <InfoIcon size={32} fill={isClientConnected ? 'var(--color-success)' : 'var(--fg-muted)'} />
          )}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--fg-default)' }}>
                {role === 'host' ? 'P2P WebRTC Host Server' : 'P2P Client Room Info'}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-accent)',
                  backgroundColor: 'var(--bg-subtle)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  border: '1px solid var(--border-default)',
                }}
                title="Build Commit ID"
              >
                {commitHash}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  backgroundColor:
                    role === 'host'
                      ? isServerActive
                        ? isTokenServerOnline
                          ? 'var(--color-success-bg)'
                          : 'var(--color-warning-bg)'
                        : 'var(--bg-inset)'
                      : isClientConnected
                      ? 'var(--color-success-bg)'
                      : isClientConnecting
                      ? 'var(--color-warning-bg)'
                      : 'var(--bg-inset)',
                  color:
                    role === 'host'
                      ? isServerActive
                        ? isTokenServerOnline
                          ? 'var(--color-success)'
                          : 'var(--color-warning)'
                        : 'var(--fg-muted)'
                      : isClientConnected
                      ? 'var(--color-success)'
                      : isClientConnecting
                      ? 'var(--color-warning)'
                      : 'var(--fg-muted)',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontWeight: 600,
                }}
              >
                {role === 'host'
                  ? isServerActive
                    ? isTokenServerOnline
                      ? 'HOST ACTIVE • LISTENING'
                      : 'HOST ACTIVE • TOKEN SERVER DISCONNECTED'
                    : 'HOST IDLE'
                  : isClientConnected
                  ? 'CLIENT CONNECTED • P2P ACTIVE'
                  : isClientConnecting
                  ? 'CLIENT CONNECTING...'
                  : 'CLIENT DISCONNECTED'}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--fg-muted)', marginTop: '2px' }}>
              Room Code:{' '}
              <strong style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
                #{roomCode || '____'}
              </strong>
              {role === 'host' && isServerActive && (
                <span style={{ marginLeft: '12px' }}>
                  {isTokenServerOnline
                    ? 'Incoming client connections accepted'
                    : 'Token server closed • Existing P2P peers maintained'}
                </span>
              )}
              {role === 'client' && (
                <span style={{ marginLeft: '12px' }}>
                  {isClientConnected
                    ? `Encrypted tunnel active via ${transportType}`
                    : 'Awaiting connection to host'}
                </span>
              )}
            </div>

            {/* Host Global Log Synchronization Option */}
            {role === 'host' && (
              <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    color: 'var(--fg-default)',
                    cursor: 'pointer',
                    backgroundColor: 'var(--bg-subtle)',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-default)',
                  }}
                  title="When enabled, connected clients will automatically sync diagnostic logs with authentic origin timestamps"
                >
                  <input
                    type="checkbox"
                    checked={requireClientLogs}
                    onChange={(e) => onToggleRequireClientLogs?.(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>Require Clients to Sync Diagnostic Logs (要求 Client 上传诊断日志)</span>
                </label>

                {isServerActive && onPushLogConfig && (
                  <button
                    type="button"
                    onClick={() => handlePushConfigWithFeedback()}
                    title="Push current Advanced Settings filter rules to all connected client peers"
                    style={{
                      fontSize: '11px',
                      padding: '3px 8px',
                      backgroundColor: 'transparent',
                      border: '1px solid var(--border-default)',
                      borderRadius: '4px',
                      color: 'var(--color-accent)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <SyncIcon size={11} />
                    <span>Push Settings Filter to Peers</span>
                  </button>
                )}

                {pushedFeedback && (
                  <span style={{ fontSize: '11px', color: 'var(--color-success)', fontWeight: 500 }}>
                    {pushedFeedback}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {role === 'host' && (
            <button
              onClick={onGenerateRandomRoom}
              disabled={isServerActive}
              title={isServerActive ? 'Stop server to change room ID' : 'Generate random 4-digit room code'}
              className="btn-secondary"
              style={{
                borderRadius: '6px',
                padding: '6px 12px',
                color: isServerActive ? 'var(--fg-muted)' : 'var(--fg-default)',
                fontSize: '12px',
                fontWeight: 500,
                cursor: isServerActive ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <SyncIcon size={12} />
              <span>Random</span>
            </button>
          )}

          <button
            onClick={onOpenSettings}
            className="btn-secondary"
            style={{
              borderRadius: '6px',
              padding: '6px 12px',
              color: 'var(--fg-default)',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <GearIcon size={13} />
            <span>Configuration</span>
          </button>

          {role === 'host' ? (
            !isServerActive ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  onClick={() => onCreateServer(false)}
                  disabled={isStartingServer || !roomCode}
                  className="btn-primary"
                  style={{
                    borderRadius: '6px',
                    padding: '6px 16px',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: !roomCode || isStartingServer ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {isStartingServer ? (
                    <>
                      <SyncIcon className="spin" size={12} fill="#ffffff" />
                      <span>Starting...</span>
                    </>
                  ) : (
                    <>
                      <ServerIcon size={12} />
                      <span>Create Server</span>
                    </>
                  )}
                </button>

                {/* Force Start Option if Google failed */}
                {googleResult && !googleResult.success && onRequestForceStartServer && (
                  <button
                    onClick={onRequestForceStartServer}
                    title="Start server and forward traffic even without Google access"
                    className="btn-warning-outline"
                    style={{
                      borderRadius: '6px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Force Start
                  </button>
                )}
              </div>
            ) : (
              <>
                <button
                  onClick={onToggleTokenServer}
                  title={
                    isTokenServerOnline
                      ? 'Disconnect WebSocket Token Server to prevent new connections while keeping current P2P peers'
                      : 'Reconnect to WebSocket Token Server to accept new connections'
                  }
                  className={isTokenServerOnline ? 'btn-secondary' : 'btn-accent'}
                  style={{
                    borderRadius: '6px',
                    padding: '6px 12px',
                    color: isTokenServerOnline ? 'var(--color-warning)' : '#ffffff',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {isTokenServerOnline ? 'Disconnect Token Server' : 'Reconnect Token Server'}
                </button>

                <button
                  onClick={onStopServer}
                  className="btn-danger-solid"
                  style={{
                    borderRadius: '6px',
                    padding: '6px 14px',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Stop Server
                </button>
              </>
            )
          ) : (
            /* Client Mode Action Buttons */
            isClientConnected ? (
              <button
                onClick={onStopServer}
                className="btn-danger-solid"
                style={{
                  borderRadius: '6px',
                  padding: '6px 14px',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Disconnect P2P
              </button>
            ) : (
              <button
                onClick={onConnectClient}
                disabled={isClientConnecting || !roomCode}
                className="btn-primary"
                style={{
                  borderRadius: '6px',
                  padding: '6px 16px',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: !roomCode || isClientConnecting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {isClientConnecting ? (
                  <>
                    <SyncIcon className="spin" size={12} fill="#ffffff" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <GlobeIcon size={12} />
                    <span>Connect P2P</span>
                  </>
                )}
              </button>
            )
          )}

          {/* Switch to Browser Button */}
          <button
            onClick={onSwitchToBrowser}
            className="btn-secondary"
            style={{
              borderRadius: '6px',
              padding: '6px 14px',
              color: 'var(--color-accent)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <GlobeIcon size={13} fill="var(--color-accent)" />
            <span>Open Web Browser</span>
          </button>
        </div>
      </div>

      {/* Google 204 Verification Status Bar */}
      <div
        style={{
          padding: '14px 18px',
          backgroundColor: 'var(--card-bg)',
          border: '1px solid var(--border-default)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: googleResult?.success
                ? 'var(--color-success-bg)'
                : bypassedGoogle
                ? 'rgba(217, 119, 6, 0.15)'
                : 'var(--bg-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isCheckingGoogle ? (
              <SyncIcon className="spin" size={16} fill="var(--color-warning)" />
            ) : googleResult?.success ? (
              <CheckCircleFillIcon size={16} fill="var(--color-success)" />
            ) : bypassedGoogle ? (
              <ShieldCheckIcon size={16} fill="#d97706" />
            ) : (
              <AlertIcon size={16} fill="var(--fg-muted)" />
            )}
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg-default)' }}>
              {isCheckingGoogle
                ? 'Testing Google 204 connectivity (5s timeout)...'
                : googleResult?.success
                ? `Google 204 Verified (${googleResult.latencyMs}ms) • Web Browsing Ready`
                : bypassedGoogle
                ? 'Google Verification Bypassed • Web Browsing Unlocked'
                : googleResult && !googleResult.success
                ? `Google 204 Failed: ${googleResult.message}`
                : 'Awaiting Google Connectivity Test'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--fg-muted)' }}>
              {role === 'host'
                ? 'Transparently forwards outgoing traffic on local proxy or system adapter.'
                : 'Verifies external network accessibility through the P2P WebRTC tunnel.'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* If failed or timeout, provide Continue without Google */}
          {googleResult && !googleResult.success && !bypassedGoogle && onRequestContinueWithoutGoogle && (
            <button
              onClick={onRequestContinueWithoutGoogle}
              className="btn-warning-outline"
              style={{
                borderRadius: '6px',
                padding: '5px 12px',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Continue without Google
            </button>
          )}

          <button
            onClick={onRecheckGoogle}
            disabled={isCheckingGoogle}
            className="btn-secondary"
            style={{
              borderRadius: '6px',
              padding: '5px 12px',
              fontSize: '12px',
              color: 'var(--fg-default)',
              cursor: isCheckingGoogle ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <SyncIcon className={isCheckingGoogle ? 'spin' : ''} size={12} />
            <span>{isCheckingGoogle ? 'Checking...' : 'Test Google (5s)'}</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', flexShrink: 0 }}>
        <div style={{ padding: '16px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-default)', borderRadius: '8px' }}>
          <span style={{ fontSize: '11px', color: 'var(--fg-muted)', display: 'block' }}>
            {role === 'host' ? 'ACTIVE CLIENTS' : 'P2P STATUS'}
          </span>
          <span style={{ fontSize: role === 'host' ? '24px' : '18px', fontWeight: 600, color: 'var(--fg-default)', display: 'block', marginTop: '4px' }}>
            {role === 'host'
              ? telemetry.activeClients.length
              : isClientConnected
              ? 'Connected'
              : isClientConnecting
              ? 'Connecting'
              : 'Disconnected'}
          </span>
        </div>

        <div style={{ padding: '16px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-default)', borderRadius: '8px' }}>
          <span style={{ fontSize: '11px', color: 'var(--fg-muted)', display: 'block' }}>CONCURRENT STREAMS</span>
          <span style={{ fontSize: '24px', fontWeight: 600, color: 'var(--color-accent)', display: 'block', marginTop: '4px' }}>
            {telemetry.activeStreams.length}
          </span>
        </div>

        <div style={{ padding: '16px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-default)', borderRadius: '8px' }}>
          <span style={{ fontSize: '11px', color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ArrowUpIcon size={12} fill="var(--color-success)" /> UPLOADED
          </span>
          <span style={{ fontSize: '24px', fontWeight: 600, color: 'var(--fg-default)', display: 'block', marginTop: '4px' }}>
            {formatBytes(telemetry.totalBytesUp)}
          </span>
        </div>

        <div style={{ padding: '16px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-default)', borderRadius: '8px' }}>
          <span style={{ fontSize: '11px', color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ArrowDownIcon size={12} fill="var(--color-accent)" /> DOWNLOADED
          </span>
          <span style={{ fontSize: '24px', fontWeight: 600, color: 'var(--fg-default)', display: 'block', marginTop: '4px' }}>
            {formatBytes(telemetry.totalBytesDown)}
          </span>
        </div>
      </div>

      {/* Connected Peers or Client Room Connection Details */}
      {role === 'host' ? (
        <div
          style={{
            backgroundColor: 'var(--card-bg)',
            border: '1px solid var(--border-default)',
            borderRadius: '8px',
            overflow: 'hidden',
            minHeight: '200px',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border-default)',
              backgroundColor: 'var(--bg-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg-default)' }}>
              Connected WebRTC Peers ({telemetry.activeClients.length})
            </span>
            {!isTokenServerOnline && (
              <span style={{ fontSize: '11px', color: 'var(--color-warning)', fontWeight: 500 }}>
                Token server disconnected • Existing peers retained
              </span>
            )}
          </div>
          {telemetry.activeClients.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--fg-muted)', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ display: 'inline-block', marginBottom: '8px' }}>
                <GlobeIcon size={24} fill="var(--fg-muted)" />
              </span>
              <div style={{ fontSize: '13px' }}>
                {isServerActive ? `Waiting for clients to join room #${roomCode}...` : 'Server is offline. Click Create Server to start listening.'}
              </div>
              {isServerActive && (
                <div style={{ fontSize: '11px', color: 'var(--fg-muted)', marginTop: '4px' }}>
                  Full signaling key: <code>{fullRoomKey}</code>
                </div>
              )}
            </div>
          ) : (
            <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '280px', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-default)', color: 'var(--fg-muted)' }}>
                    <th style={{ padding: '10px 16px' }}>Peer ID</th>
                    <th style={{ padding: '10px 16px' }}>Device / Name</th>
                    <th style={{ padding: '10px 16px' }}>Transport</th>
                    <th style={{ padding: '10px 16px' }}>RTT</th>
                    <th style={{ padding: '10px 16px' }}>Streams</th>
                    <th style={{ padding: '10px 16px' }}>Transferred</th>
                    <th style={{ padding: '10px 16px' }}>Diagnostic Sync</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {telemetry.activeClients.map((client) => (
                    <tr key={client.peerId} style={{ borderBottom: '1px solid var(--border-default)' }}>
                      <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', color: 'var(--color-accent)' }}>
                        {client.peerId}
                      </td>
                      <td style={{ padding: '10px 16px' }}>{client.name}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontSize: '11px', background: 'var(--color-accent-bg)', color: 'var(--color-accent)', padding: '2px 6px', borderRadius: '4px' }}>
                          {client.transportType}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', color: 'var(--color-success)' }}>{client.rttMs}ms</td>
                      <td style={{ padding: '10px 16px' }}>{client.activeStreamsCount}</td>
                      <td style={{ padding: '10px 16px' }}>
                        ↑ {formatBytes(client.bytesUploaded)} / ↓ {formatBytes(client.bytesDownloaded)}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        {client.syncedConfigId ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--color-success)', fontWeight: 600 }}>
                              Synced: <code style={{ fontFamily: 'var(--font-mono)' }}>{client.syncedConfigId}</code>
                            </span>
                            {client.bufferedLogsCount !== undefined && (
                              <span style={{ fontSize: '10px', color: 'var(--fg-muted)' }}>
                                {client.bufferedLogsCount} logs in peer buffer
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: '11px', color: 'var(--color-warning)' }}>
                            Pending Sync
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                          {onRequestClientLogs && (
                            <button
                              onClick={() => onRequestClientLogs(client.peerId)}
                              title={`Pull recent diagnostic logs from client #${client.peerId}`}
                              style={{
                                backgroundColor: 'var(--bg-subtle)',
                                border: '1px solid var(--border-default)',
                                borderRadius: '4px',
                                color: 'var(--color-accent)',
                                padding: '4px 8px',
                                fontSize: '11px',
                                fontWeight: 500,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <DownloadIcon size={11} />
                              <span>Pull</span>
                            </button>
                          )}
                          {onPushLogConfig && (
                            <button
                              onClick={() => handlePushConfigWithFeedback(client.peerId)}
                              title={`Push current filter settings to client #${client.peerId}`}
                              style={{
                                backgroundColor: 'var(--bg-subtle)',
                                border: '1px solid var(--border-default)',
                                borderRadius: '4px',
                                color: 'var(--fg-default)',
                                padding: '4px 8px',
                                fontSize: '11px',
                                fontWeight: 500,
                                cursor: 'pointer',
                              }}
                            >
                              Push
                            </button>
                          )}
                          <button
                            onClick={() => onDisconnectPeer(client.peerId)}
                            title="Disconnect this specific peer"
                            style={{
                              backgroundColor: 'rgba(218, 54, 51, 0.1)',
                              border: '1px solid var(--color-danger)',
                              borderRadius: '4px',
                              color: 'var(--color-danger)',
                              padding: '4px 10px',
                              fontSize: '11px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Disconnect
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* Client Mode: Room Connection Details Card */
        <div
          style={{
            backgroundColor: 'var(--card-bg)',
            border: '1px solid var(--border-default)',
            borderRadius: '8px',
            overflow: 'hidden',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg-default)' }}>
              P2P Tunnel & Host Connection Info
            </span>
            <span
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '4px',
                backgroundColor: isClientConnected ? 'var(--color-success-bg)' : 'var(--bg-inset)',
                color: isClientConnected ? 'var(--color-success)' : 'var(--fg-muted)',
                fontWeight: 600,
              }}
            >
              {isClientConnected ? 'Handshake Established' : 'Not Connected'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', fontSize: '12px' }}>
            <div style={{ padding: '10px', backgroundColor: 'var(--bg-subtle)', borderRadius: '6px' }}>
              <span style={{ color: 'var(--fg-muted)', display: 'block' }}>Target Room</span>
              <span style={{ fontWeight: 600, color: 'var(--color-accent)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
                #{roomCode || 'None'}
              </span>
            </div>
            <div style={{ padding: '10px', backgroundColor: 'var(--bg-subtle)', borderRadius: '6px' }}>
              <span style={{ color: 'var(--fg-muted)', display: 'block' }}>Transport Channel</span>
              <span style={{ fontWeight: 600, color: 'var(--fg-default)' }}>
                {transportType ? `WebRTC (${transportType})` : 'Direct / Relay'}
              </span>
            </div>
            <div style={{ padding: '10px', backgroundColor: 'var(--bg-subtle)', borderRadius: '6px' }}>
              <span style={{ color: 'var(--fg-muted)', display: 'block' }}>Local SOCKS5 Bridge</span>
              <span style={{ fontWeight: 600, color: 'var(--fg-default)', fontFamily: 'var(--font-mono)' }}>
                127.0.0.1:{socks5Port}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Live Stream Destinations Monitor */}
      <div
        style={{
          backgroundColor: 'var(--card-bg)',
          border: '1px solid var(--border-default)',
          borderRadius: '8px',
          overflow: 'hidden',
          minHeight: '200px',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-default)', backgroundColor: 'var(--bg-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg-default)' }}>Live SOCKS5 / TCP Traffic Destinations</span>
          <span style={{ fontSize: '11px', background: 'var(--color-accent-bg)', color: 'var(--color-accent)', padding: '2px 8px', borderRadius: '10px' }}>
            {telemetry.activeStreams.length} Active
          </span>
        </div>
        {telemetry.activeStreams.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--fg-muted)', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ display: 'inline-block', marginBottom: '8px' }}>
              <ClockIcon size={24} fill="var(--fg-muted)" />
            </span>
            <div style={{ fontSize: '13px' }}>No active streams</div>
            <div style={{ fontSize: '11px', color: 'var(--fg-muted)', marginTop: '4px' }}>
              When connected peers browse or probe connectivity, destinations will appear here in real time.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '280px', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-default)', color: 'var(--fg-muted)' }}>
                  <th style={{ padding: '10px 16px' }}>Stream #</th>
                  <th style={{ padding: '10px 16px' }}>Destination</th>
                  <th style={{ padding: '10px 16px' }}>Port</th>
                  <th style={{ padding: '10px 16px' }}>Protocol</th>
                  <th style={{ padding: '10px 16px' }}>Sent / Recv</th>
                  <th style={{ padding: '10px 16px' }}>Duration</th>
                </tr>
              </thead>
              <tbody>
                {telemetry.activeStreams.map((stream) => (
                  <tr key={stream.streamId} style={{ borderBottom: '1px solid var(--border-default)' }}>
                    <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)' }}>#{stream.streamId}</td>
                    <td style={{ padding: '10px 16px', fontWeight: 500, color: 'var(--color-accent)' }}>
                      {stream.targetHost}
                    </td>
                    <td style={{ padding: '10px 16px' }}>{stream.targetPort}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          background: stream.targetPort === 443 ? 'var(--color-success-bg)' : 'var(--bg-subtle)',
                          color: stream.targetPort === 443 ? 'var(--color-success)' : 'var(--fg-default)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        {stream.protocol}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      {formatBytes(stream.bytesSent)} / {formatBytes(stream.bytesReceived)}
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--fg-muted)' }}>
                      {Math.round(stream.durationMs / 1000)}s
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Real-time Handshake & Telemetry Log Inspector */}
      {eventLogs.length > 0 && (
        <div
          style={{
            backgroundColor: 'var(--card-bg)',
            border: '1px solid var(--border-default)',
            borderRadius: '8px',
            overflow: 'hidden',
            minHeight: '160px',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-default)', backgroundColor: 'var(--bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TerminalIcon size={16} fill="var(--color-accent)" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg-default)' }}>Live Relay & Diagnostic Event Inspector</span>

              {/* Log Category Filter Tabs */}
              <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-canvas)', borderRadius: '6px', padding: '2px', border: '1px solid var(--border-default)', marginLeft: '8px' }}>
                <button
                  type="button"
                  onClick={() => setLogFilterTab('all')}
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    border: 'none',
                    backgroundColor: logFilterTab === 'all' ? 'var(--color-accent)' : 'transparent',
                    color: logFilterTab === 'all' ? '#ffffff' : 'var(--fg-muted)',
                    cursor: 'pointer',
                    fontWeight: logFilterTab === 'all' ? 600 : 400,
                  }}
                >
                  All ({eventLogs.length})
                </button>
                <button
                  type="button"
                  onClick={() => setLogFilterTab('client')}
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    border: 'none',
                    backgroundColor: logFilterTab === 'client' ? 'var(--color-accent)' : 'transparent',
                    color: logFilterTab === 'client' ? '#ffffff' : 'var(--fg-muted)',
                    cursor: 'pointer',
                    fontWeight: logFilterTab === 'client' ? 600 : 400,
                  }}
                >
                  Client Logs ({clientLogsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setLogFilterTab('host')}
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    border: 'none',
                    backgroundColor: logFilterTab === 'host' ? 'var(--color-accent)' : 'transparent',
                    color: logFilterTab === 'host' ? '#ffffff' : 'var(--fg-muted)',
                    cursor: 'pointer',
                    fontWeight: logFilterTab === 'host' ? 600 : 400,
                  }}
                >
                  Host Events ({hostLogsCount})
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {role === 'host' && onRequestClientLogs && telemetry.activeClients.length > 0 && (
                <button
                  type="button"
                  onClick={() => onRequestClientLogs()}
                  title="Request diagnostic log sync from all connected clients with client timestamps"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 500,
                    backgroundColor: 'var(--bg-canvas)',
                    color: 'var(--color-accent)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  <DownloadIcon size={12} />
                  <span>Pull Client Logs</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleExportDiagnostics}
                title="Download full diagnostics log file (.log) with client origin timestamps and system info"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 500,
                  backgroundColor: 'var(--bg-canvas)',
                  color: 'var(--color-accent)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                <DownloadIcon size={12} />
                <span>Export Diagnostics (.log)</span>
              </button>

              <button
                type="button"
                onClick={handleCopyAllLogs}
                title="Copy all logs with origin timestamps to clipboard"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 500,
                  backgroundColor: 'var(--bg-canvas)',
                  color: 'var(--fg-default)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                <CopyIcon size={12} />
                <span>{copyLogsStatus || 'Copy All'}</span>
              </button>
            </div>
          </div>

          <div style={{ padding: '4px 16px', fontSize: '11px', color: 'var(--fg-muted)', backgroundColor: 'var(--bg-canvas)', borderBottom: '1px solid var(--border-default)' }}>
            Logs received from connected clients preserve authentic client timestamps. Click 'Export Diagnostics (.log)' to save as a local file.
          </div>

          <div style={{ maxHeight: '220px', overflowY: 'auto', padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: '11px', backgroundColor: 'var(--bg-subtle)', flex: 1 }}>
            {filteredEventLogs.length === 0 ? (
              <div style={{ color: 'var(--fg-muted)', fontStyle: 'italic', padding: '8px 0' }}>
                No {logFilterTab === 'client' ? 'client diagnostic logs' : logFilterTab === 'host' ? 'host relay events' : 'logs'} recorded yet.
              </div>
            ) : (
              filteredEventLogs.map((log) => {
                const isClient = log.text.includes('[Client #') || log.text.includes('[Client');
                return (
                  <div key={log.id} style={{ marginBottom: '4px', display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                    <span style={{ color: 'var(--fg-muted)' }}>[{log.time}]</span>
                    {isClient && (
                      <span style={{ backgroundColor: 'rgba(56, 139, 253, 0.15)', color: 'var(--color-accent)', padding: '1px 5px', borderRadius: '3px', fontSize: '10px' }}>
                        CLIENT
                      </span>
                    )}
                    <span style={{ color: log.level === 'error' ? 'var(--color-danger)' : log.level === 'warn' ? 'var(--color-warning)' : 'var(--color-accent)' }}>
                      [{log.level.toUpperCase()}]
                    </span>
                    <span style={{ color: 'var(--fg-default)' }}>{log.text}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
