import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './Toast.css';

type ToastVariant = 'info' | 'success' | 'warning' | 'error';

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {createPortal(
        <div className="ds-toast-container" aria-live="polite">
          {toasts.map((t) => (
            <Toast key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  return (
    <div className={`ds-toast ds-toast--${item.variant}`} role="status">
      <span className="ds-toast__message">{item.message}</span>
      <button type="button" className="ds-toast__close" onClick={onDismiss} aria-label="Dismiss">×</button>
    </div>
  );
}

/** Standalone notification card (in-page, not toast) */
export interface NotificationProps {
  title: string;
  body: string;
  type?: 'system' | 'wallet' | 'game' | 'security';
  unread?: boolean;
  timestamp?: string;
  onRead?: () => void;
}

export function Notification({ title, body, type = 'system', unread, timestamp, onRead }: NotificationProps) {
  return (
    <article className={`ds-notification ${unread ? 'ds-notification--unread' : ''}`}>
      <div className="ds-notification__header">
        <span className={`ds-badge ds-badge--${type === 'game' ? 'gold' : type === 'security' ? 'danger' : 'muted'}`}>
          {type}
        </span>
        {timestamp && <time className="ds-notification__time">{timestamp}</time>}
      </div>
      <h4 className="ds-notification__title">{title}</h4>
      <p className="ds-notification__body">{body}</p>
      {unread && onRead && (
        <button type="button" className="ds-notification__read" onClick={onRead}>Mark read</button>
      )}
    </article>
  );
}
