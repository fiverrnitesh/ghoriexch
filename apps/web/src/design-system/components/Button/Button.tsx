import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import './Button.css';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'gold';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: 'ds-btn--primary',
  secondary: 'ds-btn--secondary',
  danger: 'ds-btn--danger',
  gold: 'ds-btn--gold',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    fullWidth,
    loading,
    leftIcon,
    rightIcon,
    className = '',
    children,
    disabled,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      className={[
        'ds-btn',
        variantClass[variant],
        `ds-btn--${size}`,
        fullWidth ? 'ds-btn--full' : '',
        loading ? 'ds-btn--loading' : '',
        className,
      ].filter(Boolean).join(' ')}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <span className="ds-btn__spinner" aria-hidden="true" />}
      {leftIcon && <span className="ds-btn__icon">{leftIcon}</span>}
      <span className="ds-btn__label">{children}</span>
      {rightIcon && <span className="ds-btn__icon">{rightIcon}</span>}
    </button>
  );
});

export const PrimaryButton = forwardRef<HTMLButtonElement, Omit<ButtonProps, 'variant'>>(function PrimaryButton(props, ref) {
  return <Button ref={ref} variant="primary" {...props} />;
});

export const SecondaryButton = forwardRef<HTMLButtonElement, Omit<ButtonProps, 'variant'>>(function SecondaryButton(props, ref) {
  return <Button ref={ref} variant="secondary" {...props} />;
});

export const DangerButton = forwardRef<HTMLButtonElement, Omit<ButtonProps, 'variant'>>(function DangerButton(props, ref) {
  return <Button ref={ref} variant="danger" {...props} />;
});

export const GoldButton = forwardRef<HTMLButtonElement, Omit<ButtonProps, 'variant'>>(function GoldButton(props, ref) {
  return <Button ref={ref} variant="gold" {...props} />;
});
