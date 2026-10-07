import React from 'react';
import { XIcon, SyncIcon, CheckCircleFillIcon, AlertIcon, LinkExternalIcon } from '@primer/octicons-react';
import { DownloadTask } from '../types/network';
import { useDownloads } from '../hooks/useDownloads';

interface SidebarDownloadsProps {
  tasks?: DownloadTask[];
  onCancelDownload?: (id: string) => void;
  onRetryDownload?: (id: string) => void;
  onRemoveTask?: (id: string) => void;
  onOpenDownloadsTab?: () => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 B/s';
  return `${formatBytes(bytesPerSec)}/s`;
}

export const SidebarDownloads: React.FC<SidebarDownloadsProps> = (props) => {
  const defaultHook = useDownloads();

  const tasks = props.tasks ?? defaultHook.downloadTasks;
  const onCancelDownload = props.onCancelDownload ?? defaultHook.handleCancelDownload;
  const onRetryDownload = props.onRetryDownload ?? defaultHook.handleRetryDownload;
  const onRemoveTask = props.onRemoveTask ?? defaultHook.handleRemoveTask;
  const onOpenDownloadsTab = props.onOpenDownloadsTab ?? (() => {});
  if (tasks.length === 0) return null;

  const activeCount = tasks.filter((t) => t.status === 'downloading' || t.status === 'pending').length;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '50%',
        minHeight: 120,
        borderTop: '1px solid var(--border-default)',
        backgroundColor: 'var(--bg-subtle)',
        flexShrink: 0,
      }}
    >
      {/* Header with colorful Show All icon */}
      <div
        style={{
          padding: '10px 14px 6px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--fg-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Downloads
          </span>
          {activeCount > 0 && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                backgroundColor: 'var(--color-accent)',
                color: '#ffffff',
                padding: '1px 5px',
                borderRadius: '10px',
              }}
            >
              {activeCount}
            </span>
          )}
        </div>

        {/* Show All Button */}
        <button
          onClick={onOpenDownloadsTab}
          title="Show all downloads in full tab"
          className="sidebar-downloads-show-all-btn"
        >
          <LinkExternalIcon size={12} fill="var(--color-accent)" />
          <span>Show All</span>
        </button>
      </div>

      {/* Task List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '4px 8px 8px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        {tasks.map((task) => {
          const isDownloading = task.status === 'downloading' || task.status === 'pending';
          const isCompleted = task.status === 'completed';
          const isFailed = task.status === 'failed';

          return (
            <div
              key={task.id}
              style={{
                backgroundColor: 'var(--bg-canvas)',
                border: '1px solid var(--border-default)',
                borderRadius: '6px',
                padding: '7px 9px',
                display: 'flex',
                flexDirection: 'column',
                gap: '5px',
                fontSize: '11px',
                position: 'relative',
              }}
            >
              {/* Filename and action button */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                <span
                  title={task.filename}
                  style={{
                    fontWeight: 600,
                    color: 'var(--fg-default)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    flex: 1,
                  }}
                >
                  {task.filename}
                </span>

                {isDownloading ? (
                  <button
                    onClick={() => onCancelDownload(task.id)}
                    title="Cancel download"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '2px',
                      color: 'var(--fg-muted)',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <XIcon size={12} />
                  </button>
                ) : isFailed ? (
                  <button
                    onClick={() => onRetryDownload?.(task.id)}
                    title="Retry download"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '2px',
                      color: 'var(--color-accent)',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <SyncIcon size={12} />
                  </button>
                ) : (
                  <button
                    onClick={() => onRemoveTask?.(task.id)}
                    title="Dismiss"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '2px',
                      color: 'var(--fg-muted)',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <XIcon size={12} />
                  </button>
                )}
              </div>

              {/* Mini Progress Bar */}
              <div
                style={{
                  width: '100%',
                  height: '4px',
                  backgroundColor: 'var(--bg-inset)',
                  borderRadius: '2px',
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

              {/* Status & Stats info line */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  color: 'var(--fg-muted)',
                  fontSize: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {isDownloading ? (
                    <SyncIcon className="spin" size={10} fill="var(--color-accent)" />
                  ) : isCompleted ? (
                    <CheckCircleFillIcon size={10} fill="var(--color-success)" />
                  ) : (
                    <AlertIcon size={10} fill="var(--color-danger)" />
                  )}
                  <span>
                    {isDownloading
                      ? formatSpeed(task.speedBytesPerSec)
                      : isCompleted
                      ? 'Done'
                      : 'Failed'}
                  </span>
                </div>

                <span>
                  {task.totalBytes > 0
                    ? `${formatBytes(task.receivedBytes)} / ${formatBytes(task.totalBytes)}`
                    : formatBytes(task.receivedBytes)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
