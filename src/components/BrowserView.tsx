import React, { useEffect, useRef, useCallback } from 'react';
import {
  GlobeIcon,
  ShieldCheckIcon,
  CheckCircleFillIcon,
  SyncIcon,
  AlertIcon,
  LinkExternalIcon,
} from '@primer/octicons-react';
import { AppRole, BrowserTab, GoogleProbeResult, TunnelState, DownloadTask } from '../types/network';
import { tabWebviewManager } from '../network/TabWebviewManager';
import { SettingsView } from './SettingsView';
import { DownloadsView } from './DownloadsView';

interface BrowserViewProps {
  activeTab: BrowserTab;
  tunnelState: TunnelState;
  roomCode: string;
  googleResult: GoogleProbeResult | null;
  isCheckingGoogle: boolean;
  bypassedGoogle?: boolean;
  onConnectRoom: () => void;
  onCancelConnect?: () => void;
  onNavigate: (url: string) => void;
  onRecheckGoogle: () => void;
  onRequestContinueWithoutGoogle: () => void;
  role?: AppRole;
  onRoleChange?: (role: AppRole) => void;
  onRoomCodeChange?: (code: string) => void;
  onOpenDashboard?: () => void;
  signalingProgress?: string;
  isSignalingConnected?: boolean;
  password?: string;
  onPasswordChange?: (p: string) => void;
  signalingUrl?: string;
  onSignalingUrlChange?: (u: string) => void;
  socks5Port?: number;
  onSocks5PortChange?: (port: number) => void;
  downloadTasks?: DownloadTask[];
  onStartDownload?: (url: string) => void;
  onCancelDownload?: (id: string) => void;
  onRetryDownload?: (id: string) => void;
  onRemoveDownloadTask?: (id: string) => void;
  onClearCompletedDownloads?: () => void;
  onOpenFile?: (path?: string) => void;
  onShowInFolder?: (path?: string) => void;
  onNewTabWithUrl?: (url: string) => void;
}

export const BrowserView: React.FC<BrowserViewProps> = ({
  activeTab,
  tunnelState,
  roomCode,
  googleResult,
  isCheckingGoogle,
  bypassedGoogle = false,
  onConnectRoom,
  onCancelConnect,
  onNavigate,
  onNewTabWithUrl,
  onRecheckGoogle,
  onRequestContinueWithoutGoogle,
  role = 'client',
  onRoleChange,
  onRoomCodeChange,
  onOpenDashboard,
  signalingProgress,
  isSignalingConnected = false,
  password,
  onPasswordChange,
  signalingUrl,
  onSignalingUrlChange,
  socks5Port,
  onSocks5PortChange,
  downloadTasks = [],
  onStartDownload,
  onCancelDownload,
  onRetryDownload,
  onRemoveDownloadTask,
  onClearCompletedDownloads,
  onOpenFile,
  onShowInFolder,
}) => {
  const webviewViewportRef = useRef<HTMLDivElement>(null);
  const isRoomCodeValid = /^[a-zA-Z0-9-]+$/.test((roomCode || '').trim());
  const isClientReadyToBrowse =
    Boolean(googleResult?.success) ||
    bypassedGoogle ||
    (isRoomCodeValid &&
      (tunnelState === 'ready' || tunnelState === 'p2p_connected'));
  const isReadyToBrowse =
    role === 'host'
      ? Boolean(googleResult?.success) || bypassedGoogle
      : isClientReadyToBrowse;
  const isConnecting = tunnelState === 'signaling' || tunnelState === 'ice_gathering';

  // Fast bookmarks
  const quickLinks = [
    { title: 'Google', url: 'https://www.google.com', icon: '🔍' },
    { title: 'GitHub', url: 'https://github.com', icon: '🐙' },
    { title: 'YouTube', url: 'https://www.youtube.com', icon: '▶️' },
    { title: 'Cloudflare', url: 'https://www.cloudflare.com', icon: '☁️' },
    { title: 'IP / Proxy Check', url: 'https://ip.sb', icon: '🌐' },
  ];

  // Synchronize native child webview bounds and tab selection
  const updateWebviewBounds = useCallback((shouldFocus = false) => {
    if (!tabWebviewManager.isTauriRuntime || !isReadyToBrowse || tabWebviewManager.isOverlayOpen) return;
    if (activeTab.url === 'about:blank' || activeTab.url.startsWith('p2p://')) {
      console.log('[WebviewLayout] Tab is internal page: child webview hidden; rendering React DOM.');
      tabWebviewManager.hideAll();
      return;
    }

    const el = webviewViewportRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      console.log(
        '[WebviewLayout] Viewport measurement: ' +
          JSON.stringify({
            tabId: activeTab.id,
            url: activeTab.url,
            rect: {
              left: Math.round(rect.left),
              top: Math.round(rect.top),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              right: Math.round(rect.right),
              bottom: Math.round(rect.bottom),
            },
            windowInner: {
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
            },
            devicePixelRatio: window.devicePixelRatio,
          })
      );

      tabWebviewManager.switchTab(
        activeTab.id,
        activeTab.url,
        {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        shouldFocus
      );
    }
  }, [activeTab.id, activeTab.url, isReadyToBrowse]);

  // When tab ID or target URL changes
  useEffect(() => {
    if (!isReadyToBrowse) {
      if (tabWebviewManager.isTauriRuntime) {
        tabWebviewManager.hideAll();
      }
      return;
    }
    updateWebviewBounds(false);
    const rafId = requestAnimationFrame(() => {
      updateWebviewBounds(false);
    });
    return () => cancelAnimationFrame(rafId);
  }, [activeTab.id, activeTab.url, isReadyToBrowse, updateWebviewBounds]);

  // ResizeObserver on the dedicated viewport element to keep bounds strictly aligned
  useEffect(() => {
    const el = webviewViewportRef.current;
    if (!el || !isReadyToBrowse) return;

    let rafId: number | null = null;
    const scheduleUpdate = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        updateWebviewBounds(false);
      });
    };

    const observer = new ResizeObserver(() => {
      scheduleUpdate();
    });
    observer.observe(el);

    const handleWindowResize = () => {
      scheduleUpdate();
      setTimeout(scheduleUpdate, 100);
      setTimeout(scheduleUpdate, 300);
    };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [isReadyToBrowse, updateWebviewBounds]);

  // Clean up native webviews when BrowserView unmounts
  useEffect(() => {
    return () => {
      if (tabWebviewManager.isTauriRuntime) {
        tabWebviewManager.hideAll();
      }
    };
  }, []);

  if (activeTab.url === 'p2p://settings') {
    tabWebviewManager.hideAll();
    return (
      <SettingsView
        role={role}
        onRoleChange={onRoleChange || (() => {})}
        roomId={roomCode}
        onRoomIdChange={onRoomCodeChange || (() => {})}
        password={password || ''}
        onPasswordChange={onPasswordChange || (() => {})}
        signalingUrl={signalingUrl || ''}
        onSignalingUrlChange={onSignalingUrlChange || (() => {})}
        socks5Port={socks5Port || 10808}
        onSocks5PortChange={onSocks5PortChange || (() => {})}
        isConnected={tunnelState === 'ready' || tunnelState === 'p2p_connected'}
        isConnecting={tunnelState === 'signaling' || tunnelState === 'ice_gathering'}
        onConnect={onConnectRoom}
        onDisconnect={onCancelConnect || (() => {})}
        tunnelState={tunnelState}
        googleLatency={googleResult?.latencyMs ?? null}
        bypassedGoogle={bypassedGoogle}
      />
    );
  }

  if (activeTab.url === 'p2p://downloads') {
    tabWebviewManager.hideAll();
    return (
      <DownloadsView
        tasks={downloadTasks}
        onStartDownload={onStartDownload || (() => {})}
        onCancelDownload={onCancelDownload || (() => {})}
        onRetryDownload={onRetryDownload || (() => {})}
        onRemoveTask={onRemoveDownloadTask || (() => {})}
        onClearCompleted={onClearCompletedDownloads || (() => {})}
        onOpenFile={onOpenFile || (() => {})}
        onShowInFolder={onShowInFolder || (() => {})}
      />
    );
  }

  if (!isReadyToBrowse) {
    if (role === 'host') {
      return (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px',
            backgroundColor: 'var(--bg-canvas)',
            color: 'var(--fg-default)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              maxWidth: '520px',
              width: '100%',
              padding: '32px',
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--border-default)',
              borderRadius: '12px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-accent-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ShieldCheckIcon size={32} fill="var(--color-accent)" />
              </div>
            </div>

            <div>
              <span style={{ fontSize: '18px', fontWeight: 600, display: 'block', color: 'var(--fg-default)' }}>
                Host Server • Browsing Mode
              </span>
              <span style={{ fontSize: '13px', color: 'var(--fg-muted)', marginTop: '4px', display: 'block' }}>
                To browse web pages in Host mode, verify Google 204 connectivity (local proxy / adapter) or continue without Google.
              </span>
            </div>

            <div
              style={{
                padding: '16px',
                backgroundColor: 'var(--bg-subtle)',
                border: '1px solid var(--border-default)',
                borderRadius: '8px',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {isCheckingGoogle ? (
                  <SyncIcon className="spin" size={16} fill="var(--color-warning)" />
                ) : googleResult && !googleResult.success ? (
                  <AlertIcon size={16} fill="var(--color-danger)" />
                ) : (
                  <ShieldCheckIcon size={16} fill="var(--color-accent)" />
                )}
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--fg-default)' }}>
                  {isCheckingGoogle
                    ? 'Probing Google 204 (5s timeout)...'
                    : googleResult && !googleResult.success
                    ? `Google Check Failed: ${googleResult.message}`
                    : 'Google Verification Pre-flight'}
                </span>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--fg-muted)', lineHeight: 1.4 }}>
                {googleResult && !googleResult.success
                  ? 'The Google check failed or timed out. You may continue without Google verification to browse directly or through your local proxy.'
                  : 'Google 204 verification ensures your network can resolve and reach global destinations.'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                onClick={onRecheckGoogle}
                disabled={isCheckingGoogle}
                style={{
                  width: '100%',
                  backgroundColor: 'var(--btn-primary-bg)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '10px 16px',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: isCheckingGoogle ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <SyncIcon className={isCheckingGoogle ? 'spin' : ''} size={14} />
                <span>{isCheckingGoogle ? 'Testing Google (5s timeout)...' : 'Test Google (5s timeout)'}</span>
              </button>

              {/* Continue without Google Option */}
              <button
                onClick={onRequestContinueWithoutGoogle}
                style={{
                  width: '100%',
                  backgroundColor: 'var(--bg-subtle)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '6px',
                  padding: '9px 16px',
                  color: '#d97706',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <span>Continue without Google</span>
              </button>

              {onOpenDashboard && (
                <button
                  onClick={onOpenDashboard}
                  style={{
                    width: '100%',
                    backgroundColor: 'transparent',
                    border: '1px solid var(--border-default)',
                    borderRadius: '6px',
                    padding: '8px 16px',
                    color: 'var(--fg-default)',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Go to Server Dashboard
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px',
          backgroundColor: 'var(--bg-canvas)',
          color: 'var(--fg-default)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            maxWidth: '520px',
            width: '100%',
            padding: '32px',
            backgroundColor: 'var(--card-bg)',
            border: '1px solid var(--border-default)',
            borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-accent-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ShieldCheckIcon size={32} fill="var(--color-accent)" />
            </div>
          </div>

          <div>
            <span style={{ fontSize: '18px', fontWeight: 600, display: 'block', color: 'var(--fg-default)' }}>
              P2P WebRTC Proxy Browser
            </span>
            <span style={{ fontSize: '13px', color: 'var(--fg-muted)', marginTop: '4px', display: 'block' }}>
              Encrypted, zero-privilege P2P SOCKS5 tunnel with universal proxy relay.
            </span>
          </div>

          {/* Connection status steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left', margin: '8px 0' }}>
            {/* Step 1: Room ID Input */}
            <div
              style={{
                padding: '12px',
                backgroundColor: 'var(--bg-subtle)',
                border: '1px solid var(--border-default)',
                borderRadius: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {isRoomCodeValid ? (
                    <CheckCircleFillIcon size={16} fill="var(--color-success)" />
                  ) : (
                    <AlertIcon size={16} fill="var(--color-warning)" />
                  )}
                  <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--fg-default)' }}>
                    1. Room Pairing: {isRoomCodeValid ? `#${roomCode}` : 'Enter Room ID'}
                  </span>
                </div>
                {isRoomCodeValid && (
                  <span style={{ fontSize: '11px', color: 'var(--color-success)', fontWeight: 600 }}>✓ Verified</span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--fg-muted)', fontWeight: 600 }}>#</span>
                <input
                  type="text"
                  autoComplete="off"
                  value={roomCode}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/[^a-zA-Z0-9-]/g, '');
                    onRoomCodeChange?.(cleaned);
                  }}
                  disabled={isConnecting || isClientReadyToBrowse}
                  placeholder="0000"
                  style={{
                    minWidth: '120px',
                    maxWidth: '220px',
                    padding: '6px 10px',
                    backgroundColor: 'var(--bg-canvas)',
                    border: isRoomCodeValid ? '1px solid var(--color-success)' : '1px solid var(--border-default)',
                    borderRadius: '6px',
                    color: 'var(--fg-default)',
                    fontSize: '15px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    letterSpacing: '1px',
                    textAlign: 'center',
                    outline: 'none',
                  }}
                />
                <span style={{ fontSize: '11px', color: 'var(--fg-muted)' }}>
                  {isRoomCodeValid ? 'Room ID entered' : 'Input room code (e.g. 0000 or custom room)'}
                </span>
              </div>
            </div>

            {/* Step 2: Signaling Server Channel (5s Timeout & Concurrent Race Probing) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px',
                backgroundColor: 'var(--bg-subtle)',
                border: '1px solid var(--border-default)',
                borderRadius: '6px',
              }}
            >
              {isSignalingConnected || tunnelState === 'ice_gathering' || tunnelState === 'p2p_connected' || tunnelState === 'ready' ? (
                <CheckCircleFillIcon size={16} fill="var(--color-success)" />
              ) : isConnecting ? (
                <SyncIcon className="spin" size={16} fill="var(--color-accent)" />
              ) : tunnelState === 'error' ? (
                <AlertIcon size={16} fill="var(--color-danger)" />
              ) : (
                <AlertIcon size={16} fill="var(--fg-muted)" />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--fg-default)' }}>
                  2. Signaling Server Channel
                </div>
                <div style={{ fontSize: '11px', color: 'var(--fg-muted)' }}>
                  {isSignalingConnected || tunnelState === 'ice_gathering' || tunnelState === 'p2p_connected' || tunnelState === 'ready'
                    ? 'Connected to signaling token server (Room joined)'
                    : tunnelState === 'signaling'
                    ? signalingProgress || 'Connecting signaling server (5s timeout, fast race probing)...'
                    : tunnelState === 'error'
                    ? signalingProgress || 'Signaling connection failed or timed out'
                    : 'Awaiting room connection'}
                </div>
              </div>
            </div>

            {/* Step 3: WebRTC P2P DataChannel */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px',
                backgroundColor: 'var(--bg-subtle)',
                border: '1px solid var(--border-default)',
                borderRadius: '6px',
              }}
            >
              {tunnelState === 'p2p_connected' || tunnelState === 'ready' ? (
                <CheckCircleFillIcon size={16} fill="var(--color-success)" />
              ) : tunnelState === 'ice_gathering' ? (
                <SyncIcon className="spin" size={16} fill="var(--color-accent)" />
              ) : (
                <AlertIcon size={16} fill="var(--fg-muted)" />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--fg-default)' }}>
                  3. WebRTC P2P Negotiation & DataChannel
                </div>
                <div style={{ fontSize: '11px', color: 'var(--fg-muted)' }}>
                  {tunnelState === 'p2p_connected' || tunnelState === 'ready'
                    ? 'Encrypted P2P DataChannel connected & ready for proxying'
                    : tunnelState === 'ice_gathering'
                    ? 'Exchanging SDP & gathering ICE candidates (ICE-TCP / STUN)...'
                    : isSignalingConnected || tunnelState === 'signaling'
                    ? 'Waiting for peer in room to initiate WebRTC handshake...'
                    : 'Awaiting signaling readiness'}
                </div>
              </div>
            </div>

            {/* Step 4: Google 204 Check (5s timeout) */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                padding: '12px',
                backgroundColor: 'var(--bg-subtle)',
                border: '1px solid var(--border-default)',
                borderRadius: '6px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {googleResult?.success ? (
                    <CheckCircleFillIcon size={16} fill="var(--color-success)" />
                  ) : isCheckingGoogle ? (
                    <SyncIcon className="spin" size={16} fill="var(--color-warning)" />
                  ) : googleResult && !googleResult.success ? (
                    <AlertIcon size={16} fill="var(--color-danger)" />
                  ) : (
                    <AlertIcon size={16} fill="var(--fg-muted)" />
                  )}
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--fg-default)' }}>
                      4. Google 204 Connectivity Check
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--fg-muted)' }}>
                      {googleResult?.success
                        ? `Verified (${googleResult.latencyMs}ms)`
                        : isCheckingGoogle
                        ? 'Probing Google 204 (5s timeout)...'
                        : googleResult && !googleResult.success
                        ? `Failed: ${googleResult.message}`
                        : 'Verifies external internet connectivity'}
                    </div>
                  </div>
                </div>

                <button
                  onClick={onRecheckGoogle}
                  disabled={isCheckingGoogle}
                  style={{
                    backgroundColor: 'var(--bg-canvas)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '4px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 500,
                    color: 'var(--color-accent)',
                    cursor: isCheckingGoogle ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <SyncIcon className={isCheckingGoogle ? 'spin' : ''} size={11} />
                  <span>{isCheckingGoogle ? 'Testing...' : 'Test Google (5s)'}</span>
                </button>
              </div>

              {/* If Google check failed or timed out: show "Continue without Google" button */}
              {googleResult && !googleResult.success && !isCheckingGoogle && (
                <div
                  style={{
                    marginTop: '4px',
                    padding: '8px 10px',
                    backgroundColor: 'rgba(217, 119, 6, 0.08)',
                    border: '1px solid rgba(217, 119, 6, 0.3)',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: '11px', color: '#d97706' }}>
                    Google test failed. You can bypass this check to proceed.
                  </span>
                  <button
                    onClick={onRequestContinueWithoutGoogle}
                    style={{
                      backgroundColor: '#d97706',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: '#ffffff',
                      cursor: 'pointer',
                    }}
                  >
                    Continue without Google
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Action button with explicit waiting feedback */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              onClick={onConnectRoom}
              disabled={!isRoomCodeValid || isConnecting}
              style={{
                width: '100%',
                backgroundColor: !isRoomCodeValid || isConnecting ? 'var(--bg-inset)' : 'var(--btn-primary-bg)',
                border: !isRoomCodeValid || isConnecting ? '1px solid var(--border-default)' : 'none',
                borderRadius: '6px',
                padding: '10px 16px',
                color: !isRoomCodeValid || isConnecting ? 'var(--fg-muted)' : '#ffffff',
                fontSize: '14px',
                fontWeight: 600,
                cursor: !isRoomCodeValid || isConnecting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s ease',
              }}
            >
              {isConnecting ? (
                <>
                  <SyncIcon className="spin" size={16} fill="var(--color-accent)" />
                  <span>
                    {tunnelState === 'signaling'
                      ? `Connecting to Room #${roomCode}... (Waiting for signaling)`
                      : 'Establishing P2P Handshake... (Gathering ICE)'}
                  </span>
                </>
              ) : (
                <span>{isRoomCodeValid ? 'Connect to Room #' + roomCode : 'Enter Room Code to Connect'}</span>
              )}
            </button>

            {isConnecting && onCancelConnect && (
              <button
                onClick={onCancelConnect}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-danger)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                Cancel Connection
              </button>
            )}

            {/* If user wants to browse without connecting to a room or Google test failed */}
            <button
              onClick={onRequestContinueWithoutGoogle}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--fg-muted)',
                fontSize: '12px',
                cursor: 'pointer',
                padding: '4px',
                textDecoration: 'underline',
              }}
            >
              Continue without Google Verification
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Active Browsing View
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-canvas)',
        color: 'var(--fg-default)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Google Latency Warning Banner on new tab / about:blank while checking */}
      {isCheckingGoogle && activeTab.url === 'about:blank' && (
        <div
          style={{
            padding: '8px 16px',
            backgroundColor: 'var(--bg-subtle)',
            borderBottom: '1px solid var(--border-default)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <SyncIcon className="spin" size={14} fill="var(--color-accent)" />
            <span style={{ fontSize: '12px', color: 'var(--fg-default)' }}>Verifying Google.com connectivity (5s timeout)...</span>
          </div>
          <button
            onClick={onRecheckGoogle}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--fg-muted)',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Re-probe
          </button>
        </div>
      )}

      {/* Main Browser View Area */}
      {tabWebviewManager.isTauriRuntime ? (
        /* In Desktop Tauri: dedicated persistent viewport keeps ResizeObserver strictly alive */
        <div
          ref={webviewViewportRef}
          style={{
            flex: 1,
            minHeight: 0,
            width: '100%',
            position: 'relative',
            backgroundColor: 'var(--bg-canvas)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {activeTab.url === 'about:blank' && (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '32px',
              }}
            >
              <div style={{ maxWidth: '640px', width: '100%', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div>
                  <div style={{ fontSize: '48px', fontWeight: 700, color: 'var(--fg-default)', letterSpacing: '-1px' }}>
                    <span style={{ color: '#4285F4' }}>G</span>
                    <span style={{ color: '#EA4335' }}>o</span>
                    <span style={{ color: '#FBBC05' }}>o</span>
                    <span style={{ color: '#4285F4' }}>g</span>
                    <span style={{ color: '#34A853' }}>l</span>
                    <span style={{ color: '#EA4335' }}>e</span>
                  </div>
                  <span style={{ fontSize: '13px', color: 'var(--fg-muted)', marginTop: '4px', display: 'block' }}>
                    Browsing via WebRTC SOCKS5 Tunnel • Enhanced Mode Active
                  </span>
                </div>

                {/* Quick Launch Bookmarks */}
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px' }}>
                  {quickLinks.map((link) => (
                    <button
                      key={link.title}
                      onClick={(e) => {
                        if ((e.metaKey || e.ctrlKey) && onNewTabWithUrl) {
                          onNewTabWithUrl(link.url);
                        } else {
                          onNavigate(link.url);
                        }
                      }}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: 'var(--card-bg)',
                        border: '1px solid var(--border-default)',
                        borderRadius: '6px',
                        color: 'var(--fg-default)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '13px',
                        cursor: 'pointer',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                      }}
                    >
                      <span>{link.icon}</span>
                      <span>{link.title}</span>
                    </button>
                  ))}
                </div>

                {/* Status card */}
                <div
                  style={{
                    padding: '16px',
                    backgroundColor: 'var(--bg-subtle)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '8px',
                    display: 'flex',
                    justifyContent: 'space-around',
                    fontSize: '11px',
                    color: 'var(--fg-muted)',
                  }}
                >
                  <div>
                    <span style={{ display: 'block', color: 'var(--fg-default)', fontWeight: 600, fontSize: '13px' }}>
                      {googleResult?.success
                        ? `${googleResult.latencyMs}ms`
                        : bypassedGoogle
                        ? 'Bypassed'
                        : 'Unverified'}
                    </span>
                    <span>Google Status</span>
                  </div>
                  <div>
                    <span style={{ display: 'block', color: 'var(--color-success)', fontWeight: 600, fontSize: '13px' }}>
                      Bypassed (In-App)
                    </span>
                    <span>MITM Certificate</span>
                  </div>
                  <div>
                    <span style={{ display: 'block', color: 'var(--color-accent)', fontWeight: 600, fontSize: '13px' }}>
                      {role === 'host' ? 'Host Relay' : 'P2P Tunnel'}
                    </span>
                    <span>Tunnel Mode</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Web Preview Mode fallback */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
          <div
            style={{
              padding: '12px 20px',
              backgroundColor: 'var(--bg-subtle)',
              borderBottom: '1px solid var(--border-default)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <GlobeIcon size={16} fill="var(--color-accent)" />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg-default)' }}>{activeTab.title || activeTab.url}</div>
                <div style={{ fontSize: '11px', color: 'var(--fg-muted)' }}>{activeTab.url}</div>
              </div>
            </div>
            <button
              onClick={() => window.open(activeTab.url, '_blank')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                backgroundColor: 'var(--bg-canvas)',
                border: '1px solid var(--border-default)',
                borderRadius: '6px',
                color: 'var(--color-accent)',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <LinkExternalIcon size={14} />
              <span>Open in Window / Native View</span>
            </button>
          </div>

          <div style={{ flex: 1, width: '100%', height: '100%', position: 'relative' }}>
            <iframe
              src={activeTab.url}
              title={activeTab.title}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                backgroundColor: '#ffffff',
              }}
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            />
          </div>
        </div>
      )}
    </div>
  );
};
