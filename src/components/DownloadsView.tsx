import React, { useState } from 'react';
import {
  DownloadIcon,
  SyncIcon,
  CheckCircleFillIcon,
  AlertIcon,
  TrashIcon,
  FileIcon,
  FileDirectoryIcon,
  LinkExternalIcon,
} from '@primer/octicons-react';
import { DownloadTask } from '../types/network';
import { useDownloads } from '../hooks/useDownloads';

interface DownloadsViewProps {
  tasks?: DownloadTask[];
  onStartDownload?: (url: string) => void;
  onCancelDownload?: (id: string) => void;
  onRetryDownload?: (id: string) => void;
  onRemoveTask?: (id: string) => void;
  onClearCompleted?: () => void;
  onOpenFile?: (path?: string) => void;
  onShowInFolder?: (path?: string) => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 B/s';
  return `${formatBytes(bytesPerSec)}/s`;
}

export const DownloadsView: React.FC<DownloadsViewProps> = (props) => {
  const defaultHook = useDownloads();

  const tasks = props.tasks ?? defaultHook.downloadTasks;
  const onStartDownload = props.onStartDownload ?? defaultHook.handleStartDownload;
  const onCancelDownload = props.onCancelDownload ?? defaultHook.handleCancelDownload;
  const onRetryDownload = props.onRetryDownload ?? defaultHook.handleRetryDownload;
  const onRemoveTask = props.onRemoveTask ?? defaultHook.handleRemoveTask;
  const onClearCompleted = props.onClearCompleted ?? defaultHook.handleClearCompleted;
  const onOpenFile = props.onOpenFile ?? defaultHook.handleOpenFile;
  const onShowInFolder = props.onShowInFolder ?? defaultHook.handleShowInFolder;
  const [urlInput, setUrlInput] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  const handleStartSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const u = urlInput.trim();
    if (!u) return;
    onStartDownload(u);
    setUrlInput('');
  };

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'active') return t.status === 'downloading' || t.status === 'pending';
    if (filter === 'completed') return t.status === 'completed';
    return true;
  });

  const activeCount = tasks.filter((t) => t.status === 'downloading' || t.status === 'pending').length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;

  return (
    <div
      style={{
        flex: 1,
        height: '100%',
        backgroundColor: 'var(--bg-canvas)',
        color: 'var(--fg-default)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Top Banner & URL Input */}
      <div
        style={{
          padding: '24px 32px 16px 32px',
          borderBottom: '1px solid var(--border-default)',
          backgroundColor: 'var(--bg-subtle)',
        }}
      >
        <div style={{ maxWidth: 880, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <DownloadIcon size={24} fill="var(--color-accent)" />
              <div>
                <h1 style={{ fontSize: '20px', fontWeight: 600, margin: 0 }}>Downloads Manager</h1>
                <p style={{ fontSize: '12px', color: 'var(--fg-muted)', margin: '2px 0 0 0' }}>
                  Native multi-threaded download engine with automatic tunnel fallback
                </p>
              </div>
            </div>

            {completedCount > 0 && (
              <button
                onClick={onClearCompleted}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  backgroundColor: 'var(--bg-canvas)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '6px',
                  color: 'var(--fg-default)',
                  cursor: 'pointer',
                }}
              >
                <TrashIcon size={14} />
                <span>Clear Completed</span>
              </button>
            )}
          </div>

          {/* Manual URL Input Bar */}
          <form onSubmit={handleStartSubmit} style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="Paste direct download URL (e.g. https://.../file.zip)..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 14px',
                borderRadius: '6px',
                border: '1px solid var(--border-default)',
                backgroundColor: 'var(--bg-canvas)',
                color: 'var(--fg-default)',
                fontSize: '13px',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={!urlInput.trim()}
              style={{
                padding: '8px 18px',
                backgroundColor: urlInput.trim() ? 'var(--btn-primary-bg)' : 'var(--bg-inset)',
                color: urlInput.trim() ? '#ffffff' : 'var(--fg-muted)',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '13px',
                cursor: urlInput.trim() ? 'pointer' : 'default',
              }}
            >
              Start Download
            </button>
          </form>

          {/* Filter Pills */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setFilter('all')}
              style={{
                padding: '4px 12px',
                borderRadius: '16px',
                fontSize: '12px',
                fontWeight: 500,
                border: filter === 'all' ? '1px solid var(--color-accent)' : '1px solid var(--border-default)',
                backgroundColor: filter === 'all' ? 'var(--color-accent-bg)' : 'var(--bg-canvas)',
                color: filter === 'all' ? 'var(--color-accent)' : 'var(--fg-muted)',
                cursor: 'pointer',
              }}
            >
              All ({tasks.length})
            </button>
            <button
              onClick={() => setFilter('active')}
              style={{
                padding: '4px 12px',
                borderRadius: '16px',
                fontSize: '12px',
                fontWeight: 500,
                border: filter === 'active' ? '1px solid var(--color-accent)' : '1px solid var(--border-default)',
                backgroundColor: filter === 'active' ? 'var(--color-accent-bg)' : 'var(--bg-canvas)',
                color: filter === 'active' ? 'var(--color-accent)' : 'var(--fg-muted)',
                cursor: 'pointer',
              }}
            >
              Active ({activeCount})
            </button>
            <button
              onClick={() => setFilter('completed')}
              style={{
                padding: '4px 12px',
                borderRadius: '16px',
                fontSize: '12px',
                fontWeight: 500,
                border: filter === 'completed' ? '1px solid var(--color-accent)' : '1px solid var(--border-default)',
                backgroundColor: filter === 'completed' ? 'var(--color-accent-bg)' : 'var(--bg-canvas)',
                color: filter === 'completed' ? 'var(--color-accent)' : 'var(--fg-muted)',
                cursor: 'pointer',
              }}
            >
              Completed ({completedCount})
            </button>
          </div>
        </div>
      </div>

      {/* Tasks List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        <div style={{ maxWidth: 880, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredTasks.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '64px 20px',
                color: 'var(--fg-muted)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <FileIcon size={40} fill="var(--border-default)" />
              <div style={{ fontSize: '15px', fontWeight: 500 }}>No downloads found</div>
              <div style={{ fontSize: '13px' }}>
                Files downloaded from web pages or added via URL will appear here.
              </div>
            </div>
          ) : (
            filteredTasks.map((task) => {
              const isDownloading = task.status === 'downloading' || task.status === 'pending';
              const isCompleted = task.status === 'completed';
              const isFailed = task.status === 'failed';

              return (
                <div
                  key={task.id}
                  style={{
                    backgroundColor: 'var(--bg-canvas)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '8px',
                    padding: '16px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                      <FileIcon size={20} fill="var(--color-accent)" />
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: '14px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={task.filename}
                        >
                          {task.filename}
                        </div>
                        <div
                          style={{
                            fontSize: '11px',
                            color: 'var(--fg-muted)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: 550,
                          }}
                          title={task.destination || task.url}
                        >
                          {task.destination || task.url}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      {isCompleted && (
                        <>
                          {task.destination && (
                            <>
                              <button
                                onClick={() => onShowInFolder(task.destination)}
                                title="Show in Folder"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '5px 10px',
                                  fontSize: '12px',
                                  borderRadius: '6px',
                                  backgroundColor: 'var(--bg-subtle)',
                                  border: '1px solid var(--border-default)',
                                  color: 'var(--fg-default)',
                                  cursor: 'pointer',
                                }}
                              >
                                <FileDirectoryIcon size={13} />
                                <span>Show in Folder</span>
                              </button>
                              <button
                                onClick={() => onOpenFile(task.destination)}
                                title="Open File"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '5px 10px',
                                  fontSize: '12px',
                                  borderRadius: '6px',
                                  backgroundColor: 'var(--bg-subtle)',
                                  border: '1px solid var(--border-default)',
                                  color: 'var(--fg-default)',
                                  cursor: 'pointer',
                                }}
                              >
                                <LinkExternalIcon size={13} />
                                <span>Open File</span>
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => onRemoveTask(task.id)}
                            title="Remove from list"
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: '5px',
                              cursor: 'pointer',
                              color: 'var(--fg-muted)',
                            }}
                          >
                            <TrashIcon size={14} />
                          </button>
                        </>
                      )}

                      {isDownloading && (
                        <button
                          onClick={() => onCancelDownload(task.id)}
                          style={{
                            padding: '5px 12px',
                            fontSize: '12px',
                            borderRadius: '6px',
                            backgroundColor: 'transparent',
                            border: '1px solid var(--color-danger)',
                            color: 'var(--color-danger)',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                      )}

                      {isFailed && (
                        <>
                          <button
                            onClick={() => onRetryDownload(task.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '5px 12px',
                              fontSize: '12px',
                              borderRadius: '6px',
                              backgroundColor: 'transparent',
                              border: '1px solid var(--color-accent)',
                              color: 'var(--color-accent)',
                              cursor: 'pointer',
                            }}
                          >
                            <SyncIcon size={12} />
                            <span>Retry</span>
                          </button>
                          <button
                            onClick={() => onRemoveTask(task.id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: '5px',
                              cursor: 'pointer',
                              color: 'var(--fg-muted)',
                            }}
                          >
                            <TrashIcon size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div
                    style={{
                      width: '100%',
                      height: '6px',
                      backgroundColor: 'var(--bg-inset)',
                      borderRadius: '3px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${isCompleted ? 100 : Math.min(100, Math.max(0, task.progressPercent))}%`,
                        backgroundColor: isCompleted
                          ? 'var(--color-success)'
                          : isFailed
                          ? 'var(--color-danger)'
                          : 'var(--color-accent)',
                        transition: 'width 0.25s ease',
                      }}
                    />
                  </div>

                  {/* Status Footer */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '12px',
                      color: 'var(--fg-muted)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {isDownloading ? (
                        <>
                          <SyncIcon className="spin" size={13} fill="var(--color-accent)" />
                          <span style={{ color: 'var(--color-accent)', fontWeight: 500 }}>
                            Downloading • {formatSpeed(task.speedBytesPerSec)}
                          </span>
                        </>
                      ) : isCompleted ? (
                        <>
                          <CheckCircleFillIcon size={13} fill="var(--color-success)" />
                          <span style={{ color: 'var(--color-success)', fontWeight: 500 }}>Completed</span>
                        </>
                      ) : (
                        <>
                          <AlertIcon size={13} fill="var(--color-danger)" />
                          <span style={{ color: 'var(--color-danger)', fontWeight: 500 }}>
                            Failed {task.error ? `(${task.error})` : ''}
                          </span>
                        </>
                      )}
                    </div>

                    <div>
                      {task.totalBytes > 0
                        ? `${formatBytes(task.receivedBytes)} / ${formatBytes(task.totalBytes)} (${task.progressPercent}%)`
                        : `${formatBytes(task.receivedBytes)}`}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
