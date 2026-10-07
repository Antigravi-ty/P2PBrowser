/**
 * src/hooks/useAppConfig.ts
 * Self-contained configuration management hook.
 * Persists application preferences to the dedicated Tauri app configuration directory (settings.json),
 * with localStorage fallback in browser environments.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  LogFilterConfig,
  LogFilterCategories,
  DEFAULT_LOG_FILTER_CONFIG,
  getLogFilterConfig,
  setLogFilterConfig,
  subscribeLogFilter,
} from '../utils/logger';

export interface AppConfig {
  logFilter: LogFilterConfig;
}

const STORAGE_KEY = 'p2p_browser_app_config_v1';

export function useAppConfig() {
  const [config, setConfig] = useState<AppConfig>(() => {
    // Safe pure state initialization: read active logger filter config
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.logFilter) {
          return {
            logFilter: {
              filteringEnabled: parsed.logFilter.filteringEnabled ?? DEFAULT_LOG_FILTER_CONFIG.filteringEnabled,
              minLevel: parsed.logFilter.minLevel ?? DEFAULT_LOG_FILTER_CONFIG.minLevel,
              categories: {
                ...DEFAULT_LOG_FILTER_CONFIG.categories,
                ...(parsed.logFilter.categories || {}),
              },
            },
          };
        }
      }
    } catch (_) {}
    return { logFilter: getLogFilterConfig() };
  });

  const [configDir, setConfigDir] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showStatus = useCallback((msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => {
      setStatusMessage(null);
    }, 3000);
  }, []);

  // Sync to disk whenever config changes
  const persistConfig = useCallback((newConfig: AppConfig) => {
    // 1. Update active runtime logger filter
    setLogFilterConfig(newConfig.logFilter);

    // 2. Persist to localStorage
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
    } catch (_) {}

    // 3. Persist to Tauri app config directory (settings.json)
    if (isTauri()) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        setIsSaving(true);
        try {
          await invoke('save_app_config', {
            content: JSON.stringify(newConfig, null, 2),
          });
          showStatus('Configuration saved to disk');
        } catch (err) {
          console.error('[Config] Failed to save settings to disk:', err);
        } finally {
          setIsSaving(false);
        }
      }, 300);
    }
  }, [showStatus]);

  // Initial load from Tauri backend
  useEffect(() => {
    if (!isTauri()) {
      setConfigDir('Browser Local Storage');
      return;
    }

    // Retrieve app config folder path
    invoke<string>('get_app_config_dir')
      .then((dir) => {
        setConfigDir(dir);
      })
      .catch((err) => {
        console.warn('[Config] Failed to get app config dir:', err);
      });

    // Load persisted settings.json
    invoke<string>('load_app_config')
      .then((jsonStr) => {
        if (!jsonStr || jsonStr.trim() === '' || jsonStr.trim() === '{}') {
          // If empty, save default configuration
          persistConfig(config);
          return;
        }
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed && typeof parsed === 'object') {
            const mergedConfig: AppConfig = {
              logFilter: {
                filteringEnabled: parsed.logFilter?.filteringEnabled ?? DEFAULT_LOG_FILTER_CONFIG.filteringEnabled,
                minLevel: parsed.logFilter?.minLevel ?? DEFAULT_LOG_FILTER_CONFIG.minLevel,
                categories: {
                  ...DEFAULT_LOG_FILTER_CONFIG.categories,
                  ...(parsed.logFilter?.categories || {}),
                },
              },
            };
            setConfig(mergedConfig);
            setLogFilterConfig(mergedConfig.logFilter);
          }
        } catch (e) {
          console.warn('[Config] Failed to parse disk settings.json:', e);
        }
      })
      .catch((err) => {
        console.warn('[Config] Failed to load settings from disk:', err);
      });

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  // Listen to external logger filter updates
  useEffect(() => {
    return subscribeLogFilter((updated) => {
      setConfig((prev) => {
        if (JSON.stringify(prev.logFilter) === JSON.stringify(updated)) return prev;
        return { ...prev, logFilter: updated };
      });
    });
  }, []);

  const updateCategory = useCallback(
    (category: keyof LogFilterCategories, enabled: boolean) => {
      setConfig((prev) => {
        const next: AppConfig = {
          ...prev,
          logFilter: {
            ...prev.logFilter,
            categories: {
              ...prev.logFilter.categories,
              [category]: enabled,
            },
          },
        };
        persistConfig(next);
        return next;
      });
    },
    [persistConfig]
  );

  const setFilteringEnabled = useCallback(
    (enabled: boolean) => {
      setConfig((prev) => {
        const next: AppConfig = {
          ...prev,
          logFilter: {
            ...prev.logFilter,
            filteringEnabled: enabled,
          },
        };
        persistConfig(next);
        return next;
      });
    },
    [persistConfig]
  );

  const setMinLevel = useCallback(
    (minLevel: 'all' | 'info' | 'warn' | 'error') => {
      setConfig((prev) => {
        const next: AppConfig = {
          ...prev,
          logFilter: {
            ...prev.logFilter,
            minLevel,
          },
        };
        persistConfig(next);
        return next;
      });
    },
    [persistConfig]
  );

  const applyPreset = useCallback(
    (preset: 'clean' | 'all' | 'mute') => {
      setConfig((prev) => {
        let newCategories: LogFilterCategories;
        if (preset === 'clean') {
          newCategories = { ...DEFAULT_LOG_FILTER_CONFIG.categories };
        } else if (preset === 'all') {
          newCategories = {
            webviewLayout: true,
            socks5: true,
            p2pTunnel: true,
            hostRelay: true,
            probe: true,
            downloads: true,
            tauri: true,
            app: true,
            others: true,
          };
        } else {
          // Mute all
          newCategories = {
            webviewLayout: false,
            socks5: false,
            p2pTunnel: false,
            hostRelay: false,
            probe: false,
            downloads: false,
            tauri: false,
            app: false,
            others: false,
          };
        }
        const next: AppConfig = {
          ...prev,
          logFilter: {
            ...prev.logFilter,
            filteringEnabled: true,
            categories: newCategories,
          },
        };
        persistConfig(next);
        showStatus(`Preset '${preset}' applied`);
        return next;
      });
    },
    [persistConfig, showStatus]
  );

  const openConfigFolder = useCallback(async () => {
    if (!isTauri()) {
      showStatus('Not available in browser environment');
      return;
    }
    try {
      const folderPath = await invoke<string>('open_app_config_folder');
      if (folderPath) {
        setConfigDir(folderPath);
      }
      showStatus('Configuration folder opened');
    } catch (err: any) {
      console.error('[Config] Failed to open config folder:', err);
      showStatus(`Failed to open folder: ${err?.message || err}`);
    }
  }, [showStatus]);

  const reloadFromDisk = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const jsonStr = await invoke<string>('load_app_config');
      if (jsonStr && jsonStr.trim() !== '' && jsonStr.trim() !== '{}') {
        const parsed = JSON.parse(jsonStr);
        const mergedConfig: AppConfig = {
          logFilter: {
            filteringEnabled: parsed.logFilter?.filteringEnabled ?? DEFAULT_LOG_FILTER_CONFIG.filteringEnabled,
            minLevel: parsed.logFilter?.minLevel ?? DEFAULT_LOG_FILTER_CONFIG.minLevel,
            categories: {
              ...DEFAULT_LOG_FILTER_CONFIG.categories,
              ...(parsed.logFilter?.categories || {}),
            },
          },
        };
        setConfig(mergedConfig);
        setLogFilterConfig(mergedConfig.logFilter);
        showStatus('Configuration reloaded from disk');
      }
    } catch (err) {
      console.error('[Config] Error reloading from disk:', err);
      showStatus('Error reloading configuration');
    }
  }, [showStatus]);

  const resetToDefaults = useCallback(() => {
    const next: AppConfig = {
      logFilter: {
        ...DEFAULT_LOG_FILTER_CONFIG,
        categories: { ...DEFAULT_LOG_FILTER_CONFIG.categories },
      },
    };
    setConfig(next);
    persistConfig(next);
    showStatus('Reset to default configuration');
  }, [persistConfig, showStatus]);

  return {
    config,
    configDir,
    isSaving,
    statusMessage,
    updateCategory,
    setFilteringEnabled,
    setMinLevel,
    applyPreset,
    openConfigFolder,
    reloadFromDisk,
    resetToDefaults,
  };
}

export async function initializeGlobalAppConfig(): Promise<void> {
  if (!isTauri()) return;
  try {
    const jsonStr = await invoke<string>('load_app_config');
    if (jsonStr && jsonStr.trim()) {
      const parsed = JSON.parse(jsonStr);
      if (parsed?.logFilter) {
        setLogFilterConfig(
          {
            filteringEnabled: parsed.logFilter.filteringEnabled ?? DEFAULT_LOG_FILTER_CONFIG.filteringEnabled,
            minLevel: parsed.logFilter.minLevel ?? DEFAULT_LOG_FILTER_CONFIG.minLevel,
            categories: {
              ...DEFAULT_LOG_FILTER_CONFIG.categories,
              ...(parsed.logFilter.categories || {}),
            },
          },
          false
        );
      }
    }
  } catch (e) {
    console.warn('[Config] Failed to initialize global config:', e);
  }
}

