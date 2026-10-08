import React from 'react';
import {
  ShieldCheckIcon,
  CheckCircleFillIcon,
  SyncIcon,
  AlertIcon,
} from '@primer/octicons-react';
import { AppRole, GoogleProbeResult, TunnelState } from '../../types/network';

interface BrowserConnectCardProps {
  role?: AppRole;
  roomCode: string;
  onRoomCodeChange?: (code: string) => void;
  tunnelState: TunnelState;
  signalingProgress?: string;
  isSignalingConnected?: boolean;
  googleResult: GoogleProbeResult | null;
  isCheckingGoogle: boolean;
  onConnectRoom: () => void;
  onCancelConnect?: () => void;
  onRecheckGoogle: () => void;
  onRequestContinueWithoutGoogle: () => void;
  onOpenDashboard?: () => void;
}

export const BrowserConnectCard: React.FC<BrowserConnectCardProps> = ({
  role = 'client',
  roomCode,
  onRoomCodeChange,
  tunnelState,
  signalingProgress,
  isSignalingConnected = false,
  googleResult,
  isCheckingGoogle,
  onConnectRoom,
  onCancelConnect,
  onRecheckGoogle,
  onRequestContinueWithoutGoogle,
  onOpenDashboard,
}) => {
  const isRoomCodeValid = /^[a-zA-Z0-9-]+$/.test((roomCode || '').trim());
  const isConnecting = tunnelState === 'signaling' || tunnelState === 'ice_gathering';

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
                  ? 'Testing Google 204 connectivity via local SOCKS5 proxy...'
                  : googleResult?.success
                  ? `Google 204 Verified (${googleResult.latencyMs}ms)`
                  : googleResult && !googleResult.success
                  ? `Google Check Failed: ${googleResult.message}`
                  : 'Google Connectivity Unchecked'}
              </span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--fg-muted)' }}>
              Ensures host machine can route and relay outbound traffic before opening tabs.
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

  // Client mode connection card
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
                disabled={isConnecting}
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

          {/* Step 2: Signaling Server Channel */}
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

          {/* Step 4: Google 204 Check */}
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

          {/* Bypass Google Verification */}
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
};
