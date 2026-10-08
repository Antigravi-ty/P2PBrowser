import React from 'react';
import { AlertIcon, XIcon } from '@primer/octicons-react';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  warningNote?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'primary' | 'danger' | 'warning';
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  description,
  warningNote,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'warning',
  onConfirm,
  onClose,
}) => {
  if (!isOpen) return null;

  const getConfirmBg = () => {
    switch (confirmVariant) {
      case 'danger':
        return 'var(--color-danger)';
      case 'warning':
        return '#d97706';
      case 'primary':
      default:
        return 'var(--btn-primary-bg)';
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3000,
        backdropFilter: 'blur(3px)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          width: '100%',
          maxWidth: '480px',
          backgroundColor: 'var(--card-bg)',
          border: '1px solid var(--border-default)',
          borderRadius: '10px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: 'var(--fg-default)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-default)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--bg-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                backgroundColor: 'rgba(217, 119, 6, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertIcon size={16} fill="#d97706" />
            </div>
            <span style={{ fontWeight: 600, fontSize: '15px', color: 'var(--fg-default)' }}>
              {title}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="btn-ghost"
            style={{
              color: 'var(--fg-muted)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '4px',
            }}
          >
            <XIcon size={16} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5, color: 'var(--fg-default)' }}>
            {description}
          </p>

          {warningNote && (
            <div
              style={{
                padding: '12px 14px',
                backgroundColor: 'var(--bg-subtle)',
                border: '1px solid var(--border-default)',
                borderLeft: '4px solid #d97706',
                borderRadius: '6px',
                fontSize: '12px',
                lineHeight: 1.4,
                color: 'var(--fg-muted)',
              }}
            >
              <strong style={{ color: 'var(--fg-default)', display: 'block', marginBottom: '2px' }}>
                Notice:
              </strong>
              {warningNote}
            </div>
          )}
        </div>

        {/* Actions */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--border-default)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            backgroundColor: 'var(--bg-subtle)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
            style={{
              padding: '7px 14px',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={
              confirmVariant === 'danger'
                ? 'btn-danger-solid'
                : confirmVariant === 'warning'
                ? 'btn-warning-outline'
                : 'btn-primary'
            }
            style={{
              backgroundColor: getConfirmBg(),
              border: 'none',
              borderRadius: '6px',
              padding: '7px 16px',
              color: '#ffffff',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
