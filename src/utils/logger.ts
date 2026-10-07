/**
 * src/utils/logger.ts
 * Centralized logging utility, circular memory buffer, and global console interceptor.
 * - Captures ALL console outputs (logger & native third-party logs) with origin client timestamps.
 * - Maintains a 2,000-entry ring buffer for diagnostic export and clipboard copying.
 * - Dynamic console filtering for clean developer devtools workspace without losing buffered logs.
 * - Completely decoupled: initialization does not trigger cross-component React state updates.
 */

export interface LogFilterCategories {
  webviewLayout: boolean; // [WebviewLayout], [TabWebviewManager]
  socks5: boolean;        // [SOCKS5], [ClientSOCKS5]
  p2pTunnel: boolean;     // [P2PWebRTCTunnel], [WebSocketSignalingClient]
  hostRelay: boolean;     // [Host], [HostRelay]
  probe: boolean;         // [ConnectivityProbe]
  downloads: boolean;     // [Download], [DownloadManager], [WebviewDownload]
  tauri: boolean;         // [TAURI]
  app: boolean;           // [App]
  others: boolean;        // Uncategorized console logs
}

export interface LogFilterConfig {
  filteringEnabled: boolean;
  minLevel: 'all' | 'info' | 'warn' | 'error';
  categories: LogFilterCategories;
}

export interface LogEntry {
  id: number;
  timestamp: string; // ISO-8601 UTC timestamp, strictly recorded at log emission time
  level: 'debug' | 'log' | 'info' | 'warn' | 'error';
  category: keyof LogFilterCategories;
  message: string;
  source?: 'client' | 'host';
}

export const DEFAULT_LOG_FILTER_CONFIG: LogFilterConfig = {
  filteringEnabled: true,
  minLevel: 'all',
  categories: {
    webviewLayout: false, // Default muted: prevents viewport bounds & layout measurement spam
    tauri: false,         // Default muted: prevents Tauri internal callback warnings
    socks5: true,
    p2pTunnel: true,
    hostRelay: true,
    probe: true,
    downloads: true,
    app: true,
    others: true,
  },
};

const STORAGE_KEY = 'p2p_browser_app_config_v1';

// Synchronously load initial config from localStorage without triggering React subscribers
function loadInitialConfig(): LogFilterConfig {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.logFilter) {
          return {
            filteringEnabled: parsed.logFilter.filteringEnabled ?? DEFAULT_LOG_FILTER_CONFIG.filteringEnabled,
            minLevel: parsed.logFilter.minLevel ?? DEFAULT_LOG_FILTER_CONFIG.minLevel,
            categories: {
              ...DEFAULT_LOG_FILTER_CONFIG.categories,
              ...(parsed.logFilter.categories || {}),
            },
          };
        }
      }
    }
  } catch (_) {}
  return { ...DEFAULT_LOG_FILTER_CONFIG, categories: { ...DEFAULT_LOG_FILTER_CONFIG.categories } };
}

let activeConfig: LogFilterConfig = loadInitialConfig();
const filterSubscribers = new Set<(config: LogFilterConfig) => void>();

export function getLogFilterConfig(): LogFilterConfig {
  return JSON.parse(JSON.stringify(activeConfig));
}

export function setLogFilterConfig(config: LogFilterConfig, notify = true): void {
  activeConfig = JSON.parse(JSON.stringify(config));
  if (notify) {
    filterSubscribers.forEach((fn) => {
      try {
        fn(activeConfig);
      } catch (_) {}
    });
  }
}

export function subscribeLogFilter(callback: (config: LogFilterConfig) => void): () => void {
  filterSubscribers.add(callback);
  return () => {
    filterSubscribers.delete(callback);
  };
}

const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
};

// Regex detecting existing ISO-8601 absolute timestamp prefix: e.g. [2026-10-06T03:45:00.123Z]
const ISO_TIMESTAMP_REGEX = /^\s*\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\]/;

export function getIsoTimestamp(): string {
  return `[${new Date().toISOString()}]`;
}

export function detectCategory(args: any[]): keyof LogFilterCategories {
  const text = args
    .map((a) => {
      if (typeof a === 'string') return a;
      if (typeof a === 'object' && a !== null) {
        try {
          return JSON.stringify(a);
        } catch (_) {
          return String(a);
        }
      }
      return String(a);
    })
    .join(' ');

  if (text.includes('[WebviewLayout]') || text.includes('[TabWebviewManager]')) return 'webviewLayout';
  if (text.includes('[SOCKS5]') || text.includes('[ClientSOCKS5]')) return 'socks5';
  if (text.includes('[P2PWebRTCTunnel]') || text.includes('[WebSocketSignalingClient]')) return 'p2pTunnel';
  if (text.includes('[Host]') || text.includes('[HostRelay]')) return 'hostRelay';
  if (text.includes('[ConnectivityProbe]')) return 'probe';
  if (
    text.includes('[Download]') ||
    text.includes('[DownloadManager]') ||
    text.includes('[WebviewDownload]')
  )
    return 'downloads';
  if (text.includes('[TAURI]')) return 'tauri';
  if (text.includes('[App]')) return 'app';

  return 'others';
}

const LEVEL_WEIGHT: Record<'debug' | 'log' | 'info' | 'warn' | 'error', number> = {
  debug: 0,
  log: 1,
  info: 2,
  warn: 3,
  error: 4,
};

const MIN_LEVEL_WEIGHT: Record<'all' | 'info' | 'warn' | 'error', number> = {
  all: 0,
  info: 2,
  warn: 3,
  error: 4,
};

function shouldPrint(level: 'debug' | 'log' | 'info' | 'warn' | 'error', args: any[]): boolean {
  if (!activeConfig.filteringEnabled) return true;

  // Level filter
  const currentWeight = LEVEL_WEIGHT[level];
  const requiredWeight = MIN_LEVEL_WEIGHT[activeConfig.minLevel];
  if (currentWeight < requiredWeight) {
    return false;
  }

  // Category filter
  const category = detectCategory(args);
  return activeConfig.categories[category] !== false;
}

// Circular in-memory log buffer (preserves up to 2000 log entries)
const MAX_LOG_BUFFER_SIZE = 2000;
const logBuffer: LogEntry[] = [];
let nextLogId = 1;
const logBufferSubscribers = new Set<(entry: LogEntry) => void>();

function stringifyArgs(args: any[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack || ''}`;
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg);
        } catch (_) {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(' ');
}

let isIntercepting = false;

function recordToBuffer(
  level: 'debug' | 'log' | 'info' | 'warn' | 'error',
  timestampStr: string,
  category: keyof LogFilterCategories,
  message: string,
  source: 'client' | 'host' = 'client'
): LogEntry {
  const entry: LogEntry = {
    id: nextLogId++,
    timestamp: timestampStr,
    level,
    category,
    message,
    source,
  };

  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOG_BUFFER_SIZE) {
    logBuffer.shift();
  }

  logBufferSubscribers.forEach((cb) => {
    try {
      cb(entry);
    } catch (_) {}
  });

  return entry;
}

export function subscribeLogBuffer(callback: (entry: LogEntry) => void): () => void {
  logBufferSubscribers.add(callback);
  return () => {
    logBufferSubscribers.delete(callback);
  };
}

export function getBufferedLogs(): LogEntry[] {
  return [...logBuffer];
}

export function appendRemoteLog(entry: Omit<LogEntry, 'id'>): void {
  recordToBuffer(
    entry.level,
    entry.timestamp,
    entry.category,
    entry.message,
    entry.source || 'client'
  );
}

export function getFormattedLogsText(): string {
  return logBuffer
    .map((e) => {
      const srcPrefix = e.source && e.source !== 'client' ? `[${e.source.toUpperCase()}] ` : '';
      return `[${e.timestamp}] [${e.level}] ${srcPrefix}${e.message}`;
    })
    .join('\n');
}

export async function copyLogsToClipboard(): Promise<{ success: boolean; count: number }> {
  const text = getFormattedLogsText();
  const count = logBuffer.length;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return { success: true, count };
    }
  } catch (_) {}

  // Fallback using textarea execCommand
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'absolute';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    if (ok) return { success: true, count };
  } catch (_) {}

  return { success: false, count };
}

export function clearLogBuffer(): void {
  logBuffer.length = 0;
}

export function exportDiagnosticsFile(extraInfo?: Record<string, any>): void {
  const commitHash = typeof __APP_COMMIT_HASH__ !== 'undefined' ? __APP_COMMIT_HASH__ : 'dev';
  const buildTime = typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : new Date().toISOString();
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-');

  let header = '='.repeat(80) + '\n';
  header += `P2P BROWSER DIAGNOSTIC LOG REPORT\n`;
  header += `Commit ID: ${commitHash}\n`;
  header += `Build Timestamp: ${buildTime}\n`;
  header += `Report Generated: ${new Date().toISOString()}\n`;
  header += `Total Buffered Logs: ${logBuffer.length}\n`;
  if (extraInfo) {
    header += `Runtime Diagnostics:\n`;
    for (const [k, v] of Object.entries(extraInfo)) {
      header += `  - ${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}\n`;
    }
  }
  header += '='.repeat(80) + '\n\n';

  const fullReport = header + getFormattedLogsText();
  try {
    const blob = new Blob([fullReport], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `p2p-browser-diagnostic-${commitHash}-${dateStr}.log`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('[Logger] Failed to export diagnostic log file:', err);
  }
}

function wrapLogMethod(level: 'log' | 'info' | 'warn' | 'error' | 'debug') {
  const original = originalConsole[level];
  console[level] = function (...args: any[]) {
    if (isIntercepting) {
      original(...args);
      return;
    }

    isIntercepting = true;
    try {
      let rawTimestamp = '';
      let cleanArgs = [...args];

      if (cleanArgs.length > 0 && typeof cleanArgs[0] === 'string') {
        const match = cleanArgs[0].match(ISO_TIMESTAMP_REGEX);
        if (match) {
          rawTimestamp = match[1];
        }
      }

      if (!rawTimestamp) {
        rawTimestamp = new Date().toISOString();
      }

      const category = detectCategory(cleanArgs);
      const fullMessage = stringifyArgs(cleanArgs);

      // Record to internal circular buffer regardless of console mute filter
      recordToBuffer(level, rawTimestamp, category, fullMessage, 'client');

      // Console output filtering (only print to DevTools console if category & level enabled)
      if (shouldPrint(level, cleanArgs)) {
        const formattedTimestamp = `[${rawTimestamp}]`;
        if (cleanArgs.length === 0) {
          original(formattedTimestamp);
        } else {
          const first = cleanArgs[0];
          if (typeof first === 'string') {
            if (ISO_TIMESTAMP_REGEX.test(first)) {
              original(...cleanArgs);
            } else {
              original(`${formattedTimestamp} ${first}`, ...cleanArgs.slice(1));
            }
          } else {
            original(formattedTimestamp, ...cleanArgs);
          }
        }
      }
    } finally {
      isIntercepting = false;
    }
  };
}

wrapLogMethod('log');
wrapLogMethod('info');
wrapLogMethod('warn');
wrapLogMethod('error');
wrapLogMethod('debug');

export { originalConsole };
