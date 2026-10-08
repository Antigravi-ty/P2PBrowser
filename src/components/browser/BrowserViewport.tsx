import React, { useRef, useEffect, useCallback } from 'react';
import { GlobeIcon, LinkExternalIcon } from '@primer/octicons-react';
import { BrowserTab, GoogleProbeResult, AppRole } from '../../types/network';
import { tabWebviewManager } from '../../network/TabWebviewManager';
import { BrowserHome } from './BrowserHome';

interface BrowserViewportProps {
  activeTab: BrowserTab;
  isReadyToBrowse: boolean;
  onNavigate: (url: string) => void;
  onNewTabWithUrl?: (url: string) => void;
  googleResult: GoogleProbeResult | null;
  bypassedGoogle?: boolean;
  role?: AppRole;
}

export const BrowserViewport: React.FC<BrowserViewportProps> = ({
  activeTab,
  isReadyToBrowse,
  onNavigate,
  onNewTabWithUrl,
  googleResult,
  bypassedGoogle = false,
  role = 'client',
}) => {
  const webviewViewportRef = useRef<HTMLDivElement>(null);

  // Synchronize native child webview bounds and tab selection
  const updateWebviewBounds = useCallback((shouldFocus = false) => {
    if (!tabWebviewManager.isTauriRuntime || !isReadyToBrowse || tabWebviewManager.isOverlayOpen) return;

    if (activeTab.url === 'about:blank' || activeTab.url.startsWith('p2p://')) {
      tabWebviewManager.hideAll();
      return;
    }

    const el = webviewViewportRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
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

  if (!tabWebviewManager.isTauriRuntime) {
    // Non-desktop web browser mode fallback
    return (
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
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg-default)' }}>
                {activeTab.title || activeTab.url}
              </div>
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
            <span>Open in External Window</span>
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
    );
  }

  return (
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
        <BrowserHome
          onNavigate={onNavigate}
          onNewTabWithUrl={onNewTabWithUrl}
          googleResult={googleResult}
          bypassedGoogle={bypassedGoogle}
          role={role}
        />
      )}
    </div>
  );
};
