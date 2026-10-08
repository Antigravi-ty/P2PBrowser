import React, { useState } from 'react';
import {
  GearIcon,
  ShieldLockIcon,
  ServerIcon,
  GlobeIcon,
  KeyIcon,
  CpuIcon,
  CheckCircleFillIcon,
  AlertIcon,
  SyncIcon,
  TrashIcon,
  SlidersIcon,
  FileDirectoryIcon,
  CheckIcon,
  CopyIcon,
  TerminalIcon,
  DownloadIcon,
} from '@primer/octicons-react';
import { useAppConfig } from '../hooks/useAppConfig';
import {
  LogFilterCategories,
  copyLogsToClipboard,
  getBufferedLogs,
  clearLogBuffer,
  exportDiagnosticsFile,
} from '../utils/logger';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { AppRole } from '../types/network';
import { tabWebviewManager } from '../network/TabWebviewManager';
import { ConfirmDialog } from './ConfirmDialog';

interface SettingsViewProps {
  role: AppRole;
  onRoleChange: (r: AppRole) => void;
  roomId: string;
  onRoomIdChange: (r: string) => void;
  password: string;
  onPasswordChange: (p: string) => void;
  signalingUrl: string;
  onSignalingUrlChange: (s: string) => void;
  socks5Port: number;
  onSocks5PortChange: (port: number) => void;
  isConnected: boolean;
  isConnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  tunnelState?: string;
  googleLatency?: number | null;
  bypassedGoogle?: boolean;
}

type SettingCategory = 'p2p_room' | 'proxy_relays' | 'security_certs' | 'diagnostics' | 'advanced';

export const SettingsView: React.FC<SettingsViewProps> = ({
  role,
  onRoleChange,
  roomId,
  onRoomIdChange,
  password,
  onPasswordChange,
  signalingUrl,
  onSignalingUrlChange,
  socks5Port,
  onSocks5PortChange,
  isConnected,
  isConnecting,
  onConnect,
  onDisconnect,
  tunnelState = 'idle',
  googleLatency = null,
  bypassedGoogle = false,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<SettingCategory>('p2p_room');
  const [logCopyFeedback, setLogCopyFeedback] = useState<string | null>(null);
  const [commitCopyFeedback, setCommitCopyFeedback] = useState<string | null>(null);
  const commitHash = typeof __APP_COMMIT_HASH__ !== 'undefined' ? __APP_COMMIT_HASH__ : 'dev';

  const handleCopyLogs = async () => {
    const res = await copyLogsToClipboard();
    if (res.success) {
      setLogCopyFeedback(`Copied ${res.count} log entries with timestamps!`);
    } else {
      setLogCopyFeedback('Failed to copy logs to clipboard');
    }
    setTimeout(() => setLogCopyFeedback(null), 3000);
  };

  const handleCopyCommit = () => {
    try {
      navigator.clipboard.writeText(commitHash);
      setCommitCopyFeedback('Commit copied!');
    } catch (_) {
      setCommitCopyFeedback(commitHash);
    }
    setTimeout(() => setCommitCopyFeedback(null), 2500);
  };

  const handleOpenDevTools = async () => {
    console.log(
      `%c[P2P DevTools] 💻 Developer Console Opened via Settings (Commit: ${commitHash})`,
      'color: #3b82f6; font-weight: bold; font-size: 13px;'
    );
    if (isTauri()) {
      try {
        await invoke('open_devtools');
      } catch (err) {
        console.warn('[Settings] Failed to open devtools:', err);
      }
    }
  };

  const {
    config,
    configDir,
    isSaving,
    statusMessage,
    updateCategory,
    setFilteringEnabled,
    setMinLevel,
    applyPreset,
    openConfigFolder,
    reloadFromDisk,
    resetToDefaults,
  } = useAppConfig();

  const categories = [
    {
      id: 'p2p_room' as SettingCategory,
      title: 'P2P Network & Room',
      icon: <GlobeIcon size={16} />,
      desc: 'Role configuration, room credentials, and connection management',
    },
    {
      id: 'proxy_relays' as SettingCategory,
      title: 'Proxy & Relays / Regions',
      icon: <ServerIcon size={16} />,
      desc: 'Local SOCKS5 proxy port and signaling relay endpoints',
    },
    {
      id: 'security_certs' as SettingCategory,
      title: 'Security & Certificates',
      icon: <ShieldLockIcon size={16} />,
      desc: 'End-to-end WebRTC encryption, SSL bypass and cache clearance',
    },
    {
      id: 'diagnostics' as SettingCategory,
      title: 'Sessions & Diagnostics',
      icon: <CpuIcon size={16} />,
      desc: 'Connectivity probes, latency metrics, and engine diagnostics',
    },
    {
      id: 'advanced' as SettingCategory,
      title: 'Advanced & Logs',
      icon: <SlidersIcon size={16} />,
      desc: 'Console log output filter, application directory, and persistent configuration',
    },
  ];

  const [clearDialog, setClearDialog] = useState<{
    isOpen: boolean;
    type: 'cache' | 'cookies' | 'all';
    title: string;
    description: string;
    warningNote?: string;
    confirmLabel: string;
    confirmVariant: 'danger' | 'warning';
  }>({
    isOpen: false,
    type: 'all',
    title: '',
    description: '',
    warningNote: '',
    confirmLabel: 'Clear',
    confirmVariant: 'danger',
  });

  const [clearStatus, setClearStatus] = useState<{
    type: 'cache' | 'cookies' | 'all' | null;
    message: string;
  }>({ type: null, message: '' });

  const openClearCacheDialog = () => {
    tabWebviewManager.setOverlayOpen(true);
    setClearDialog({
      isOpen: true,
      type: 'cache',
      title: 'Clear HTTP & Resource Cache?',
      description: 'This will purge all cached website scripts, images, and stylesheets from local disk memory.',
      warningNote: 'Your active login sessions and saved cookies will NOT be deleted.',
      confirmLabel: 'Clear Cache',
      confirmVariant: 'warning',
    });
  };

  const openClearCookiesDialog = () => {
    tabWebviewManager.setOverlayOpen(true);
    setClearDialog({
      isOpen: true,
      type: 'cookies',
      title: 'Clear Cookies & Active Sessions?',
      description: 'This will remove stored cookies, authorization tokens, and persistent site data across all tabs.',
      warningNote: 'You will be signed out of active accounts (e.g. Google, GitHub, Bilibili).',
      confirmLabel: 'Clear Cookies & Sign Out',
      confirmVariant: 'danger',
    });
  };

  const openClearAllDialog = () => {
    tabWebviewManager.setOverlayOpen(true);
    setClearDialog({
      isOpen: true,
      type: 'all',
      title: 'Clear All Browsing Data?',
      description: 'This will permanently delete all cookies, local storage databases, active sessions, and HTTP cache files.',
      warningNote: 'This action is irreversible. All tabs will be reset to a fresh profile.',
      confirmLabel: 'Permanently Clear All Data',
      confirmVariant: 'danger',
    });
  };

  const closeClearDialog = () => {
    tabWebviewManager.setOverlayOpen(false);
    setClearDialog((prev) => ({ ...prev, isOpen: false }));
  };

  const executeClearAction = async () => {
    const actionType = clearDialog.type;
    closeClearDialog();
    try {
      if (actionType === 'cache') {
        await tabWebviewManager.clearCache();
        setClearStatus({ type: 'cache', message: 'Cache cleared!' });
      } else if (actionType === 'cookies') {
        await tabWebviewManager.clearCookies();
        setClearStatus({ type: 'cookies', message: 'Cookies cleared!' });
      } else {
        await tabWebviewManager.clearBrowsingData();
        setClearStatus({ type: 'all', message: 'All data cleared!' });
      }
      setTimeout(() => setClearStatus({ type: null, message: '' }), 3500);
    } catch (e) {
      console.warn('Failed to execute clear action:', e);
    }
  };

  return (
    <div
      style={{
        flex: 1,
        height: '100%',
        backgroundColor: 'var(--bg-canvas)',
        color: 'var(--fg-default)',
        display: 'flex',
        overflow: 'hidden',
      }}
    >
      {/* Left Menu / Categories Navigation (expands reasons to the right) */}
      <div
        style={{
          width: 280,
          borderRight: '1px solid var(--border-default)',
          backgroundColor: 'var(--bg-subtle)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
        <div style={{ padding: '24px 20px 16px 20px', borderBottom: '1px solid var(--border-default)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GearIcon size={18} fill="var(--color-accent)" />
            <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Browser Settings</h2>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--fg-muted)', margin: '4px 0 0 0' }}>
            Dedicated tab • Completely eliminates native window airspace occlusion
          </p>
        </div>

        <div style={{ padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  border: isSelected ? '1px solid var(--color-accent)' : '1px solid transparent',
                  backgroundColor: isSelected ? 'var(--color-accent-bg)' : 'transparent',
                  color: isSelected ? 'var(--color-accent)' : 'var(--fg-default)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ marginTop: '2px', color: isSelected ? 'var(--color-accent)' : 'var(--fg-muted)' }}>
                  {cat.icon}
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: isSelected ? 600 : 500 }}>{cat.title}</div>
                  <div
                    style={{
                      fontSize: '11px',
                      color: isSelected ? 'var(--color-accent)' : 'var(--fg-muted)',
                      marginTop: '2px',
                      lineHeight: 1.3,
                    }}
                  >
                    {cat.desc}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Build & Version info footer */}
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--border-default)',
            backgroundColor: 'var(--bg-subtle)',
            fontSize: '11px',
            color: 'var(--fg-muted)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Build Version:</span>
            <span style={{ fontWeight: 600, color: 'var(--fg-default)' }}>v1.0.0</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Git Commit:</span>
            <button
              type="button"
              onClick={handleCopyCommit}
              title="Click to copy commit hash"
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-accent)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '1px 4px',
                borderRadius: '3px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>{commitHash}</span>
              <CopyIcon size={10} />
            </button>
          </div>
          {commitCopyFeedback && (
            <div style={{ color: 'var(--color-success)', fontSize: '10px', textAlign: 'right' }}>
              {commitCopyFeedback}
            </div>
          )}
        </div>
      </div>

      {/* Right Content Area: Displays details and configuration cards for selected reason */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px' }}>
        <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {selectedCategory === 'p2p_room' && (
            <>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 6px 0' }}>P2P Network & Room</h3>
                <p style={{ fontSize: '13px', color: 'var(--fg-muted)', margin: 0 }}>
                  Manage node operating role, rendezvous room code, and peer authentication.
                </p>
              </div>

              {/* Operating Role Picker */}
              <div
                style={{
                  backgroundColor: 'var(--bg-canvas)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '8px',
                  padding: '16px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <label style={{ fontSize: '13px', fontWeight: 600 }}>Operating Role</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <button
                    onClick={() => onRoleChange('client')}
                    style={{
                      padding: '12px',
                      borderRadius: '6px',
                      border: role === 'client' ? '2px solid var(--color-accent)' : '1px solid var(--border-default)',
                      backgroundColor: role === 'client' ? 'var(--color-accent-bg)' : 'var(--bg-subtle)',
                      color: 'var(--fg-default)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '13px' }}>
                      <GlobeIcon size={14} fill={role === 'client' ? 'var(--color-accent)' : 'var(--fg-muted)'} />
                      <span>Client Mode</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--fg-muted)', marginTop: '4px' }}>
                      Connect to a host room and tunnel browser traffic via WebRTC.
                    </div>
                  </button>

                  <button
                    onClick={() => onRoleChange('host')}
                    style={{
                      padding: '12px',
                      borderRadius: '6px',
                      border: role === 'host' ? '2px solid var(--color-accent)' : '1px solid var(--border-default)',
                      backgroundColor: role === 'host' ? 'var(--color-accent-bg)' : 'var(--bg-subtle)',
                      color: 'var(--fg-default)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '13px' }}>
                      <ServerIcon size={14} fill={role === 'host' ? 'var(--color-accent)' : 'var(--fg-muted)'} />
                      <span>Host Server Mode</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--fg-muted)', marginTop: '4px' }}>
                      Relay connections from client peers through local network adapters.
                    </div>
                  </button>
                </div>
              </div>

              {/* Room Code & Password Form */}
              <form
                onSubmit={(e) => e.preventDefault()}
                autoComplete="off"
                style={{
                  backgroundColor: 'var(--bg-canvas)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '8px',
                  padding: '16px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div>
                  <label htmlFor="room-code-input" style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                    Room Code
                  </label>
                  <input
                    id="room-code-input"
                    name="room_code"
                    type="text"
                    autoComplete="off"
                    value={roomId}
                    onChange={(e) => onRoomIdChange(e.target.value)}
                    placeholder="Enter alphanumeric room code (e.g. room-888)"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-default)',
                      backgroundColor: 'var(--bg-subtle)',
                      color: 'var(--fg-default)',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                </div>

                <div>
                  <label htmlFor="room-password-input" style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                    Room Secret Password (Optional)
                  </label>
                  <input
                    id="room-password-input"
                    name="room_password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => onPasswordChange(e.target.value)}
                    placeholder="Enter room password if protected"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-default)',
                      backgroundColor: 'var(--bg-subtle)',
                      color: 'var(--fg-default)',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                </div>
              </form>

              {/* Connection Action */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 20px',
                  backgroundColor: 'var(--bg-subtle)',
                  borderRadius: '8px',
                  border: '1px solid var(--border-default)',
                }}
              >
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>Tunnel Connection</div>
                  <div style={{ fontSize: '11px', color: 'var(--fg-muted)', marginTop: '2px' }}>
                    Status: {isConnected ? 'Connected & Active' : isConnecting ? 'Negotiating...' : 'Idle / Offline'}
                  </div>
                </div>

                {isConnected ? (
                  <button
                    onClick={onDisconnect}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '6px',
                      backgroundColor: 'transparent',
                      border: '1px solid var(--color-danger)',
                      color: 'var(--color-danger)',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={onConnect}
                    disabled={isConnecting || !roomId.trim()}
                    style={{
                      padding: '8px 20px',
                      borderRadius: '6px',
                      backgroundColor: isConnecting || !roomId.trim() ? 'var(--bg-inset)' : 'var(--btn-primary-bg)',
                      border: 'none',
                      color: isConnecting || !roomId.trim() ? 'var(--fg-muted)' : '#ffffff',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: isConnecting || !roomId.trim() ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    {isConnecting && <SyncIcon className="spin" size={13} />}
                    <span>{role === 'host' ? 'Start Host Server' : 'Connect to Room'}</span>
                  </button>
                )}
              </div>
            </>
          )}

          {selectedCategory === 'proxy_relays' && (
            <>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 6px 0' }}>Proxy & Relays / Regions</h3>
                <p style={{ fontSize: '13px', color: 'var(--fg-muted)', margin: 0 }}>
                  Network adapter ports and signaling servers.
                </p>
              </div>

              <div
                style={{
                  backgroundColor: 'var(--bg-canvas)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '8px',
                  padding: '16px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                    Local SOCKS5 Proxy Port
                  </label>
                  <input
                    type="number"
                    value={socks5Port}
                    onChange={(e) => onSocks5PortChange(parseInt(e.target.value, 10) || 10808)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-default)',
                      backgroundColor: 'var(--bg-subtle)',
                      color: 'var(--fg-default)',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--fg-muted)', display: 'block', marginTop: '4px' }}>
                    Default: 10808. Child Webview instances automatically route requests through this port.
                  </span>
                </div>

                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                    WebSocket Signaling URL
                  </label>
                  <input
                    type="text"
                    value={signalingUrl}
                    onChange={(e) => onSignalingUrlChange(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-default)',
                      backgroundColor: 'var(--bg-subtle)',
                      color: 'var(--fg-default)',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--fg-muted)', display: 'block', marginTop: '4px' }}>
                    Public WebRTC rendezvous endpoint for exchanging SDP offers/answers.
                  </span>
                </div>
              </div>
            </>
          )}

          {selectedCategory === 'security_certs' && (
            <>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 6px 0' }}>Security & Certificates</h3>
                <p style={{ fontSize: '13px', color: 'var(--fg-muted)', margin: 0 }}>
                  Cryptographic verification, certificate validation, and browser cache.
                </p>
              </div>

              <div
                style={{
                  backgroundColor: 'var(--bg-canvas)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '8px',
                  padding: '16px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>End-to-End Encryption</div>
                    <div style={{ fontSize: '11px', color: 'var(--fg-muted)' }}>
                      WebRTC channels are encrypted using DTLS-SRTP and AES-GCM.
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--color-success)', fontWeight: 600 }}>Active</span>
                </div>

                <div style={{ height: '1px', backgroundColor: 'var(--border-default)' }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg-default)' }}>
                      Browsing Data & Storage Management
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--fg-muted)', marginTop: '2px' }}>
                      Independently manage HTTP cache, session cookies, or completely reset user data. Each action requires confirmation.
                    </div>
                  </div>

                  {/* 1. Clear HTTP Cache */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', backgroundColor: 'var(--bg-subtle)', borderRadius: '6px', border: '1px solid var(--border-default)' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>Clear HTTP & Resource Cache</div>
                      <div style={{ fontSize: '11px', color: 'var(--fg-muted)' }}>
                        Frees disk space by removing cached assets. Active login sessions and cookies will NOT be deleted.
                      </div>
                    </div>
                    <button
                      onClick={openClearCacheDialog}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 14px',
                        borderRadius: '6px',
                        backgroundColor: 'var(--bg-canvas)',
                        border: '1px solid var(--border-default)',
                        color: clearStatus.type === 'cache' ? 'var(--color-success)' : 'var(--fg-default)',
                        fontSize: '12px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {clearStatus.type === 'cache' ? <CheckCircleFillIcon size={14} /> : <TrashIcon size={14} />}
                      <span>{clearStatus.type === 'cache' ? clearStatus.message : 'Clear Cache'}</span>
                    </button>
                  </div>

                  {/* 2. Clear Cookies & Sessions */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', backgroundColor: 'var(--bg-subtle)', borderRadius: '6px', border: '1px solid var(--border-default)' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>Clear Cookies & Active Sessions</div>
                      <div style={{ fontSize: '11px', color: 'var(--fg-muted)' }}>
                        Deletes authentication tokens and cookies. You will be signed out of active accounts across tabs.
                      </div>
                    </div>
                    <button
                      onClick={openClearCookiesDialog}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 14px',
                        borderRadius: '6px',
                        backgroundColor: 'var(--bg-canvas)',
                        border: '1px solid rgba(207, 34, 46, 0.4)',
                        color: clearStatus.type === 'cookies' ? 'var(--color-success)' : 'var(--color-danger)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {clearStatus.type === 'cookies' ? <CheckCircleFillIcon size={14} /> : <TrashIcon size={14} />}
                      <span>{clearStatus.type === 'cookies' ? clearStatus.message : 'Clear Cookies'}</span>
                    </button>
                  </div>

                  {/* 3. Clear All Browsing Data (Danger) */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', backgroundColor: 'rgba(207, 34, 46, 0.04)', borderRadius: '6px', border: '1px solid rgba(207, 34, 46, 0.25)' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-danger)' }}>
                        Clear All Browsing Data
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--fg-muted)' }}>
                        Permanently deletes all cookies, storage databases, and cache. Full reset to fresh profile.
                      </div>
                    </div>
                    <button
                      onClick={openClearAllDialog}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 14px',
                        borderRadius: '6px',
                        backgroundColor: 'var(--color-danger)',
                        border: 'none',
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                        transition: 'opacity 0.15s ease',
                      }}
                    >
                      {clearStatus.type === 'all' ? <CheckCircleFillIcon size={14} /> : <TrashIcon size={14} />}
                      <span>{clearStatus.type === 'all' ? clearStatus.message : 'Clear All (Danger)'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {selectedCategory === 'diagnostics' && (
            <>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 6px 0' }}>Sessions & Diagnostics</h3>
                <p style={{ fontSize: '13px', color: 'var(--fg-muted)', margin: 0 }}>
                  Real-time network state and connectivity probe status.
                </p>
              </div>

              <div
                style={{
                  backgroundColor: 'var(--bg-canvas)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '8px',
                  padding: '16px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--fg-muted)' }}>Tunnel State</span>
                  <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{tunnelState}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--fg-muted)' }}>Google 204 Probe</span>
                  <span>
                    {googleLatency !== null
                      ? `${googleLatency}ms`
                      : bypassedGoogle
                      ? 'Bypassed by User'
                      : 'Unverified'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--fg-muted)' }}>Proxy Listen Target</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>127.0.0.1:{socks5Port}</span>
                </div>
              </div>
            </>
          )}
          {selectedCategory === 'advanced' && (
            <>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0, marginBottom: '6px' }}>
                  Advanced Settings & Diagnostic Logs
                </h2>
                <p style={{ fontSize: '13px', color: 'var(--fg-muted)', margin: 0 }}>
                  Manage diagnostic log buffers with origin timestamps, copy logs for support, and configure console filters.
                </p>
              </div>

              {/* Diagnostic Console Logs & Clipboard Export */}
              <div
                style={{
                  backgroundColor: 'var(--bg-canvas)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '8px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 4px 0' }}>
                      Diagnostic Log Capture & Copy (诊断日志捕获与导出)
                    </h3>
                    <p style={{ fontSize: '12px', color: 'var(--fg-muted)', margin: 0 }}>
                      All client console logs are preserved in a memory ring buffer with genuine client timestamps for accurate diagnostics.
                    </p>
                  </div>
                  <span
                    style={{
                      fontSize: '11px',
                      backgroundColor: 'var(--bg-subtle)',
                      border: '1px solid var(--border-default)',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      color: 'var(--color-accent)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    Buffer: {getBufferedLogs().length} entries
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={handleCopyLogs}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                      fontSize: '12px',
                      fontWeight: 600,
                      backgroundColor: 'var(--color-accent)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    <CopyIcon size={14} />
                    <span>Copy All Logs with Timestamps</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => exportDiagnosticsFile({ role, roomId })}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      fontSize: '12px',
                      fontWeight: 500,
                      backgroundColor: 'var(--bg-subtle)',
                      color: 'var(--fg-default)',
                      border: '1px solid var(--border-default)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    <DownloadIcon size={14} fill="var(--color-accent)" />
                    <span>Export Diagnostics (.log)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenDevTools}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      fontSize: '12px',
                      fontWeight: 500,
                      backgroundColor: 'var(--bg-subtle)',
                      color: 'var(--fg-default)',
                      border: '1px solid var(--border-default)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    <TerminalIcon size={14} fill="var(--color-accent)" />
                    <span>Open DevTools Console</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      clearLogBuffer();
                      setLogCopyFeedback('Log buffer cleared');
                      setTimeout(() => setLogCopyFeedback(null), 2000);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      fontSize: '12px',
                      fontWeight: 500,
                      backgroundColor: 'var(--bg-subtle)',
                      color: 'var(--fg-muted)',
                      border: '1px solid var(--border-default)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    <TrashIcon size={14} />
                    <span>Clear Buffer</span>
                  </button>

                  {logCopyFeedback && (
                    <span style={{ fontSize: '12px', color: 'var(--color-success)', fontWeight: 500 }}>
                      {logCopyFeedback}
                    </span>
                  )}
                </div>
              </div>


              {/* Status Message Toast */}
              {statusMessage && (
                <div
                  style={{
                    backgroundColor: 'rgba(56, 139, 253, 0.1)',
                    border: '1px solid var(--color-accent)',
                    color: 'var(--color-accent)',
                    borderRadius: '6px',
                    padding: '8px 14px',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <CheckIcon size={14} />
                  <span>{statusMessage}</span>
                </div>
              )}

              {/* Section 1: Console Logging Output */}
              <div
                style={{
                  backgroundColor: 'var(--bg-canvas)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '8px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 4px 0' }}>
                      Console Output Filter (控制台日志过滤)
                    </h3>
                    <p style={{ fontSize: '12px', color: 'var(--fg-muted)', margin: 0 }}>
                      Filter noisy background logs to keep browser developer tools focused and clean.
                    </p>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}>
                    <input
                      type="checkbox"
                      checked={config.logFilter.filteringEnabled}
                      onChange={(e) => setFilteringEnabled(e.target.checked)}
                      style={{ cursor: 'pointer', accentColor: 'var(--color-accent)' }}
                    />
                    <span>{config.logFilter.filteringEnabled ? 'Filter Active' : 'Filter Disabled (Show Raw)'}</span>
                  </label>
                </div>

                {/* Quick Presets & Log Level */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    padding: '12px 14px',
                    backgroundColor: 'var(--bg-subtle)',
                    borderRadius: '6px',
                    border: '1px solid var(--border-default)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--fg-muted)', fontWeight: 500 }}>Presets:</span>
                    <button
                      type="button"
                      onClick={() => applyPreset('clean')}
                      style={{
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
                      Clean Mode (干净控制台)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('all')}
                      style={{
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
                      Show All
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('mute')}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 500,
                        backgroundColor: 'var(--bg-canvas)',
                        color: 'var(--fg-muted)',
                        border: '1px solid var(--border-default)',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      Mute All
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--fg-muted)', fontWeight: 500 }}>Min Level:</span>
                    <select
                      value={config.logFilter.minLevel}
                      onChange={(e) => setMinLevel(e.target.value as any)}
                      style={{
                        padding: '4px 8px',
                        fontSize: '12px',
                        backgroundColor: 'var(--bg-canvas)',
                        color: 'var(--fg-default)',
                        border: '1px solid var(--border-default)',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="all">All (Debug + Log + Info + Warn + Error)</option>
                      <option value="info">Info, Warnings & Errors</option>
                      <option value="warn">Warnings & Errors Only</option>
                      <option value="error">Errors Only</option>
                    </select>
                  </div>
                </div>

                {/* Categories Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                  {[
                    {
                      key: 'webviewLayout' as keyof LogFilterCategories,
                      label: 'Webview Layout & Bounds',
                      badge: '[WebviewLayout]',
                      desc: 'Viewport measurements and bounds adjustments (muted by default to avoid spam)',
                    },
                    {
                      key: 'tauri' as keyof LogFilterCategories,
                      label: 'Tauri Native IPC',
                      badge: '[TAURI]',
                      desc: 'Tauri internal callback IDs and IPC channel notifications (muted by default)',
                    },
                    {
                      key: 'socks5' as keyof LogFilterCategories,
                      label: 'SOCKS5 Proxy Bridge',
                      badge: '[SOCKS5]',
                      desc: 'Local proxy client stream forwarding, handshakes, and FIFO packet delivery',
                    },
                    {
                      key: 'p2pTunnel' as keyof LogFilterCategories,
                      label: 'P2P WebRTC Tunnel',
                      badge: '[P2PWebRTCTunnel]',
                      desc: 'Signaling server handshakes, peer discovery, and multiplexed data channel frames',
                    },
                    {
                      key: 'hostRelay' as keyof LogFilterCategories,
                      label: 'Host TCP Relay',
                      badge: '[HostRelay]',
                      desc: 'Native outbound TCP socket connections and TUN-intercepted streaming',
                    },
                    {
                      key: 'probe' as keyof LogFilterCategories,
                      label: 'Connectivity Probes',
                      badge: '[ConnectivityProbe]',
                      desc: 'Google 204 connectivity diagnostics and latency measurements',
                    },
                    {
                      key: 'downloads' as keyof LogFilterCategories,
                      label: 'Download Engine',
                      badge: '[Download]',
                      desc: 'Native download tasks, HTTP proxy streams, and file transfers',
                    },
                    {
                      key: 'app' as keyof LogFilterCategories,
                      label: 'Application State',
                      badge: '[App]',
                      desc: 'Top-level view coordination, tunnel state updates, and browser lifecycle',
                    },
                    {
                      key: 'others' as keyof LogFilterCategories,
                      label: 'Uncategorized Logs',
                      badge: '[Other]',
                      desc: 'Third-party module diagnostics and uncategorized console messages',
                    },
                  ].map((cat) => {
                    const isChecked = config.logFilter.categories[cat.key] !== false;
                    return (
                      <label
                        key={cat.key}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                          padding: '10px 12px',
                          backgroundColor: isChecked ? 'var(--bg-canvas)' : 'var(--bg-subtle)',
                          border: `1px solid ${isChecked ? 'var(--border-default)' : 'var(--border-muted, #30363d)'}`,
                          borderRadius: '6px',
                          cursor: 'pointer',
                          opacity: isChecked ? 1 : 0.65,
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => updateCategory(cat.key, e.target.checked)}
                          style={{ marginTop: '2px', cursor: 'pointer', accentColor: 'var(--color-accent)' }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--fg-default)' }}>
                              {cat.label}
                            </span>
                            <span
                              style={{
                                fontSize: '10px',
                                fontFamily: 'var(--font-mono)',
                                color: 'var(--fg-muted)',
                                backgroundColor: 'var(--bg-subtle)',
                                padding: '1px 4px',
                                borderRadius: '3px',
                              }}
                            >
                              {cat.badge}
                            </span>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--fg-muted)', lineHeight: '1.3' }}>
                            {cat.desc}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Section 2: Configuration Directory & Persistence */}
              <div
                style={{
                  backgroundColor: 'var(--bg-canvas)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '8px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                }}
              >
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 4px 0' }}>
                    Dedicated Configuration Directory (专有配置文件夹)
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--fg-muted)', margin: 0 }}>
                    Each Tauri application instance maintains a dedicated local folder for configuration files (settings.json). You can edit them manually or view them in system file explorer.
                  </p>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 14px',
                    backgroundColor: 'var(--bg-subtle)',
                    borderRadius: '6px',
                    border: '1px solid var(--border-default)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    color: 'var(--fg-default)',
                    wordBreak: 'break-all',
                  }}
                >
                  <FileDirectoryIcon size={16} fill="var(--color-accent)" />
                  <span style={{ flex: 1 }}>{configDir || 'Locating configuration directory...'}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={openConfigFolder}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      fontSize: '12px',
                      fontWeight: 500,
                      backgroundColor: 'var(--color-accent)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    <FileDirectoryIcon size={14} />
                    <span>Open Folder in Explorer / Finder</span>
                  </button>

                  <button
                    type="button"
                    onClick={reloadFromDisk}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      fontSize: '12px',
                      fontWeight: 500,
                      backgroundColor: 'var(--bg-subtle)',
                      color: 'var(--fg-default)',
                      border: '1px solid var(--border-default)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    <SyncIcon size={14} />
                    <span>Reload from Disk</span>
                  </button>

                  <button
                    type="button"
                    onClick={resetToDefaults}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      fontSize: '12px',
                      fontWeight: 500,
                      backgroundColor: 'var(--bg-subtle)',
                      color: 'var(--color-danger)',
                      border: '1px solid var(--border-default)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    <TrashIcon size={14} />
                    <span>Reset to Defaults</span>
                  </button>

                  {isSaving && (
                    <span style={{ fontSize: '11px', color: 'var(--fg-muted)', marginLeft: 'auto' }}>
                      Saving to disk...
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={clearDialog.isOpen}
        title={clearDialog.title}
        description={clearDialog.description}
        warningNote={clearDialog.warningNote}
        confirmLabel={clearDialog.confirmLabel}
        confirmVariant={clearDialog.confirmVariant}
        onConfirm={executeClearAction}
        onClose={closeClearDialog}
      />
    </div>
  );
};
