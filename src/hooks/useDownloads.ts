import { useState, useEffect, useCallback } from 'react';
import { DownloadTask } from '../types/network';
import { downloadManager } from '../network/DownloadManager';

export function useDownloads() {
  const [downloadTasks, setDownloadTasks] = useState<DownloadTask[]>([]);
  const [isDownloadsOpen, setIsDownloadsOpen] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = downloadManager.subscribe((tasks) => {
      setDownloadTasks(tasks);
    });
    return () => unsubscribe();
  }, []);

  const handleStartDownload = useCallback(async (url: string, filename?: string) => {
    try {
      await downloadManager.startDownload(url, filename);
    } catch (e: any) {
      console.error('[useDownloads] Start download error:', e);
    }
  }, []);

  const handleCancelDownload = useCallback((id: string) => {
    downloadManager.cancelDownload(id);
  }, []);

  const handleRetryDownload = useCallback((id: string) => {
    downloadManager.retryDownload(id);
  }, []);

  const handleRemoveTask = useCallback((id: string) => {
    downloadManager.removeTask(id);
  }, []);

  const handleClearCompleted = useCallback(() => {
    downloadManager.clearCompleted();
  }, []);

  const handleOpenFile = useCallback((path?: string) => {
    downloadManager.openFile(path);
  }, []);

  const handleShowInFolder = useCallback((path?: string) => {
    downloadManager.showInFolder(path);
  }, []);

  return {
    downloadTasks,
    isDownloadsOpen,
    setIsDownloadsOpen,
    handleStartDownload,
    handleCancelDownload,
    handleRetryDownload,
    handleRemoveTask,
    handleClearCompleted,
    handleOpenFile,
    handleShowInFolder,
  };
}
