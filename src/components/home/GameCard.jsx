import { Link } from 'react-router-dom'
import './GameCard.css'

export default function GameCard({ game }) {
  const content = (
    <article className={`game-tile game-tile--${game.theme} ${game.status !== 'live' ? 'game-tile--soon' : ''}`}>
      <div className="game-tile__players">
        <span className="game-tile__players-icon">👤</span>
        {game.players.toLocaleString('en-IN')}
      </div>

      <div className="game-tile__visual" aria-hidden="true">
        <span className="game-tile__emoji">{getThemeEmoji(game.theme)}</span>
      </div>

      <div className="game-tile__footer">
        <h3 className="game-tile__title">{game.name}</h3>
        <p className="game-tile__provider">{game.provider}</p>
      </div>

      {game.status !== 'live' && <span className="game-tile__badge">Coming soon</span>}
    </article>
  )

  if (game.status === 'live') {
    return (
      <Link to={`/play/${game.id}`} className="game-tile-link">
        {content}
      </Link>
    )
  }

  return <div className="game-tile-link game-tile-link--disabled">{content}</div>
}

function getThemeEmoji(theme) {
  const map = {
    'sic-bo': '🎲',
    'dragon-tiger': '🐉',
    aero: '✈️',
    chicken: '🐔',
    'teen-patti': '🃏',
    'teen-patti-gold': '🃏',
    bollywood: '🎬',
    'cards-32': '🂡',
    ludo: '🎯',
    aviator: '🛫',
    mines: '💣',
  }
  return map[theme] ?? '🎮'
}
