import type { ReactNode } from 'react';
import './Feedback.css';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon = '◇', title, description, action }: EmptyStateProps) {
  return (
    <div className="ds-feedback ds-feedback--empty">
      <div className="ds-feedback__icon" aria-hidden="true">{icon}</div>
      <h3 className="ds-feedback__title">{title}</h3>
      {description && <p className="ds-feedback__desc">{description}</p>}
      {action && <div className="ds-feedback__action">{action}</div>}
    </div>
  );
}

interface LoadingStateProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function LoadingState({ message = 'Loading...', size = 'md' }: LoadingStateProps) {
  return (
    <div className={`ds-feedback ds-feedback--loading ds-feedback--${size}`} role="status">
      <div className="ds-feedback__spinner" aria-hidden="true" />
      <p className="ds-feedback__desc">{message}</p>
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: ErrorStateProps) {
  return (
    <div className="ds-feedback ds-feedback--error" role="alert">
      <div className="ds-feedback__icon ds-feedback__icon--error" aria-hidden="true">!</div>
      <h3 className="ds-feedback__title">{title}</h3>
      <p className="ds-feedback__desc">{message}</p>
      {onRetry && (
        <div className="ds-feedback__action">
          <button type="button" className="ds-feedback__retry" onClick={onRetry}>Try again</button>
        </div>
      )}
    </div>
  );
}
