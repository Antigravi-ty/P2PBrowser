import { useEffect, useCallback } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { AppRole, BrowserTab } from '../types/network';
import { tabWebviewManager } from '../network/TabWebviewManager';
import { useBrowserStore, isInternalPageUrl } from '../store/browserStore';

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
  const tabs = useBrowserStore((state) => state.tabs);
  const activeTabId = useBrowserStore((state) => state.activeTabId);
  const setActiveTabId = useBrowserStore((state) => state.setActiveTabId);
  const newTab = useBrowserStore((state) => state.newTab);
  const closeTab = useBrowserStore((state) => state.closeTab);
  const navigate = useBrowserStore((state) => state.navigate);
  const goBack = useBrowserStore((state) => state.goBack);
  const goForward = useBrowserStore((state) => state.goForward);
  const updateTabFromWebview = useBrowserStore((state) => state.updateTabFromWebview);
  const setTabLoading = useBrowserStore((state) => state.setTabLoading);

  const activeTab: BrowserTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  // Listen for native webview events: tab-state-changed, open-new-tab
  useEffect(() => {
    if (!isTauri()) return;

    let isMounted = true;
    const unlistenFns: Array<() => void> = [];

    listen<{ label: string; url: string; title: string }>('tab-state-changed', (event) => {
      const payload = event.payload;
      if (!payload || !payload.label) return;
      const safeTabId = payload.label.startsWith('wv_') ? payload.label.slice(3) : payload.label;

      // Keep native manager informed of current active URL to prevent duplicate loads
      if (payload.url && payload.url !== 'about:blank') {
        tabWebviewManager.recordActiveUrl(safeTabId, payload.url);
      }

      updateTabFromWebview(safeTabId, payload.url, payload.title);
    })
      .then((unlisten) => {
        if (!isMounted) unlisten();
        else unlistenFns.push(unlisten);
      })
      .catch((err) => console.warn('[useTabs] Error listening for tab-state-changed:', err));

    listen<{ url: string }>('open-new-tab', (event) => {
      if (event.payload?.url) {
        const u = event.payload.url;
        addLog('info', `[Webview] Opening link in new tab: ${u}`);
        newTab(u);
        onOpenNewTabNavigate?.();
      }
    })
      .then((unlisten) => {
        if (!isMounted) unlisten();
        else unlistenFns.push(unlisten);
      })
      .catch((err) => console.warn('[useTabs] Error listening for open-new-tab:', err));

    return () => {
      isMounted = false;
      unlistenFns.forEach((fn) => fn());
    };
  }, [addLog, newTab, onOpenNewTabNavigate, updateTabFromWebview]);

  const handleNewTab = useCallback(() => {
    newTab('about:blank');
    onOpenNewTabNavigate?.();
  }, [newTab, onOpenNewTabNavigate]);

  const handleNewTabWithUrl = useCallback(
    (url: string) => {
      newTab(url);
      onOpenNewTabNavigate?.();
    },
    [newTab, onOpenNewTabNavigate]
  );

  const openSettingsTab = useCallback(() => {
    tabWebviewManager.hideAll();
    const existing = tabs.find((t) => t.url === 'p2p://settings');
    if (existing) {
      setTabLoading(existing.id, false);
      tabWebviewManager.setCurrentInternalTab(existing.id, 'p2p://settings');
      setActiveTabId(existing.id);
    } else {
      const id = newTab('p2p://settings', 'Settings');
      setTabLoading(id, false);
      tabWebviewManager.setCurrentInternalTab(id, 'p2p://settings');
    }
    onOpenNewTabNavigate?.();
  }, [newTab, onOpenNewTabNavigate, setActiveTabId, setTabLoading, tabs]);

  const openDownloadsTab = useCallback(() => {
    tabWebviewManager.hideAll();
    const existing = tabs.find((t) => t.url === 'p2p://downloads');
    if (existing) {
      setTabLoading(existing.id, false);
      tabWebviewManager.setCurrentInternalTab(existing.id, 'p2p://downloads');
      setActiveTabId(existing.id);
    } else {
      const id = newTab('p2p://downloads', 'Downloads');
      setTabLoading(id, false);
      tabWebviewManager.setCurrentInternalTab(id, 'p2p://downloads');
    }
    onOpenNewTabNavigate?.();
  }, [newTab, onOpenNewTabNavigate, setActiveTabId, setTabLoading, tabs]);

  const handleCloseTab = useCallback(
    (id: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      tabWebviewManager.closeTab(id);
      closeTab(id);
    },
    [closeTab]
  );

  const handleNavigate = useCallback(
    (url: string) => {
      const isInternal = isInternalPageUrl(url);

      if (isInternal) {
        tabWebviewManager.hideAll();
        tabWebviewManager.setCurrentInternalTab(activeTabId, url);
        navigate(url, activeTabId);
        setTabLoading(activeTabId, false);
        return;
      }

      if (role === 'client' && !isClientReadyToBrowse && url !== 'about:blank') {
        alert(
          'Please connect to a room, verify Google connectivity, or choose "Continue without Google" before browsing.'
        );
        return;
      }

      navigate(url, activeTabId);

      const targetTabId = activeTabId;
      setTimeout(() => {
        setTabLoading(targetTabId, false);
      }, 2000);
    },
    [activeTabId, isClientReadyToBrowse, navigate, role, setTabLoading]
  );

  const handleGoBack = useCallback(() => {
    const curTab = tabs.find((t) => t.id === activeTabId);
    if (!curTab || !curTab.canGoBack) return;

    const res = goBack(activeTabId);
    if (!res.isBackSuccessful || !res.targetUrl) return;

    if (isInternalPageUrl(res.targetUrl)) {
      tabWebviewManager.hideAll();
      tabWebviewManager.setCurrentInternalTab(activeTabId, res.targetUrl);
      setTabLoading(activeTabId, false);
    } else {
      tabWebviewManager.goBack(activeTabId, res.targetUrl);
    }
  }, [activeTabId, goBack, setTabLoading, tabs]);

  const handleGoForward = useCallback(() => {
    const curTab = tabs.find((t) => t.id === activeTabId);
    if (!curTab || !curTab.canGoForward) return;

    const res = goForward(activeTabId);
    if (!res.isForwardSuccessful || !res.targetUrl) return;

    if (isInternalPageUrl(res.targetUrl)) {
      tabWebviewManager.hideAll();
      tabWebviewManager.setCurrentInternalTab(activeTabId, res.targetUrl);
      setTabLoading(activeTabId, false);
    } else {
      tabWebviewManager.goForward(activeTabId, res.targetUrl);
    }
  }, [activeTabId, goForward, setTabLoading, tabs]);

  const handleReload = useCallback(() => {
    const isInternal = isInternalPageUrl(activeTab.url);
    if (!isInternal) {
      tabWebviewManager.reloadTab(activeTab.id, activeTab.url);
      handleNavigate(activeTab.url);
    } else {
      setTabLoading(activeTab.id, false);
    }
  }, [activeTab.id, activeTab.url, handleNavigate, setTabLoading]);

  return {
    tabs,
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
    handleGoBack,
    handleGoForward,
  };
}
