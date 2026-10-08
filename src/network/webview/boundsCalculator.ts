import { getCurrentWindow } from '@tauri-apps/api/window';

export interface WebviewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
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
export async function getTitleBarOffset(): Promise<number> {
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
    console.warn('[BoundsCalculator] Could not detect titlebar offset:', e);
  }

  return 0;
}
