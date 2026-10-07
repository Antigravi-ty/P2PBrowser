/**
 * src/network/DownloadManager.ts
 * Robust, decoupled download manager.
 * Interacts with Tauri native Rust download engine via events and commands,
 * with standard browser fallback.
 */

import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { DownloadTask } from '../types/network';

export type DownloadUpdateCallback = (tasks: DownloadTask[]) => void;

interface ProgressPayload {
  id: string;
  url: string;
  filename: string;
  destination?: string;
  total_bytes?: number;
  totalBytes?: number;
  received_bytes?: number;
  receivedBytes?: number;
  speed_bytes_per_sec?: number;
  speedBytesPerSec?: number;
  progress_percent?: number;
  progressPercent?: number;
  status?: string;
}

interface CompletedPayload {
  id: string;
  url: string;
  filename: string;
  destination?: string;
  total_bytes?: number;
  totalBytes?: number;
  status?: string;
}

interface FailedPayload {
  id: string;
  url: string;
  filename: string;
  error: string;
  status?: string;
}

export class DownloadManager {
  private tasks: Map<string, DownloadTask> = new Map();
  private listeners: DownloadUpdateCallback[] = [];
  private isInitialized = false;

  constructor() {
    this.initTauriListeners();
  }

  private initTauriListeners() {
    if (this.isInitialized || !isTauri()) return;
    this.isInitialized = true;

    listen<ProgressPayload>('download-task-progress', (event) => {
      const p = event.payload;
      if (!p || !p.id) return;
      const existing = this.tasks.get(p.id);

      const task: DownloadTask = {
        id: p.id,
        url: p.url,
        filename: p.filename || existing?.filename || 'download.bin',
        destination: p.destination || existing?.destination,
        totalBytes: p.total_bytes ?? p.totalBytes ?? existing?.totalBytes ?? 0,
        receivedBytes: p.received_bytes ?? p.receivedBytes ?? existing?.receivedBytes ?? 0,
        speedBytesPerSec: p.speed_bytes_per_sec ?? p.speedBytesPerSec ?? 0,
        progressPercent: Math.round(p.progress_percent ?? p.progressPercent ?? existing?.progressPercent ?? 0),
        status: 'downloading',
        startedAt: existing?.startedAt || Date.now(),
      };
      this.tasks.set(p.id, task);
      this.notify();
    }).catch((err) => console.warn('[DownloadManager] Failed to listen to download-task-progress:', err));

    listen<CompletedPayload>('download-task-completed', (event) => {
      const p = event.payload;
      if (!p || !p.id) return;
      const existing = this.tasks.get(p.id);

      const task: DownloadTask = {
        id: p.id,
        url: p.url,
        filename: p.filename || existing?.filename || 'download.bin',
        destination: p.destination || existing?.destination,
        totalBytes: p.total_bytes ?? p.totalBytes ?? existing?.totalBytes ?? 0,
        receivedBytes: p.total_bytes ?? p.totalBytes ?? existing?.receivedBytes ?? 0,
        speedBytesPerSec: 0,
        progressPercent: 100,
        status: 'completed',
        startedAt: existing?.startedAt || Date.now(),
        finishedAt: Date.now(),
      };
      this.tasks.set(p.id, task);
      this.notify();
    }).catch((err) => console.warn('[DownloadManager] Failed to listen to download-task-completed:', err));

    listen<FailedPayload>('download-task-failed', (event) => {
      const p = event.payload;
      if (!p || !p.id) return;
      const existing = this.tasks.get(p.id);

      const task: DownloadTask = {
        id: p.id,
        url: p.url,
        filename: p.filename || existing?.filename || 'download.bin',
        destination: existing?.destination,
        totalBytes: existing?.totalBytes || 0,
        receivedBytes: existing?.receivedBytes || 0,
        speedBytesPerSec: 0,
        progressPercent: existing?.progressPercent || 0,
        status: 'failed',
        error: p.error || 'Download failed',
        startedAt: existing?.startedAt || Date.now(),
        finishedAt: Date.now(),
      };
      this.tasks.set(p.id, task);
      this.notify();
    }).catch((err) => console.warn('[DownloadManager] Failed to listen to download-task-failed:', err));
  }

  public subscribe(cb: DownloadUpdateCallback): () => void {
    this.listeners.push(cb);
    cb(this.getTasks());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  public getTasks(): DownloadTask[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.startedAt - a.startedAt);
  }

  private notify() {
    const list = this.getTasks();
    for (const cb of this.listeners) {
      cb(list);
    }
  }

  /**
   * Starts a download task via Tauri Rust downloader, or fallback in web mode.
   */
  public async startDownload(targetUrl: string, suggestedFilename?: string): Promise<string> {
    const trimmedUrl = targetUrl.trim();
    if (!trimmedUrl) {
      throw new Error('URL cannot be empty');
    }

    try {
      new URL(trimmedUrl);
    } catch {
      throw new Error('Invalid URL format');
    }

    const filename = suggestedFilename?.trim() || trimmedUrl.split('/').pop()?.split('?')[0] || 'download.bin';
    const id = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const initialTask: DownloadTask = {
      id,
      url: trimmedUrl,
      filename,
      totalBytes: 0,
      receivedBytes: 0,
      speedBytesPerSec: 0,
      progressPercent: 0,
      status: 'pending',
      startedAt: Date.now(),
    };
    this.tasks.set(id, initialTask);
    this.notify();

    if (isTauri()) {
      try {
        const taskId = await invoke<string>('start_download', {
          url: trimmedUrl,
          filename: suggestedFilename || null,
        });
        if (taskId && taskId !== id) {
          // Re-key if Rust returned an internal ID
          this.tasks.delete(id);
          initialTask.id = taskId;
          this.tasks.set(taskId, initialTask);
          this.notify();
          return taskId;
        }
        return id;
      } catch (err: any) {
        initialTask.status = 'failed';
        initialTask.error = String(err?.message || err);
        this.notify();
        throw new Error(initialTask.error);
      }
    } else {
      // Browser fallback
      try {
        initialTask.status = 'downloading';
        this.notify();
        const a = document.createElement('a');
        a.href = trimmedUrl;
        a.download = filename;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        initialTask.status = 'completed';
        initialTask.progressPercent = 100;
        initialTask.finishedAt = Date.now();
        this.notify();
        return id;
      } catch (e: any) {
        initialTask.status = 'failed';
        initialTask.error = e?.message || 'Download failed';
        this.notify();
        throw e;
      }
    }
  }

  public async cancelDownload(id: string): Promise<void> {
    const task = this.tasks.get(id);
    if (!task) return;

    if (isTauri()) {
      try {
        await invoke('cancel_download', { id });
      } catch (e) {
        console.warn(`[DownloadManager] cancel_download error for ${id}:`, e);
      }
    }

    task.status = 'failed';
    task.error = 'Cancelled by user';
    task.finishedAt = Date.now();
    this.notify();
  }

  public async retryDownload(id: string): Promise<void> {
    const task = this.tasks.get(id);
    if (!task) return;
    this.tasks.delete(id);
    this.notify();
    await this.startDownload(task.url, task.filename);
  }

  public removeTask(id: string): void {
    this.tasks.delete(id);
    this.notify();
  }

  public clearCompleted(): void {
    for (const [id, task] of this.tasks.entries()) {
      if (task.status === 'completed' || task.status === 'failed') {
        this.tasks.delete(id);
      }
    }
    this.notify();
  }

  public async openFile(path?: string): Promise<void> {
    if (!path) return;
    if (isTauri()) {
      try {
        await invoke('open_download_file', { path });
      } catch (err) {
        console.error('[DownloadManager] Failed to open file:', err);
        alert(`Cannot open file: ${err}`);
      }
    }
  }

  public async showInFolder(path?: string): Promise<void> {
    if (!path) return;
    if (isTauri()) {
      try {
        await invoke('show_in_folder', { path });
      } catch (err) {
        console.error('[DownloadManager] Failed to show in folder:', err);
        alert(`Cannot show in folder: ${err}`);
      }
    }
  }
}

export const downloadManager = new DownloadManager();
