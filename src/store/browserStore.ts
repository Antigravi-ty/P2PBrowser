import { create } from 'zustand';
import { BrowserTab } from '../types/network';

interface BrowserStoreState {
  tabs: BrowserTab[];
  activeTabId: string;

  // Actions
  setActiveTabId: (id: string) => void;
  newTab: (initialUrl?: string, customTitle?: string) => string;
  closeTab: (id: string) => void;
  navigate: (url: string, tabId?: string) => { targetUrl: string; previousUrl: string };
  goBack: (tabId?: string) => { targetUrl: string | null; isBackSuccessful: boolean };
  goForward: (tabId?: string) => { targetUrl: string | null; isForwardSuccessful: boolean };
  updateTabFromWebview: (safeTabId: string, url?: string, title?: string) => void;
  setTabLoading: (tabId: string, isLoading: boolean) => void;
  setTabTitle: (tabId: string, title: string) => void;
}

const DEFAULT_TAB: BrowserTab = {
  id: 'tab_default',
  title: 'New Tab',
  url: 'about:blank',
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
  isSecured: true,
  history: ['about:blank'],
  historyIndex: 0,
};

function sanitizeTabId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function areUrlsEquivalent(u1?: string, u2?: string): boolean {
  if (!u1 || !u2) return false;
  if (u1 === u2) return true;
  try {
    const p1 = new URL(u1);
    const p2 = new URL(u2);
    const normPath1 = p1.pathname.replace(/\/$/, '');
    const normPath2 = p2.pathname.replace(/\/$/, '');
    return p1.origin === p2.origin && normPath1 === normPath2 && p1.search === p2.search;
  } catch (_) {
    return u1.replace(/\/$/, '') === u2.replace(/\/$/, '');
  }
}

export const useBrowserStore = create<BrowserStoreState>((set, get) => ({
  tabs: [DEFAULT_TAB],
  activeTabId: 'tab_default',

  setActiveTabId: (id: string) => {
    set({ activeTabId: id });
  },

  newTab: (initialUrl: string = 'about:blank', customTitle?: string): string => {
    const newId = `tab_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    let title = customTitle || 'New Tab';
    if (!customTitle && initialUrl !== 'about:blank') {
      try {
        title = new URL(initialUrl).hostname;
      } catch (_) {
        title = initialUrl;
      }
    }

    const newTab: BrowserTab = {
      id: newId,
      title,
      url: initialUrl,
      isLoading: initialUrl !== 'about:blank',
      canGoBack: false,
      canGoForward: false,
      isSecured: true,
      history: [initialUrl],
      historyIndex: 0,
    };

    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newId,
    }));

    return newId;
  },

  closeTab: (id: string) => {
    set((state) => {
      const remainingTabs = state.tabs.filter((t) => t.id !== id);
      if (remainingTabs.length === 0) {
        const freshTab: BrowserTab = {
          id: `tab_${Date.now()}`,
          title: 'New Tab',
          url: 'about:blank',
          isLoading: false,
          canGoBack: false,
          canGoForward: false,
          isSecured: true,
          history: ['about:blank'],
          historyIndex: 0,
        };
        return {
          tabs: [freshTab],
          activeTabId: freshTab.id,
        };
      }

      let nextActiveId = state.activeTabId;
      if (state.activeTabId === id) {
        const closedIdx = state.tabs.findIndex((t) => t.id === id);
        const nextIdx = Math.max(0, closedIdx - 1);
        nextActiveId = remainingTabs[nextIdx].id;
      }

      return {
        tabs: remainingTabs,
        activeTabId: nextActiveId,
      };
    });
  },

  navigate: (url: string, tabId?: string) => {
    const state = get();
    const targetId = tabId || state.activeTabId;
    const tab = state.tabs.find((t) => t.id === targetId);

    const prevUrl = tab?.url || 'about:blank';
    if (!tab) return { targetUrl: url, previousUrl: prevUrl };

    let title = url;
    if (url === 'about:blank') {
      title = 'New Tab';
    } else if (url === 'p2p://settings') {
      title = 'Settings';
    } else if (url === 'p2p://downloads') {
      title = 'Downloads';
    } else {
      try {
        title = new URL(url).hostname;
      } catch (_) {}
    }

    const currentHistory = tab.history && tab.history.length > 0 ? [...tab.history] : [prevUrl];
    const currentIndex = typeof tab.historyIndex === 'number' ? tab.historyIndex : currentHistory.length - 1;

    // Do not append duplicate consecutive equivalent history entry
    let nextHistory = currentHistory;
    let nextIndex = currentIndex;

    if (!areUrlsEquivalent(currentHistory[currentIndex], url)) {
      nextHistory = currentHistory.slice(0, currentIndex + 1).concat(url);
      nextIndex = nextHistory.length - 1;
    }

    const canGoBack = nextIndex > 0;
    const canGoForward = nextIndex < nextHistory.length - 1;

    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id === targetId) {
          return {
            ...t,
            url,
            title: t.url === url && t.title && t.title !== 'New Tab' ? t.title : title,
            isLoading: url !== 'about:blank' && !url.startsWith('p2p://'),
            canGoBack,
            canGoForward,
            history: nextHistory,
            historyIndex: nextIndex,
          };
        }
        return t;
      }),
    }));

    return { targetUrl: url, previousUrl: prevUrl };
  },

  goBack: (tabId?: string) => {
    const state = get();
    const targetId = tabId || state.activeTabId;
    const tab = state.tabs.find((t) => t.id === targetId);

    if (!tab || !tab.history || tab.history.length === 0) {
      return { targetUrl: null, isBackSuccessful: false };
    }

    const currentIndex = typeof tab.historyIndex === 'number' ? tab.historyIndex : 0;
    if (currentIndex <= 0) {
      return { targetUrl: null, isBackSuccessful: false };
    }

    const nextIndex = currentIndex - 1;
    const targetUrl = tab.history[nextIndex];
    const canGoBack = nextIndex > 0;
    const canGoForward = nextIndex < tab.history.length - 1;

    let nextTitle = targetUrl;
    if (targetUrl === 'about:blank') {
      nextTitle = 'New Tab';
    } else if (targetUrl === 'p2p://settings') {
      nextTitle = 'Settings';
    } else if (targetUrl === 'p2p://downloads') {
      nextTitle = 'Downloads';
    } else {
      try {
        nextTitle = new URL(targetUrl).hostname;
      } catch (_) {}
    }

    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id === targetId) {
          return {
            ...t,
            url: targetUrl,
            title: nextTitle,
            isLoading: targetUrl !== 'about:blank' && !targetUrl.startsWith('p2p://'),
            historyIndex: nextIndex,
            canGoBack,
            canGoForward,
          };
        }
        return t;
      }),
    }));

    return { targetUrl, isBackSuccessful: true };
  },

  goForward: (tabId?: string) => {
    const state = get();
    const targetId = tabId || state.activeTabId;
    const tab = state.tabs.find((t) => t.id === targetId);

    if (!tab || !tab.history || tab.history.length === 0) {
      return { targetUrl: null, isForwardSuccessful: false };
    }

    const currentIndex = typeof tab.historyIndex === 'number' ? tab.historyIndex : 0;
    if (currentIndex >= tab.history.length - 1) {
      return { targetUrl: null, isForwardSuccessful: false };
    }

    const nextIndex = currentIndex + 1;
    const targetUrl = tab.history[nextIndex];
    const canGoBack = nextIndex > 0;
    const canGoForward = nextIndex < tab.history.length - 1;

    let nextTitle = targetUrl;
    if (targetUrl === 'about:blank') {
      nextTitle = 'New Tab';
    } else if (targetUrl === 'p2p://settings') {
      nextTitle = 'Settings';
    } else if (targetUrl === 'p2p://downloads') {
      nextTitle = 'Downloads';
    } else {
      try {
        nextTitle = new URL(targetUrl).hostname;
      } catch (_) {}
    }

    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id === targetId) {
          return {
            ...t,
            url: targetUrl,
            title: nextTitle,
            isLoading: targetUrl !== 'about:blank' && !targetUrl.startsWith('p2p://'),
            historyIndex: nextIndex,
            canGoBack,
            canGoForward,
          };
        }
        return t;
      }),
    }));

    return { targetUrl, isForwardSuccessful: true };
  },

  updateTabFromWebview: (safeTabId: string, url?: string, title?: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => {
        const currentSafeId = sanitizeTabId(t.id);
        if (currentSafeId !== safeTabId) return t;

        // Internal page tabs ignore external webview callbacks
        if (t.url.startsWith('p2p://')) return t;

        const nextUrl = url && url !== 'about:blank' ? url : t.url;
        let nextTitle = t.title;
        const hasTitle = Boolean(title && title.trim());

        if (hasTitle) {
          nextTitle = title!.trim();
        } else if (url && url !== 'about:blank') {
          try {
            nextTitle = new URL(url).hostname;
          } catch (_) {
            if (!nextTitle || nextTitle === 'New Tab') nextTitle = url;
          }
        }

        // Synchronize history if URL changed from webview navigation
        let currentHistory = t.history && t.history.length > 0 ? [...t.history] : [t.url];
        let currentIndex = typeof t.historyIndex === 'number' ? t.historyIndex : currentHistory.length - 1;

        if (url && url !== 'about:blank' && !areUrlsEquivalent(url, t.url)) {
          if (currentIndex > 0 && areUrlsEquivalent(currentHistory[currentIndex - 1], url)) {
            // User navigated back inside webview
            currentIndex -= 1;
          } else if (currentIndex < currentHistory.length - 1 && areUrlsEquivalent(currentHistory[currentIndex + 1], url)) {
            // User navigated forward inside webview
            currentIndex += 1;
          } else if (!areUrlsEquivalent(currentHistory[currentIndex], url)) {
            // New navigation inside webview
            currentHistory = currentHistory.slice(0, currentIndex + 1).concat(url);
            currentIndex = currentHistory.length - 1;
          }
        }

        const canGoBack = currentIndex > 0;
        const canGoForward = currentIndex < currentHistory.length - 1;

        return {
          ...t,
          url: nextUrl,
          title: nextTitle,
          isLoading: hasTitle ? false : t.isLoading,
          history: currentHistory,
          historyIndex: currentIndex,
          canGoBack,
          canGoForward,
        };
      }),
    }));
  },

  setTabLoading: (tabId: string, isLoading: boolean) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, isLoading } : t)),
    }));
  },

  setTabTitle: (tabId: string, title: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, title } : t)),
    }));
  },
}));
