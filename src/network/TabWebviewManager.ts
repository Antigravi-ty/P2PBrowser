/**
 * src/network/TabWebviewManager.ts
 * Manages separate, isolated Webview instances for tabs in the desktop Tauri runtime.
 * Under Tauri v2, each active tab is hosted in its own native Webview rather than an iframe,
 * completely bypassing X-Frame-Options and CSP frame-ancestors restrictions.
 *
 * Implements isolated per-tab User Data Folders via native Rust commands
 * to completely resolve Microsoft WebView2 HRESULT 0x8007139F (ERROR_INVALID_STATE)
 * when local SOCKS5 proxies are configured.
 */

import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Webview, getAllWebviews } from '@tauri-apps/api/webview';
import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi';

export interface WebviewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getPlatformUserAgent(): string {
  if (typeof navigator !== 'undefined') {
    const isMac =
      /Macintosh|Mac OS X/i.test(navigator.userAgent) ||
      navigator.platform?.toLowerCase().includes('mac');
    if (isMac) {
      return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    }
    const isLinux =
      /Linux/i.test(navigator.userAgent) ||
      navigator.platform?.toLowerCase().includes('linux');
    if (isLinux) {
      return 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    }
  }
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
}

const DESKTOP_USER_AGENT = getPlatformUserAgent();

class TabWebviewManager {
  private activeWebviews: Map<string, Webview> = new Map();
  private activeUrls: Map<string, string> = new Map();
  private activeProxyPorts: Map<string, number> = new Map();
  private tabQueues: Map<string, Promise<any>> = new Map();
  private currentTabId: string | null = null;
  private isSupported = isTauri();
  private proxyPort: number = 10808;
  private isOverlayActive: boolean = false;
  private currentTheme: 'light' | 'dark' = 'light';
  private lastBounds: WebviewBounds | null = null;

  public get isTauriRuntime(): boolean {
    return this.isSupported;
  }

  public get isOverlayOpen(): boolean {
    return this.isOverlayActive;
  }

  public setOverlayOpen(open: boolean): void {
    this.isOverlayActive = open;
    if (open) {
      console.log('[TabWebviewManager] Overlay/Modal opened: hiding child webviews immediately.');
      this.hideAll();
    } else {
      const currentUrl = this.currentTabId ? this.activeUrls.get(this.currentTabId) : null;
      if (!currentUrl || currentUrl === 'about:blank' || currentUrl.startsWith('p2p://')) {
        this.hideAll();
      } else {
        console.log('[TabWebviewManager] Overlay/Modal closed: restoring current child webview.');
        this.restoreCurrentTab();
      }
    }
  }

  public setCurrentInternalTab(tabId: string, url: string = 'p2p://internal'): void {
    this.currentTabId = tabId;
    this.activeUrls.set(tabId, url);
    this.hideAll();
  }

  public setProxyPort(port: number): void {
    this.proxyPort = port;
  }

  public getProxyUrl(): string {
    return `socks5://127.0.0.1:${this.proxyPort}`;
  }

  /**
   * Updates dark / light theme for child webviews
   */
  public async setTheme(theme: 'light' | 'dark'): Promise<void> {
    this.currentTheme = theme;
    if (!this.isSupported) return;

    const bg: [number, number, number, number] =
      theme === 'dark' ? [13, 17, 23, 255] : [255, 255, 255, 255];

    for (const [id, wv] of this.activeWebviews.entries()) {
      try {
        await wv.setBackgroundColor(bg);
      } catch (e) {
        console.warn(`[TabWebviewManager] Could not set background color for tab ${id}:`, e);
      }
    }
  }

  /**
   * Cleans up any orphan child webviews (e.g. from previous app instances or reloads)
   */
  public async cleanupOrphanWebviews(): Promise<void> {
    if (!this.isSupported) return;
    try {
      const all = await getAllWebviews();
      for (const w of all) {
        if (w.label.startsWith('wv_')) {
          console.log('[TabWebviewManager] Cleaning up lingering child webview:', w.label);
          try {
            await w.close();
          } catch (_) {}
          try {
            await invoke('close_tab_webview', { label: w.label });
          } catch (_) {}
        }
      }
    } catch (e) {
      console.warn('[TabWebviewManager] Error during orphan webview cleanup:', e);
    }
  }

  /**
   * Calculates the native window titlebar decoration height on macOS.
   * Under Tauri v2 with TitleBarStyle::Visible (default), Tauri applies fullsize_content_view(true).
   * As a result, the parent NSView frame spans the entire window height (including under the titlebar).
   * In non-maximized mode, DOM coordinates (0, 0) start below the titlebar, whereas child WKWebViews
   * added directly to the parent NSView treat (0, 0) as the very top of the window (behind the titlebar).
   * This offset shifts the child webview down by the titlebar height so it aligns perfectly with the DOM placeholder.
   * In fullscreen mode, the titlebar is 0px, so offset is 0.
   */
  private async getTitleBarOffset(): Promise<number> {
    if (typeof window === 'undefined') return 0;

    const isMac =
      (typeof navigator !== 'undefined' &&
        (/Macintosh|Mac OS X/i.test(navigator.userAgent) ||
          navigator.platform?.includes('Mac'))) ||
      false;

    if (!isMac) return 0;

    try {
      const appWindow = getCurrentWindow();
      const isFullscreen = await appWindow.isFullscreen().catch(() => false);
      if (isFullscreen) return 0;

      const scaleFactor = await appWindow.scaleFactor().catch(() => window.devicePixelRatio || 1);
      const outerSize = await appWindow.outerSize().catch(() => null);

      if (outerSize && outerSize.height > 0) {
        const outerHeightLogical = outerSize.height / scaleFactor;
        const innerHeightLogical = window.innerHeight;
        const diff = Math.round(outerHeightLogical - innerHeightLogical);
        if (diff > 0 && diff < 100) {
          return diff;
        }
      }

      // WebKit synchronous window metrics fallback
      if (window.outerHeight > window.innerHeight) {
        const diff = Math.round(window.outerHeight - window.innerHeight);
        if (diff > 0 && diff < 100) {
          return diff;
        }
      }
    } catch (e) {
      console.warn('[TabWebviewManager] Could not detect titlebar offset:', e);
    }

    return 0;
  }

  /**
   * Creates a native child webview via Rust command `create_tab_webview`.
   * Explicitly sets per-tab isolated User Data Folder (`data_directory`) in Rust
   * to resolve WebView2 HRESULT 0x8007139F (`ERROR_INVALID_STATE`).
   */
  private async createChildWebview(
    appWindow: any,
    tabId: string,
    safeLabel: string,
    url: string,
    x: number,
    y: number,
    width: number,
    height: number
  ): Promise<Webview> {
    const proxyUrl =
      this.proxyPort && this.proxyPort > 0 ? this.getProxyUrl() : undefined;
    const bgColor: [number, number, number, number] =
      this.currentTheme === 'dark' ? [13, 17, 23, 255] : [255, 255, 255, 255];

    console.log(
      `[TabWebviewManager] Invoking native create_tab_webview for ${tabId} (${safeLabel}) to ${url} (proxy: ${proxyUrl || 'direct'})`
    );

    await invoke('create_tab_webview', {
      windowLabel: appWindow.label || 'main',
      label: safeLabel,
      url: url.startsWith('http') ? url : 'about:blank',
      x,
      y,
      width,
      height,
      proxyUrl: proxyUrl || null,
      darkMode: this.currentTheme === 'dark',
      userAgent: getPlatformUserAgent(),
      backgroundColor: bgColor,
    });

    this.activeProxyPorts.set(tabId, this.proxyPort);

    // Retrieve Webview instance from Tauri
    let wv: Webview | null | undefined;
    for (let attempt = 1; attempt <= 15; attempt++) {
      try {
        wv = await Webview.getByLabel(safeLabel);
        if (wv) break;
      } catch (_) {}
      try {
        const all = await getAllWebviews();
        const found = all.find((w) => w.label === safeLabel);
        if (found) {
          wv = found;
          break;
        }
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 60));
    }

    if (!wv) {
      throw new Error(`Failed to obtain Webview handle for ${safeLabel} after creation`);
    }

    console.log(`[TabWebviewManager] Child webview verified and active: ${safeLabel}`);
    return wv;
  }

  /**
   * Applies position and size with automatic retries to prevent race conditions
   * while Tauri / Rust is asynchronously registering the webview in its internal manager.
   */
  private async applyBoundsWithRetry(
    webview: Webview,
    x: number,
    y: number,
    width: number,
    height: number,
    titleBarOffset = 0,
    maxRetries = 5
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        try {
          await webview.setAutoResize(false);
        } catch (_) {}
        await webview.setSize(new LogicalSize(width, height));
        await webview.setPosition(new LogicalPosition(x, y));

        let nativeMetrics: any = null;
        try {
          const [nPos, nSize] = await Promise.all([
            webview.position(),
            webview.size(),
          ]);
          const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
          nativeMetrics = {
            physical: { x: nPos.x, y: nPos.y, width: nSize.width, height: nSize.height },
            logical: {
              x: Math.round(nPos.x / dpr),
              y: Math.round(nPos.y / dpr),
              width: Math.round(nSize.width / dpr),
              height: Math.round(nSize.height / dpr),
            },
          };
        } catch (_) {}

        console.log(
          '[TabWebviewManager] Successfully applied bounds (attempt ' +
            attempt +
            '): ' +
            JSON.stringify({ x, y, width, height, titleBarOffset, native: nativeMetrics })
        );
        return true;
      } catch (err: any) {
        const errMsg = String(err?.message || err);
        if (errMsg.includes('not found') && attempt < maxRetries) {
          const delay = attempt * 80;
          console.log(
            `[TabWebviewManager] Webview pending registration in backend. Retrying bounds in ${delay}ms...`
          );
          await new Promise((r) => setTimeout(r, delay));
        } else {
          console.warn(
            `[TabWebviewManager] Reposition error on attempt ${attempt}: ${errMsg}`
          );
          if (attempt === maxRetries) return false;
        }
      }
    }
    return false;
  }

  /**
   * Switches to or creates an independent Webview for the given tab.
   * Serialized per tabId to eliminate duplicate creation race conditions.
   */
  public async switchTab(
    tabId: string,
    url: string,
    bounds: WebviewBounds,
    shouldFocus = false,
    forceRecreate = false
  ): Promise<boolean> {
    if (!this.isSupported) {
      return false;
    }

    this.lastBounds = bounds;

    // Serialize operations for this tabId
    const prevQueue = this.tabQueues.get(tabId) || Promise.resolve();
    const currentOp = prevQueue
      .catch(() => {})
      .then(() => this.doSwitchTab(tabId, url, bounds, shouldFocus, forceRecreate));

    this.tabQueues.set(tabId, currentOp);
    return currentOp;
  }

  private async doSwitchTab(
    tabId: string,
    url: string,
    bounds: WebviewBounds,
    shouldFocus: boolean,
    forceRecreate: boolean
  ): Promise<boolean> {
    try {
      const appWindow = getCurrentWindow();
      this.currentTabId = tabId;

      // 1. Hide ALL other tab webviews and move them off-screen
      for (const [id, wv] of this.activeWebviews.entries()) {
        if (id !== tabId) {
          try {
            await wv.hide();
            await wv.setPosition(new LogicalPosition(-10000, -10000));
          } catch (_) {}
        }
      }

      // If URL is about:blank or p2p:// internal page, do not show any child webview (rendered via React DOM)
      if (url === 'about:blank' || url.startsWith('p2p://')) {
        const curWv = this.activeWebviews.get(tabId);
        if (curWv) {
          try {
            await curWv.hide();
            await curWv.setPosition(new LogicalPosition(-10000, -10000));
          } catch (_) {}
        }
        return true;
      }

      let webview = this.activeWebviews.get(tabId);
      const currentUrl = this.activeUrls.get(tabId);
      const prevPort = this.activeProxyPorts.get(tabId);
      const proxyChanged = prevPort !== this.proxyPort;

      const safeTabId = tabId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeLabel = `wv_${safeTabId}`;

      const currentBounds = this.lastBounds || bounds;
      const titleBarOffset = await this.getTitleBarOffset();
      const x = Math.round(currentBounds.x);
      const effectiveY = Math.round(currentBounds.y + titleBarOffset);
      const width = Math.round(Math.max(100, currentBounds.width));
      const height = Math.round(Math.max(100, currentBounds.height));

      // If proxy changed or forceRecreate requested, cleanly destroy existing webview
      if (webview && (forceRecreate || proxyChanged)) {
        try {
          await webview.close();
        } catch (_) {}
        try {
          await invoke('close_tab_webview', { label: safeLabel });
        } catch (_) {}
        this.activeWebviews.delete(tabId);
        this.activeUrls.delete(tabId);
        this.activeProxyPorts.delete(tabId);
        webview = undefined;
      }

      // If webview already exists and URL changed, navigate natively without re-creating
      if (webview && currentUrl !== url) {
        try {
          await invoke('navigate_tab_webview', { label: safeLabel, url });
          this.activeUrls.set(tabId, url);
          console.log(`[TabWebviewManager] Navigated existing webview ${safeLabel} to ${url}`);
        } catch (navErr) {
          console.warn(`[TabWebviewManager] Native navigation failed, recreating webview:`, navErr);
          try {
            await webview.close();
          } catch (_) {}
          try {
            await invoke('close_tab_webview', { label: safeLabel });
          } catch (_) {}
          this.activeWebviews.delete(tabId);
          this.activeUrls.delete(tabId);
          this.activeProxyPorts.delete(tabId);
          webview = undefined;
        }
      }

      // Check if webview already exists in Tauri registry
      if (!webview && !forceRecreate && !proxyChanged) {
        try {
          const existing = await Webview.getByLabel(safeLabel);
          if (existing) {
            webview = existing;
            this.activeWebviews.set(tabId, webview);
            if (currentUrl !== url) {
              await invoke('navigate_tab_webview', { label: safeLabel, url });
              this.activeUrls.set(tabId, url);
            }
          }
        } catch (_) {}
      }

      // If still no webview, create it via Rust create_tab_webview
      if (!webview) {
        try {
          webview = await this.createChildWebview(
            appWindow,
            tabId,
            safeLabel,
            url,
            x,
            effectiveY,
            width,
            height
          );
          this.activeWebviews.set(tabId, webview);
          this.activeUrls.set(tabId, url);
          this.activeProxyPorts.set(tabId, this.proxyPort);
        } catch (createErr) {
          console.error(`[TabWebviewManager] Could not create webview for tab ${tabId}:`, createErr);
          this.activeWebviews.delete(tabId);
          this.activeUrls.delete(tabId);
          this.activeProxyPorts.delete(tabId);
          return false;
        }
      }

      // Apply coordinates and size
      await this.applyBoundsWithRetry(webview, x, effectiveY, width, height, titleBarOffset);

      if (this.isOverlayActive) {
        try {
          await webview.hide();
          await webview.setPosition(new LogicalPosition(-10000, -10000));
        } catch (_) {}
      } else {
        try {
          await webview.show();
          if (shouldFocus) {
            await webview.setFocus();
          }
        } catch (showErr) {
          console.warn('[TabWebviewManager] Failed to show webview: ' + showErr);
        }
      }

      return true;
    } catch (e) {
      console.warn('[TabWebviewManager] Error in doSwitchTab: ' + e);
      return false;
    }
  }

  /**
   * Reloads the given tab via native reload_tab_webview, with fallback to recreation
   */
  public async reloadTab(tabId: string, fallbackUrl?: string): Promise<boolean> {
    if (!this.isSupported) return false;
    const url = fallbackUrl || this.activeUrls.get(tabId);
    if (!url || url === 'about:blank' || url.startsWith('p2p://') || !this.lastBounds) return false;

    const safeTabId = tabId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeLabel = `wv_${safeTabId}`;
    try {
      await invoke('reload_tab_webview', { label: safeLabel });
      console.log(`[TabWebviewManager] Successfully reloaded tab ${tabId} (${safeLabel})`);
      return true;
    } catch (err) {
      console.warn(`[TabWebviewManager] Native reload failed, recreating tab:`, err);
      return this.switchTab(tabId, url, this.lastBounds, true, true);
    }
  }

  /**
   * Sets zoom factor for a webview
   */
  public async setZoom(tabId: string, factor: number): Promise<void> {
    const wv = this.activeWebviews.get(tabId);
    if (wv) {
      try {
        await wv.setZoom(factor);
      } catch (e) {
        console.warn(`[TabWebviewManager] Could not set zoom for tab ${tabId}:`, e);
      }
    }
  }

  /**
   * Clears browsing data for a tab or all tabs
   */
  public async clearBrowsingData(tabId?: string): Promise<void> {
    if (tabId) {
      const wv = this.activeWebviews.get(tabId);
      if (wv) {
        try {
          await wv.clearAllBrowsingData();
        } catch (e) {
          console.warn(`[TabWebviewManager] Could not clear data for tab ${tabId}:`, e);
        }
      }
    } else {
      for (const [id, wv] of this.activeWebviews.entries()) {
        try {
          await wv.clearAllBrowsingData();
        } catch (e) {
          console.warn(`[TabWebviewManager] Could not clear data for tab ${id}:`, e);
        }
      }
    }
  }

  /**
   * Closes the native Webview for a closed tab
   */
  public async closeTab(tabId: string): Promise<void> {
    const prevOp = this.tabQueues.get(tabId) || Promise.resolve();
    const closeOp = prevOp.catch(() => {}).then(async () => {
      const safeTabId = tabId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeLabel = `wv_${safeTabId}`;

      const wv = this.activeWebviews.get(tabId);
      if (wv) {
        try {
          await wv.close();
        } catch (_) {}
        this.activeWebviews.delete(tabId);
        this.activeUrls.delete(tabId);
        this.activeProxyPorts.delete(tabId);
      }

      try {
        await invoke('close_tab_webview', { label: safeLabel });
      } catch (_) {}

      // Ensure any webview matching label pattern is destroyed in Tauri
      try {
        const allWvs = await getAllWebviews();
        for (const w of allWvs) {
          if (w.label === safeLabel || w.label.startsWith(`${safeLabel}_`)) {
            try {
              await w.close();
            } catch (_) {}
          }
        }
      } catch (_) {}

      if (this.currentTabId === tabId) {
        this.currentTabId = null;
      }
    });

    this.tabQueues.set(tabId, closeOp);
    await closeOp;
  }

  /**
   * Hides all managed webviews (e.g. when opening server dashboard or modals)
   */
  public async hideAll(): Promise<void> {
    for (const wv of this.activeWebviews.values()) {
      try {
        await wv.hide();
        await wv.setPosition(new LogicalPosition(-10000, -10000));
      } catch (_) {}
    }
  }

  /**
   * Restores and displays the active webview when all modals and overlays have closed
   */
  public async restoreCurrentTab(): Promise<void> {
    if (this.isOverlayActive || !this.currentTabId) return;
    const url = this.activeUrls.get(this.currentTabId);
    if (!url || url === 'about:blank' || url.startsWith('p2p://')) {
      await this.hideAll();
      return;
    }
    const wv = this.activeWebviews.get(this.currentTabId);
    if (wv) {
      try {
        if (this.lastBounds) {
          const titleBarOffset = await this.getTitleBarOffset();
          await wv.setPosition(
            new LogicalPosition(
              Math.round(this.lastBounds.x),
              Math.round(this.lastBounds.y + titleBarOffset)
            )
          );
          await wv.setSize(
            new LogicalSize(
              Math.round(Math.max(100, this.lastBounds.width)),
              Math.round(Math.max(100, this.lastBounds.height))
            )
          );
        }
        await wv.show();
      } catch (err) {
        console.warn('[TabWebviewManager] Failed to show webview on restore: ' + err);
      }
    }
  }

  /**
   * Opens Developer Tools for the given tab or currently active tab
   */
  public async openDevtools(tabId?: string): Promise<void> {
    if (!this.isSupported) return;
    const targetId = tabId || this.currentTabId;
    if (!targetId) {
      try {
        await invoke('open_devtools');
      } catch (_) {}
      return;
    }
    const safeTabId = targetId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeLabel = `wv_${safeTabId}`;
    try {
      console.log(`[TabWebviewManager] Opening DevTools for tab ${safeLabel}`);
      await invoke('open_devtools', { label: safeLabel });
    } catch (e) {
      console.warn(`[TabWebviewManager] Failed to open devtools for ${safeLabel}:`, e);
      try {
        await invoke('open_devtools');
      } catch (_) {}
    }
  }

  public get activeTabLabel(): string | null {
    if (!this.currentTabId) return null;
    const safeTabId = this.currentTabId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `wv_${safeTabId}`;
  }
}

export const tabWebviewManager = new TabWebviewManager();
