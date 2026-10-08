import React from 'react';
import { SyncIcon } from '@primer/octicons-react';
import { AppRole, BrowserTab, GoogleProbeResult, TunnelState, DownloadTask } from '../types/network';
import { tabWebviewManager } from '../network/TabWebviewManager';
import { SettingsView } from './SettingsView';
import { DownloadsView } from './DownloadsView';
import { BrowserViewport } from './browser/BrowserViewport';
import { BrowserConnectCard } from './browser/BrowserConnectCard';

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
  onNewTabWithUrl?: (url: string) => void;
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
  const isRoomCodeValid = /^[a-zA-Z0-9-]+$/.test((roomCode || '').trim());
  const isClientReadyToBrowse =
    Boolean(googleResult?.success) ||
    bypassedGoogle ||
    (isRoomCodeValid && (tunnelState === 'ready' || tunnelState === 'p2p_connected'));
  const isReadyToBrowse =
    role === 'host'
      ? Boolean(googleResult?.success) || bypassedGoogle
      : isClientReadyToBrowse;

  // 1. Internal Settings Page
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

  // 2. Internal Downloads Manager Page
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

  // 3. Not Ready: P2P Guide and Connection Wizard
  if (!isReadyToBrowse) {
    return (
      <BrowserConnectCard
        role={role}
        roomCode={roomCode}
        onRoomCodeChange={onRoomCodeChange}
        tunnelState={tunnelState}
        signalingProgress={signalingProgress}
        isSignalingConnected={isSignalingConnected}
        googleResult={googleResult}
        isCheckingGoogle={isCheckingGoogle}
        onConnectRoom={onConnectRoom}
        onCancelConnect={onCancelConnect}
        onRecheckGoogle={onRecheckGoogle}
        onRequestContinueWithoutGoogle={onRequestContinueWithoutGoogle}
        onOpenDashboard={onOpenDashboard}
      />
    );
  }

  // 4. Ready: Active Web Browsing View
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
            <span style={{ fontSize: '12px', color: 'var(--fg-default)' }}>
              Verifying Google.com connectivity (5s timeout)...
            </span>
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

      {/* Main Browser Viewport */}
      <BrowserViewport
        activeTab={activeTab}
        isReadyToBrowse={isReadyToBrowse}
        onNavigate={onNavigate}
        onNewTabWithUrl={onNewTabWithUrl}
        googleResult={googleResult}
        bypassedGoogle={bypassedGoogle}
        role={role}
      />
    </div>
  );
};
