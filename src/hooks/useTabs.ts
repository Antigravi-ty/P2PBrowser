import { useState, useEffect, useCallback } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { BrowserTab, AppRole } from '../types/network';
import { tabWebviewManager } from '../network/TabWebviewManager';

interface UseTabsProps {
  role: AppRole;
  isClientReadyToBrowse: boolean;
  addLog: (level: 'info' | 'warn' | 'error', text: string) => void;
  onOpenNewTabNavigate?: () => void;
}

export function useTabs({
  role,
  isClientReadyToBrowse,
  addLog,
  onOpenNewTabNavigate,
}: UseTabsProps) {
  const [tabs, setTabs] = useState<BrowserTab[]>([
    {
      id: 'tab_default',
      title: 'New Tab',
      url: 'about:blank',
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      isSecured: true,
    },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('tab_default');

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  // Listen for native webview events: tab-state-changed, open-new-tab, start-download
  useEffect(() => {
    if (!isTauri()) return;

    let isMounted = true;
    const unlistenFns: Array<() => void> = [];

    listen<{ label: string; url: string; title: string }>('tab-state-changed', (event) => {
      const payload = event.payload;
      if (!payload || !payload.label) return;
      const safeTabId = payload.label.startsWith('wv_') ? payload.label.slice(3) : payload.label;

      setTabs((prev) =>
        prev.map((t) => {
          const currentSafeId = t.id.replace(/[^a-zA-Z0-9_-]/g, '_');
          if (currentSafeId === safeTabId) {
            // Keep internal tab info intact
            if (t.url.startsWith('p2p://')) return t;

            const nextUrl = payload.url || t.url;
            let nextTitle = t.title;
            const hasNewTitle = Boolean(payload.title && payload.title.trim());

            if (hasNewTitle) {
              nextTitle = payload.title.trim();
            } else if (payload.url && payload.url !== 'about:blank') {
              let isDifferentHost = false;
              try {
                const prevHost = t.url && t.url !== 'about:blank' ? new URL(t.url).hostname : '';
                const newHost = new URL(payload.url).hostname;
                isDifferentHost = prevHost !== newHost;
              } catch (_) {
                isDifferentHost = t.url !== payload.url;
              }
              const hasNoCustomTitle = !nextTitle || nextTitle === 'New Tab';

              if (hasNoCustomTitle || isDifferentHost) {
                try {
                  nextTitle = new URL(payload.url).hostname;
                } catch (_) {
                  if (hasNoCustomTitle) {
                    nextTitle = payload.url;
                  }
                }
              }
            }

            return {
              ...t,
              url: nextUrl,
              title: nextTitle,
              isLoading: hasNewTitle ? false : t.isLoading,
            };
          }
          return t;
        })
      );
    })
      .then((unlisten) => {
        if (!isMounted) unlisten();
        else unlistenFns.push(unlisten);
      })
      .catch((err) => console.warn('[App] Error listening for tab-state-changed:', err));

    listen<{ url: string }>('open-new-tab', (event) => {
      if (event.payload?.url) {
        const u = event.payload.url;
        addLog('info', `[Webview] Opening link in new tab: ${u}`);
        const newId = `tab_${Date.now()}`;
        let title = u;
        try {
          title = new URL(u).hostname;
        } catch (_) {}
        const newTab: BrowserTab = {
          id: newId,
          title,
          url: u,
          isLoading: true,
          canGoBack: false,
          canGoForward: false,
          isSecured: true,
        };
        setTabs((prev) => [...prev, newTab]);
        setActiveTabId(newId);
        onOpenNewTabNavigate?.();
      }
    })
      .then((unlisten) => {
        if (!isMounted) unlisten();
        else unlistenFns.push(unlisten);
      })
      .catch((err) => console.warn('[App] Error listening for open-new-tab:', err));

    return () => {
      isMounted = false;
      for (const u of unlistenFns) u();
    };
  }, [addLog, onOpenNewTabNavigate]);

  const handleNewTab = useCallback(() => {
    const newId = `tab_${Date.now()}`;
    const newTab: BrowserTab = {
      id: newId,
      title: 'New Tab',
      url: 'about:blank',
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      isSecured: true,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
  }, []);

  const handleNewTabWithUrl = useCallback((url: string) => {
    const newId = `tab_${Date.now()}`;
    let title = url;
    if (url === 'about:blank') {
      title = 'New Tab';
    } else {
      try {
        title = new URL(url).hostname;
      } catch (_) {}
    }
    const newTab: BrowserTab = {
      id: newId,
      title,
      url,
      isLoading: url !== 'about:blank',
      canGoBack: false,
      canGoForward: false,
      isSecured: true,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
    onOpenNewTabNavigate?.();
  }, [onOpenNewTabNavigate]);

  const openSettingsTab = useCallback(() => {
    tabWebviewManager.hideAll();
    setTabs((prev) => {
      const existing = prev.find((t) => t.url === 'p2p://settings');
      if (existing) {
        tabWebviewManager.setCurrentInternalTab(existing.id, 'p2p://settings');
        setActiveTabId(existing.id);
        return prev;
      }
      const id = `tab_settings_${Date.now()}`;
      tabWebviewManager.setCurrentInternalTab(id, 'p2p://settings');
      const newTab: BrowserTab = {
        id,
        title: 'Settings',
        url: 'p2p://settings',
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
        isSecured: true,
      };
      setActiveTabId(id);
      return [...prev, newTab];
    });
    onOpenNewTabNavigate?.();
  }, [onOpenNewTabNavigate]);

  const openDownloadsTab = useCallback(() => {
    tabWebviewManager.hideAll();
    setTabs((prev) => {
      const existing = prev.find((t) => t.url === 'p2p://downloads');
      if (existing) {
        tabWebviewManager.setCurrentInternalTab(existing.id, 'p2p://downloads');
        setActiveTabId(existing.id);
        return prev;
      }
      const id = `tab_downloads_${Date.now()}`;
      tabWebviewManager.setCurrentInternalTab(id, 'p2p://downloads');
      const newTab: BrowserTab = {
        id,
        title: 'Downloads',
        url: 'p2p://downloads',
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
        isSecured: true,
      };
      setActiveTabId(id);
      return [...prev, newTab];
    });
    onOpenNewTabNavigate?.();
  }, [onOpenNewTabNavigate]);

  const handleCloseTab = useCallback((id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    // Clean up native Webview if in Tauri runtime
    tabWebviewManager.closeTab(id);

    setTabs((prev) => {
      const nextTabs = prev.filter((t) => t.id !== id);
      if (nextTabs.length === 0) {
        const newId = `tab_${Date.now()}`;
        const freshTab: BrowserTab = {
          id: newId,
          title: 'New Tab',
          url: 'about:blank',
          isLoading: false,
          canGoBack: false,
          canGoForward: false,
          isSecured: true,
        };
        setActiveTabId(newId);
        return [freshTab];
      } else {
        if (activeTabId === id) {
          const closedIdx = prev.findIndex((t) => t.id === id);
          const nextActiveIdx = Math.max(0, closedIdx - 1);
          setActiveTabId(nextTabs[nextActiveIdx].id);
        }
        return nextTabs;
      }
    });
  }, [activeTabId]);

  const handleNavigate = useCallback((url: string) => {
    if (url.startsWith('p2p://')) {
      setTabs((prev) =>
        prev.map((t) => {
          if (t.id === activeTabId) {
            return {
              ...t,
              url,
              title: url === 'p2p://settings' ? 'Settings' : url === 'p2p://downloads' ? 'Downloads' : 'Internal Page',
              isLoading: false,
            };
          }
          return t;
        })
      );
      return;
    }

    if (role === 'client' && !isClientReadyToBrowse && url !== 'about:blank') {
      alert('Please connect to a room, verify Google connectivity, or choose "Continue without Google" before browsing.');
      return;
    }

    setTabs((prev) =>
      prev.map((t) => {
        if (t.id === activeTabId) {
          let title = url;
          if (url === 'about:blank') {
            title = 'New Tab';
          } else {
            try {
              title = new URL(url).hostname;
            } catch (_) {}
          }
          return {
            ...t,
            url,
            title: t.url === url && t.title && t.title !== 'New Tab' ? t.title : title,
            isLoading: url === 'about:blank' ? false : true,
          };
        }
        return t;
      })
    );

    if (url === 'about:blank') return;

    const targetTabId = activeTabId;
    setTimeout(() => {
      setTabs((prev) =>
        prev.map((t) => (t.id === targetTabId ? { ...t, isLoading: false } : t))
      );
    }, 2000);
  }, [activeTabId, isClientReadyToBrowse, role]);

  const handleReload = useCallback(() => {
    if (activeTab.url && activeTab.url !== 'about:blank' && !activeTab.url.startsWith('p2p://')) {
      tabWebviewManager.reloadTab(activeTab.id, activeTab.url);
    }
    handleNavigate(activeTab.url);
  }, [activeTab.id, activeTab.url, handleNavigate]);

  return {
    tabs,
    setTabs,
    activeTabId,
    setActiveTabId,
    activeTab,
    handleNewTab,
    handleNewTabWithUrl,
    openSettingsTab,
    openDownloadsTab,
    handleCloseTab,
    handleNavigate,
    handleReload,
  };
}
