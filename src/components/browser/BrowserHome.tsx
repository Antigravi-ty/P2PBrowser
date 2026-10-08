import React from 'react';
import { GoogleProbeResult, AppRole } from '../../types/network';
import shortcutsData from '../../config/shortcuts.json';
import { ShortcutIcon, ShortcutItem } from './ShortcutIcon';

interface BrowserHomeProps {
  onNavigate: (url: string) => void;
  onNewTabWithUrl?: (url: string) => void;
  googleResult: GoogleProbeResult | null;
  bypassedGoogle?: boolean;
  role?: AppRole;
}

export const BrowserHome: React.FC<BrowserHomeProps> = ({
  onNavigate,
  onNewTabWithUrl,
  googleResult,
  bypassedGoogle = false,
  role = 'client',
}) => {
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
      }}
    >
      <div
        style={{
          maxWidth: '640px',
          width: '100%',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '48px',
              fontWeight: 700,
              color: 'var(--fg-default)',
              letterSpacing: '-1px',
            }}
          >
            <span style={{ color: '#4285F4' }}>G</span>
            <span style={{ color: '#EA4335' }}>o</span>
            <span style={{ color: '#FBBC05' }}>o</span>
            <span style={{ color: '#4285F4' }}>g</span>
            <span style={{ color: '#34A853' }}>l</span>
            <span style={{ color: '#EA4335' }}>e</span>
          </div>
          <span
            style={{
              fontSize: '13px',
              color: 'var(--fg-muted)',
              marginTop: '4px',
              display: 'block',
            }}
          >
            Browsing via WebRTC SOCKS5 Tunnel • Enhanced Mode Active
          </span>
        </div>

        {/* Quick Launch Bookmarks */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '8px',
            maxWidth: '580px',
            margin: '0 auto',
          }}
        >
          {shortcutsData.map((link) => (
            <button
              key={link.title}
              onClick={(e) => {
                if ((e.metaKey || e.ctrlKey) && onNewTabWithUrl) {
                  onNewTabWithUrl(link.url);
                } else {
                  onNavigate(link.url);
                }
              }}
              title={link.url}
              style={{
                padding: '8px 14px',
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
                transition: 'background-color 0.15s ease',
              }}
            >
              <ShortcutIcon
                icon={(link as ShortcutItem).icon}
                iconSvg={(link as any).iconSvg}
                title={link.title}
                color={(link as ShortcutItem).color}
              />
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
            <span
              style={{
                display: 'block',
                color: 'var(--fg-default)',
                fontWeight: 600,
                fontSize: '13px',
              }}
            >
              {googleResult?.success
                ? `${googleResult.latencyMs}ms`
                : bypassedGoogle
                ? 'Bypassed'
                : 'Unverified'}
            </span>
            <span>Google Status</span>
          </div>
          <div>
            <span
              style={{
                display: 'block',
                color: 'var(--color-success)',
                fontWeight: 600,
                fontSize: '13px',
              }}
            >
              Bypassed (In-App)
            </span>
            <span>MITM Certificate</span>
          </div>
          <div>
            <span
              style={{
                display: 'block',
                color: 'var(--color-accent)',
                fontWeight: 600,
                fontSize: '13px',
              }}
            >
              {role === 'host' ? 'Host Relay' : 'P2P Tunnel'}
            </span>
            <span>Tunnel Mode</span>
          </div>
        </div>
      </div>
    </div>
  );
};
