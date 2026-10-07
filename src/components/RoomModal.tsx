import React from 'react';
import {
  SyncIcon,
  KeyIcon,
  ServerIcon,
  GlobeIcon,
  ShieldCheckIcon,
  XIcon,
} from '@primer/octicons-react';
import { AppRole } from '../types/network';
import { generateRandomRoomCode, SIGNALING_ROOM_PREFIX, DEFAULT_SIGNALING_URL } from '../network/SignalingConfig';

interface RoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  role: AppRole;
  onRoleChange: (r: AppRole) => void;
  roomId: string;
  onRoomIdChange: (id: string) => void;
  password: string;
  onPasswordChange: (pwd: string) => void;
  signalingUrl: string;
  onSignalingUrlChange: (url: string) => void;
  socks5Port: number;
  onSocks5PortChange: (port: number) => void;
  isConnected: boolean;
  isConnecting?: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}

export const RoomModal: React.FC<RoomModalProps> = ({
  isOpen,
  onClose,
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
  isConnecting = false,
  onConnect,
  onDisconnect,
}) => {
  if (!isOpen) return null;

  const handleSelectRole = (newRole: AppRole) => {
    onRoleChange(newRole);
    if (newRole === 'host' && (!roomId || !/^[a-zA-Z0-9-]+$/.test(roomId.trim()))) {
      onRoomIdChange(generateRandomRoomCode());
    }
  };

  const handleGenerateRoom = () => {
    onRoomIdChange(generateRandomRoomCode());
  };

  const isRoomCodeValid = /^[a-zA-Z0-9-]+$/.test(roomId.trim());

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          backgroundColor: 'var(--card-bg)',
          border: '1px solid var(--border-default)',
          borderRadius: '10px',
          boxShadow: '0 16px 36px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: 'var(--fg-default)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-default)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--bg-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheckIcon size={20} fill="var(--color-accent)" />
            <span style={{ fontWeight: 600, fontSize: '15px', color: 'var(--fg-default)' }}>
              WebRTC P2P Room & Proxy Settings
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--fg-muted)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <XIcon size={16} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Role Picker */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--fg-default)' }}>Operating Role</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => handleSelectRole('client')}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-default)',
                  cursor: 'pointer',
                  backgroundColor: role === 'client' ? 'var(--btn-primary-bg)' : 'var(--bg-subtle)',
                  color: role === 'client' ? '#ffffff' : 'var(--fg-default)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  fontWeight: role === 'client' ? 600 : 400,
                }}
              >
                <GlobeIcon size={14} />
                Client Browser
              </button>
              <button
                type="button"
                onClick={() => handleSelectRole('host')}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-default)',
                  cursor: 'pointer',
                  backgroundColor: role === 'host' ? 'var(--color-accent)' : 'var(--bg-subtle)',
                  color: role === 'host' ? '#ffffff' : 'var(--fg-default)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  fontWeight: role === 'host' ? 600 : 400,
                }}
              >
                <ServerIcon size={14} />
                Host Server
              </button>
            </div>
          </div>

          {/* Room Code */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--fg-default)' }}>
                Room Code {role === 'client' ? '(Provided by Host)' : '(Custom or Auto-Generated)'}
              </span>
              {role === 'host' && (
                <button
                  type="button"
                  onClick={handleGenerateRoom}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--color-accent)',
                    fontSize: '12px',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Generate Random
                </button>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>
                {SIGNALING_ROOM_PREFIX}
              </span>
              <input
                type="text"
                autoComplete="off"
                value={roomId}
                onChange={(e) => onRoomIdChange(e.target.value.replace(/[^a-zA-Z0-9-]/g, ''))}
                placeholder="0000"
                style={{
                  flex: 1,
                  backgroundColor: 'var(--bg-subtle)',
                  border: isRoomCodeValid ? '1px solid var(--color-success)' : '1px solid var(--border-default)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  color: 'var(--fg-default)',
                  fontSize: '14px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  letterSpacing: '1px',
                  outline: 'none',
                }}
              />
            </div>
            {!isRoomCodeValid && (
              <span style={{ fontSize: '11px', color: 'var(--color-warning)' }}>
                {role === 'client'
                  ? 'Please input a room code (letters, numbers, and hyphens) to join.'
                  : 'Host requires a valid room code (letters, numbers, and hyphens).'}
              </span>
            )}
          </div>

          {/* Password */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--fg-default)' }}>Room Password (Optional)</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder="Leave empty for public or enter key"
              style={{
                backgroundColor: 'var(--bg-subtle)',
                border: '1px solid var(--border-default)',
                borderRadius: '6px',
                padding: '8px 12px',
                color: 'var(--fg-default)',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>

          {/* Advanced options */}
          <details style={{ fontSize: '12px', color: 'var(--fg-muted)' }}>
            <summary style={{ cursor: 'pointer', userSelect: 'none', marginBottom: '8px' }}>Advanced Tunnel Parameters</summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11px', color: 'var(--fg-muted)' }}>Cloudflare Worker Signaling URL</span>
                <input
                  type="text"
                  value={signalingUrl}
                  onChange={(e) => onSignalingUrlChange(e.target.value)}
                  style={{
                    backgroundColor: 'var(--bg-subtle)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    color: 'var(--fg-default)',
                    fontSize: '12px',
                    outline: 'none',
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11px', color: 'var(--fg-muted)' }}>Local SOCKS5 Port</span>
                <input
                  type="number"
                  value={String(socks5Port)}
                  onChange={(e) => onSocks5PortChange(parseInt(e.target.value, 10) || 10808)}
                  style={{
                    backgroundColor: 'var(--bg-subtle)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    color: 'var(--fg-default)',
                    fontSize: '12px',
                    outline: 'none',
                  }}
                />
              </div>
            </div>
          </details>

          {/* Security & Certificate Notice */}
          <div
            style={{
              padding: '12px',
              backgroundColor: 'var(--bg-subtle)',
              border: '1px solid var(--border-default)',
              borderRadius: '6px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-success)' }}>
              ✓ In-App Silent Certificate Bypass Active
            </span>
            <span style={{ fontSize: '11px', color: 'var(--fg-muted)', lineHeight: 1.4 }}>
              Webview launches with <code>--ignore-certificate-errors</code>. No modification to system root certificate store. Clean and zero-privilege.
            </span>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                backgroundColor: 'var(--bg-subtle)',
                border: '1px solid var(--border-default)',
                borderRadius: '6px',
                padding: '6px 14px',
                color: 'var(--fg-default)',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              Close
            </button>
            {isConnected ? (
              <button
                type="button"
                onClick={onDisconnect}
                style={{
                  backgroundColor: 'var(--color-danger)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                Disconnect P2P
              </button>
            ) : (
              <button
                type="button"
                onClick={onConnect}
                disabled={!isRoomCodeValid || isConnecting}
                style={{
                  backgroundColor: isConnecting ? 'var(--bg-inset)' : 'var(--btn-primary-bg)',
                  border: isConnecting ? '1px solid var(--border-default)' : 'none',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  color: isConnecting ? 'var(--fg-muted)' : '#ffffff',
                  cursor: isRoomCodeValid && !isConnecting ? 'pointer' : 'not-allowed',
                  fontSize: '13px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {isConnecting ? (
                  <>
                    <SyncIcon className="spin" size={14} fill="var(--color-accent)" />
                    <span>Connecting... Please wait</span>
                  </>
                ) : (
                  <span>Connect P2P Tunnel</span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
