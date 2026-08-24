import './PlayerSeat.css'

export default function PlayerSeat({
  name,
  chips,
  avatar,
  position,
  isYou = false,
  status,
  dice = [],
  isWinner = false,
  hidden = false,
}) {
  return (
    <div className={`player-seat player-seat--${position} ${isYou ? 'player-seat--you' : ''}`}>
      {isWinner && <div className="winner-ribbon">WINNER</div>}

      <div className="player-seat__top">
        {dice.length > 0 && (
          <div className="player-seat__dice">
            {dice.map((value, index) => (
              <div key={index} className={`mini-die ${hidden ? 'mini-die--hidden' : ''}`}>
                {hidden ? '?' : value}
              </div>
            ))}
          </div>
        )}

        <div className={`player-seat__avatar ${isYou ? 'player-seat__avatar--you' : ''}`}>
          {avatar}
          {status && <span className="player-seat__status">{status}</span>}
        </div>
      </div>

      <div className="player-seat__info">
        <span className="player-seat__name">{name}</span>
        <span className="player-seat__chips">{chips.toLocaleString('en-IN')}</span>
      </div>
    </div>
  )
}
