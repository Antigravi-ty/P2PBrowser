import React from 'react';
import { Tooltip } from '@primer/react';
import {
  PlusIcon,
  XIcon,
  GlobeIcon,
  ServerIcon,
  ShieldCheckIcon,
  CheckCircleFillIcon,
  AlertIcon,
  SyncIcon,
  GearIcon,
  TerminalIcon,
  InfoIcon,
} from '@primer/octicons-react';
import { isTauri, invoke } from '@tauri-apps/api/core';
import { BrowserTab, TunnelState, AppRole, DownloadTask } from '../types/network';
import { SidebarDownloads } from './SidebarDownloads';
import { tabWebviewManager } from '../network/TabWebviewManager';

export type ActiveView = 'browser' | 'info';

interface SidebarProps {
  role: AppRole;
  onRoleChange: (r: AppRole) => void;
  activeView: ActiveView;
  onActiveViewChange: (view: ActiveView) => void;
  tabs: BrowserTab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onNewTab: () => void;
  onCloseTab: (id: string, e: React.MouseEvent) => void;
  roomCode: string;
  tunnelState: TunnelState;
  googleLatency: number | null;
  bypassedGoogle?: boolean;
  transportType: string;
  onOpenRoomSettings?: () => void;
  downloadTasks?: DownloadTask[];
  onCancelDownload?: (id: string) => void;
  onRetryDownload?: (id: string) => void;
  onRemoveDownloadTask?: (id: string) => void;
  onOpenDownloadsTab?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  role,
  onRoleChange,
  activeView,
  onActiveViewChange,
  tabs,
  activeTabId,
  onSelectTab,
  onNewTab,
  onCloseTab,
  roomCode,
  tunnelState,
  googleLatency,
  bypassedGoogle = false,
  transportType,
  onOpenRoomSettings,
  downloadTasks = [],
  onCancelDownload,
  onRetryDownload,
  onRemoveDownloadTask,
  onOpenDownloadsTab,
}) => {
  const isBrowsingView = activeView === 'browser';
  const commitHash = typeof __APP_COMMIT_HASH__ !== 'undefined' ? __APP_COMMIT_HASH__ : 'dev';

  const handleOpenConsole = async () => {
    console.log(
      `%c[P2P DevTools] 💻 Developer Console Opened via Sidebar (Commit: ${commitHash})`,
      'color: #38bdf8; font-weight: bold; font-size: 13px; background: #0f172a; padding: 4px 8px; border-radius: 4px;'
    );
    if (isTauri()) {
      try {
        await invoke('open_devtools');
      } catch (err) {
        console.warn('[Sidebar] Failed to open devtools:', err);
      }
    }
  };

  return (
    <aside
      style={{
        width: 250,
        height: '100%',
        backgroundColor: 'var(--bg-subtle)',
        borderRight: '1px solid var(--border-default)',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {/* App Branding & Mode Toggle */}
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid var(--border-default)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} title={`P2P Browser • Build: ${commitHash}`}>
            <ShieldCheckIcon size={20} fill="var(--color-accent)" />
            <span
              style={{
                fontWeight: 600,
                fontSize: '13px',
                color: 'var(--fg-default)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.5px',
              }}
            >
              {commitHash}
            </span>
          </div>
          <Tooltip text="Open Developer Tools Console" direction="s">
            <button
              onClick={handleOpenConsole}
              aria-label="Open Developer Tools Console"
              className="sidebar-action-btn"
            >
              <TerminalIcon size={16} />
            </button>
          </Tooltip>
        </div>

        {/* Operating Role Picker (Client vs Host Server) */}
        <div
          style={{
            display: 'flex',
            backgroundColor: 'var(--bg-inset)',
            padding: '2px',
            borderRadius: '6px',
            border: '1px solid var(--border-default)',
          }}
        >
          <button
            onClick={() => onRoleChange('client')}
            className={`segmented-btn ${role === 'client' ? 'active' : ''}`}
            style={{
              flex: 1,
              fontSize: '11px',
              padding: '4px 6px',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              backgroundColor: role === 'client' ? 'var(--btn-primary-bg)' : 'transparent',
              color: role === 'client' ? '#ffffff' : 'var(--fg-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              fontWeight: role === 'client' ? 600 : 400,
            }}
          >
            <GlobeIcon size={11} />
            Client
          </button>
          <button
            onClick={() => onRoleChange('host')}
            className={`segmented-btn ${role === 'host' ? 'active' : ''}`}
            style={{
              flex: 1,
              fontSize: '11px',
              padding: '4px 6px',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              backgroundColor: role === 'host' ? 'var(--color-accent)' : 'transparent',
              color: role === 'host' ? '#ffffff' : 'var(--fg-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              fontWeight: role === 'host' ? 600 : 400,
            }}
          >
            <ServerIcon size={11} />
            Host Server
          </button>
        </div>

        {/* Top-Level Views Switcher: [ Browser ] and [ Dashboard ] (Host) / [ Room Info ] (Client) */}
        <div
          style={{
            display: 'flex',
            backgroundColor: 'var(--bg-inset)',
            padding: '2px',
            borderRadius: '6px',
            border: '1px solid var(--border-default)',
          }}
        >
          <button
            onClick={() => onActiveViewChange('browser')}
            className={`segmented-btn ${activeView === 'browser' ? 'active' : ''}`}
            style={{
              flex: 1,
              fontSize: '12px',
              padding: '5px 8px',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              backgroundColor: activeView === 'browser' ? 'var(--btn-primary-bg)' : 'transparent',
              color: activeView === 'browser' ? '#ffffff' : 'var(--fg-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              fontWeight: activeView === 'browser' ? 600 : 400,
            }}
          >
            <GlobeIcon size={13} />
            Browser
          </button>
          <button
            onClick={() => onActiveViewChange('info')}
            className={`segmented-btn ${activeView === 'info' ? 'active' : ''}`}
            style={{
              flex: 1,
              fontSize: '12px',
              padding: '5px 8px',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              backgroundColor: activeView === 'info' ? 'var(--color-accent)' : 'transparent',
              color: activeView === 'info' ? '#ffffff' : 'var(--fg-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              fontWeight: activeView === 'info' ? 600 : 400,
            }}
          >
            {role === 'host' ? <ServerIcon size={13} /> : <InfoIcon size={13} />}
            {role === 'host' ? 'Dashboard' : 'Room Info'}
          </button>
        </div>
      </div>

      {/* Tabs Header & New Tab button */}
      <div
        style={{
          padding: '12px 16px 8px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--fg-muted)', textTransform: 'uppercase' }}>
          {isBrowsingView ? 'Web Tabs' : role === 'host' ? 'Host Status' : 'Room Status'}
        </span>
        {isBrowsingView && (
          <button
            onClick={onNewTab}
            title="Open new tab"
            aria-label="Open new tab"
            className="sidebar-action-btn"
          >
            <PlusIcon size={14} />
          </button>
        )}
      </div>

      {/* Tabs List or Status Summary */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
        {isBrowsingView ? (
          tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                className={`tab-item ${isActive ? 'active' : ''}`}
                onClick={() => onSelectTab(tab.id)}
                title={tab.title || 'New Tab'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                  {tab.isLoading ? (
                    <SyncIcon className="spin" size={14} fill="var(--color-accent)" />
                  ) : (
                    <GlobeIcon size={14} fill={isActive ? 'var(--color-accent)' : 'var(--fg-muted)'} />
                  )}
                  <span
                    style={{
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color: isActive ? 'var(--color-accent)' : 'var(--fg-default)',
                    }}
                  >
                    {tab.title || 'New Tab'}
                  </span>
                </div>
                <div
                  className="tab-close-btn"
                  onClick={(e) => onCloseTab(tab.id, e)}
                  title="Close tab"
                >
                  <XIcon size={14} />
                </div>
              </div>
            );
          })
        ) : (
          <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div
              style={{
                padding: '12px',
                backgroundColor: 'var(--bg-canvas)',
                border: '1px solid var(--border-default)',
                borderRadius: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '11px', color: 'var(--fg-muted)', fontWeight: 600 }}>
                {role === 'host' ? 'HOST SERVER RELAY' : 'P2P CLIENT TUNNEL'}
              </span>
              <span style={{ fontSize: '13px', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircleFillIcon size={14} fill="var(--color-success)" />
                {role === 'host' ? 'Universal Relay Ready' : 'Encrypted P2P Ready'}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--fg-muted)', lineHeight: 1.4 }}>
                {role === 'host'
                  ? 'Inbound WebRTC sockets are forwarded through local system adapters and proxy.'
                  : 'Web traffic is transparently tunneled across direct WebRTC DataChannels.'}
              </span>
            </div>

            {/* Quick link to switch back to Web Tabs */}
            <button
              onClick={() => onActiveViewChange('browser')}
              className="btn-secondary"
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                color: 'var(--color-accent)',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <GlobeIcon size={13} fill="var(--color-accent)" />
              <span>Switch to Browser Tabs ({tabs.length})</span>
            </button>
          </div>
        )}
      </div>

      {/* Compact Sidebar Downloads Section */}
      {isBrowsingView && (
        <SidebarDownloads
          tasks={downloadTasks}
          onCancelDownload={onCancelDownload}
          onRetryDownload={onRetryDownload}
          onRemoveTask={onRemoveDownloadTask}
          onOpenDownloadsTab={onOpenDownloadsTab}
        />
      )}

      {/* Bottom Status Bar */}
      <div
        style={{
          padding: '14px 16px',
          borderTop: '1px solid var(--border-default)',
          backgroundColor: 'var(--bg-canvas)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '12px', color: 'var(--fg-muted)' }}>Room Code</span>
          <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--color-accent)', background: 'var(--color-accent-bg)', padding: '2px 6px', borderRadius: '4px' }}>
            {roomCode ? `#${roomCode}` : 'Not connected'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '12px', color: 'var(--fg-muted)' }}>P2P Status</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {tunnelState === 'ready' || tunnelState === 'p2p_connected' ? (
              <CheckCircleFillIcon size={14} fill="var(--color-success)" />
            ) : tunnelState === 'signaling' || tunnelState === 'ice_gathering' ? (
              <SyncIcon className="spin" size={14} fill="var(--color-warning)" />
            ) : (
              <AlertIcon size={14} fill="var(--color-danger)" />
            )}
            <span
              style={{
                fontSize: '12px',
                fontWeight: 500,
                color:
                  tunnelState === 'ready' || tunnelState === 'p2p_connected'
                    ? 'var(--color-success)'
                    : tunnelState === 'signaling' || tunnelState === 'ice_gathering'
                    ? 'var(--color-warning)'
                    : 'var(--fg-muted)',
              }}
            >
              {tunnelState === 'ready'
                ? `Online (${transportType})`
                : tunnelState === 'p2p_connected'
                ? 'P2P Connected'
                : tunnelState === 'signaling'
                ? 'Connecting...'
                : tunnelState === 'ice_gathering'
                ? 'Gathering ICE...'
                : 'Offline'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '12px', color: 'var(--fg-muted)' }}>Google 204</span>
          {bypassedGoogle ? (
            <span style={{ fontSize: '11px', color: '#d97706', background: 'rgba(217, 119, 6, 0.1)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
              Bypassed
            </span>
          ) : googleLatency !== null ? (
            <span style={{ fontSize: '11px', color: 'var(--color-success)', background: 'var(--color-success-bg)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
              {googleLatency}ms
            </span>
          ) : (
            <span style={{ fontSize: '11px', color: 'var(--fg-muted)', background: 'var(--bg-inset)', padding: '2px 6px', borderRadius: '4px' }}>
              Unverified
            </span>
          )}
        </div>
      </div>
    </aside>
  );
};
