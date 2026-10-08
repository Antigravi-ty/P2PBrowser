import React, { useState, useEffect } from 'react';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  SyncIcon,
  HomeIcon,
  LockIcon,
  DownloadIcon,
  GearIcon,
  CheckCircleFillIcon,
  AlertIcon,
  SunIcon,
  MoonIcon,
  ShieldCheckIcon,
  CodeIcon,
} from '@primer/octicons-react';
import { AppRole, GoogleProbeResult } from '../types/network';
import { tabWebviewManager } from '../network/TabWebviewManager';

interface TopBarProps {
  url: string;
  onNavigate: (url: string) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onReload: () => void;
  isLoading?: boolean;
  googleResult: GoogleProbeResult | null;
  isCheckingGoogle: boolean;
  onRecheckGoogle: () => void;
  bypassedGoogle?: boolean;
  activeDownloadsCount: number;
  onOpenDownloads: () => void;
  onOpenSettings: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  role?: AppRole;
  isClientReadyToBrowse?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  url,
  onNavigate,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  onReload,
  isLoading = false,
  googleResult,
  isCheckingGoogle,
  onRecheckGoogle,
  bypassedGoogle = false,
  activeDownloadsCount,
  onOpenDownloads,
  onOpenSettings,
  theme,
  onToggleTheme,
  role = 'client',
  isClientReadyToBrowse = false,
}) => {
  const [inputUrl, setInputUrl] = useState(url === 'about:blank' ? '' : url);

  useEffect(() => {
    setInputUrl(url === 'about:blank' ? '' : url);
  }, [url]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isClientReadyToBrowse && !bypassedGoogle) {
      alert('Please connect to a room, verify Google connectivity, or choose "Continue without Google" before browsing.');
      return;
    }
    let target = inputUrl.trim();
    if (!target) return;

    if (target.toLowerCase() === 'about:blank' || target.toLowerCase().startsWith('about:')) {
      onNavigate(target.toLowerCase());
      return;
    }

    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      if (target.includes('.') && !target.includes(' ')) {
        target = 'https://' + target;
      } else {
        target = `https://www.google.com/search?q=${encodeURIComponent(target)}`;
      }
    }
    onNavigate(target);
  };

  const isHttps = inputUrl.startsWith('https://');

  return (
    <header
      style={{
        height: 48,
        backgroundColor: 'var(--bg-subtle)',
        borderBottom: '1px solid var(--border-default)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: '8px',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {/* Navigation Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <button
          disabled={!canGoBack}
          onClick={onGoBack}
          title="Back"
          style={{
            background: 'transparent',
            border: 'none',
            color: canGoBack ? 'var(--fg-default)' : 'var(--fg-muted)',
            cursor: canGoBack ? 'pointer' : 'default',
            padding: '6px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <ArrowLeftIcon size={16} />
        </button>

        <button
          disabled={!canGoForward}
          onClick={onGoForward}
          title="Forward"
          style={{
            background: 'transparent',
            border: 'none',
            color: canGoForward ? 'var(--fg-default)' : 'var(--fg-muted)',
            cursor: canGoForward ? 'pointer' : 'default',
            padding: '6px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <ArrowRightIcon size={16} />
        </button>

        <button
          onClick={onReload}
          disabled={isLoading}
          title={isLoading ? 'Loading page...' : 'Reload Page'}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--fg-default)',
            cursor: isLoading ? 'default' : 'pointer',
            padding: '6px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            opacity: isLoading ? 0.6 : 1,
          }}
        >
          <SyncIcon className={isLoading ? 'spin' : ''} size={16} fill={isLoading ? 'var(--color-accent)' : 'currentColor'} />
        </button>

        <button
          onClick={() => onNavigate('about:blank')}
          title="Home"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--fg-default)',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <HomeIcon size={16} />
        </button>

        <button
          onClick={onOpenDownloads}
          title="Downloads Manager"
          style={{
            position: 'relative',
            background: 'transparent',
            border: 'none',
            color: 'var(--fg-default)',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <DownloadIcon size={16} />
          {activeDownloadsCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: 2,
                right: 2,
                backgroundColor: 'var(--color-accent)',
                color: '#ffffff',
                borderRadius: '50%',
                width: 14,
                height: 14,
                fontSize: '9px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {activeDownloadsCount}
            </span>
          )}
        </button>
      </div>

      {/* Address Bar */}
      <form
        onSubmit={handleSubmit}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          minWidth: 200,
        }}
      >
        <div
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'var(--bg-canvas)',
            border: '1px solid var(--border-default)',
            borderRadius: '6px',
            padding: '4px 10px',
            gap: '8px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          }}
        >
          <LockIcon size={14} fill={isHttps ? 'var(--color-success)' : 'var(--fg-muted)'} />
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-gramm="false"
            data-gramm_editor="false"
            data-enable-grammarly="false"
            placeholder={
              !isClientReadyToBrowse && !bypassedGoogle
                ? 'Test Google or connect room to browse...'
                : 'Search with Google or enter address...'
            }
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: 'var(--fg-default)',
              fontSize: '13px',
              outline: 'none',
              width: '100%',
            }}
          />
          {isLoading && (
            <SyncIcon className="spin" size={14} fill="var(--color-accent)" />
          )}
        </div>
      </form>

      {/* Right Action Items */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {/* Google 204 Probe Status Button */}
        <button
          onClick={onRecheckGoogle}
          disabled={isCheckingGoogle}
          title={isCheckingGoogle ? 'Verifying Google connection, please wait...' : 'Click to re-verify Google 204 connectivity'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            border: '1px solid var(--border-default)',
            borderRadius: '6px',
            backgroundColor: 'var(--bg-canvas)',
            color: 'var(--fg-default)',
            fontSize: '12px',
            cursor: isCheckingGoogle ? 'not-allowed' : 'pointer',
            opacity: isCheckingGoogle ? 0.75 : 1,
          }}
        >
          {isCheckingGoogle ? (
            <>
              <SyncIcon className="spin" size={12} fill="var(--color-warning)" />
              <span style={{ color: 'var(--color-warning)', fontWeight: 500 }}>Checking...</span>
            </>
          ) : googleResult?.success ? (
            <>
              <CheckCircleFillIcon size={12} fill="var(--color-success)" />
              <span style={{ color: 'var(--color-success)', fontWeight: 500 }}>
                Google {googleResult.latencyMs}ms
              </span>
            </>
          ) : bypassedGoogle ? (
            <>
              <ShieldCheckIcon size={12} fill="#d97706" />
              <span style={{ color: '#d97706', fontWeight: 500 }}>Google Bypassed</span>
            </>
          ) : (
            <>
              <AlertIcon size={12} fill="var(--color-danger)" />
              <span style={{ color: 'var(--color-danger)' }}>No Google</span>
            </>
          )}
        </button>

        {/* Theme Toggle Button (Light prioritized) */}
        <button
          onClick={onToggleTheme}
          title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
          style={{
            background: 'transparent',
            border: '1px solid var(--border-default)',
            color: 'var(--fg-default)',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'var(--bg-canvas)',
          }}
        >
          {theme === 'light' ? <MoonIcon size={16} /> : <SunIcon size={16} fill="var(--color-warning)" />}
        </button>

        {/* DevTools / Inspect Webview Button */}
        <button
          onClick={() => tabWebviewManager.openDevtools()}
          title="Open Web Inspector / DevTools for active tab"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--fg-muted)',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <CodeIcon size={16} />
        </button>

        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          title="Settings"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--fg-default)',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <GearIcon size={16} />
        </button>
      </div>
    </header>
  );
};
