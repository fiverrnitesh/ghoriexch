import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { SecondaryButton, DangerButton, GoldButton } from '../Button/Button';
import './Modal.css';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="ds-modal-overlay" onClick={onClose} role="presentation">
      <div
        className={`ds-modal ds-modal--${size} ds-panel ds-panel--chrome`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'ds-modal-title' : undefined}
      >
        {title && (
          <div className="ds-modal__header ds-panel__header">
            <h2 id="ds-modal-title" className="ds-panel__title">{title}</h2>
            <button type="button" className="ds-modal__close" onClick={onClose} aria-label="Close">×</button>
          </div>
        )}
        <div className="ds-modal__body ds-panel__body">{children}</div>
        {footer && <div className="ds-modal__footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'gold';
  loading?: boolean;
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'gold',
  loading,
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <div className="ds-modal__actions">
          <SecondaryButton onClick={onClose} disabled={loading}>{cancelLabel}</SecondaryButton>
          {variant === 'danger' ? (
            <DangerButton onClick={onConfirm} loading={loading}>{confirmLabel}</DangerButton>
          ) : (
            <GoldButton onClick={onConfirm} loading={loading}>{confirmLabel}</GoldButton>
          )}
        </div>
      }
    >
      <p className="ds-modal__message">{message}</p>
    </Modal>
  );
}
