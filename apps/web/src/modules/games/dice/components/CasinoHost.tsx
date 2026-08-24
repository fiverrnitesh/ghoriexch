import './CasinoHost.css';

export function CasinoHost() {
  return (
    <div className="casino-host" aria-hidden="true">
      <div className="casino-host__backdrop" />
      <div className="casino-host__figure">
        <div className="casino-host__avatar">
          <span className="casino-host__initials">GH</span>
        </div>
        <span className="casino-host__label">Casino Host</span>
      </div>
    </div>
  );
}
