import type { WalletEnvironment } from '../../account/types';
import './SandboxBanner.css';

export function SandboxBanner({ environment }: { environment: WalletEnvironment | null }) {
  if (!environment?.sandbox) return null;

  return (
    <div className="sandbox-banner" role="alert">
      <span className="sandbox-banner__badge">SANDBOX</span>
      <div className="sandbox-banner__text">
        <strong>Development environment</strong>
        <p>{environment.warning ?? 'All balances are simulated — NOT real money.'}</p>
      </div>
    </div>
  );
}
