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

/**
 * Partitions shortcuts into balanced, aesthetically pleasing rows:
 * - 1..3 items: 1 single centered row
 * - 4 items: 2x2 (2 rows of 2 items)
 * - 5 items: 2 rows (2 + 3, balanced and centered)
 * - 6 items: 2x3 (2 rows of 3 items, perfect 3-column grid)
 * - 7 items: 2 rows (3 + 4, balanced and centered)
 * - 8 items: 2x4 (2 rows of 4 items, perfect 4-column grid)
 * - 9 items: 3x3 (3 rows of 3 items)
 * - 10 items: 2x5 (2 rows of 5 items)
 * - Default: split evenly into rows of 3 or 4
 */
export function partitionShortcuts<T>(items: T[]): T[][] {
  const n = items.length;
  if (n === 0) return [];
  if (n <= 3) return [items];
  if (n === 4) return [items.slice(0, 2), items.slice(2, 4)];
  if (n === 5) return [items.slice(0, 2), items.slice(2, 5)];
  if (n === 6) return [items.slice(0, 3), items.slice(3, 6)];
  if (n === 7) return [items.slice(0, 3), items.slice(3, 7)];
  if (n === 8) return [items.slice(0, 4), items.slice(4, 8)];
  if (n === 9) return [items.slice(0, 3), items.slice(3, 6), items.slice(6, 9)];
  if (n === 10) return [items.slice(0, 5), items.slice(5, 10)];
  if (n === 12) return [items.slice(0, 4), items.slice(4, 8), items.slice(8, 12)];

  const perRow = n % 4 === 0 ? 4 : n % 5 === 0 ? 5 : n % 3 === 0 ? 3 : 4;
  const rows: T[][] = [];
  for (let i = 0; i < n; i += perRow) {
    rows.push(items.slice(i, i + perRow));
  }
  return rows;
}

export const BrowserHome: React.FC<BrowserHomeProps> = ({
  onNavigate,
  onNewTabWithUrl,
  googleResult,
  bypassedGoogle = false,
  role = 'client',
}) => {
  const shortcutRows = partitionShortcuts(shortcutsData as ShortcutItem[]);

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

        {/* Quick Launch Bookmarks with Equal Width & Adaptive Row Alignment */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px',
            maxWidth: '640px',
            width: '100%',
            margin: '0 auto',
          }}
        >
          {shortcutRows.map((row, rowIdx) => (
            <div
              key={rowIdx}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: '10px',
                width: '100%',
              }}
            >
              {row.map((link) => (
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
                  className="shortcut-card-btn"
                  style={{
                    width: '150px',
                    height: '40px',
                    padding: '8px 12px',
                    backgroundColor: 'var(--card-bg)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '8px',
                    color: 'var(--fg-default)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                    boxSizing: 'border-box',
                    flexShrink: 0,
                  }}
                >
                  <ShortcutIcon
                    icon={(link as ShortcutItem).icon}
                    iconSvg={(link as any).iconSvg}
                    title={link.title}
                    color={(link as ShortcutItem).color}
                  />
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textAlign: 'left',
                      flex: 1,
                    }}
                  >
                    {link.title}
                  </span>
                </button>
              ))}
            </div>
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
