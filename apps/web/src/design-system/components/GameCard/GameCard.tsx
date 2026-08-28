import { Link } from 'react-router-dom';
import './GameCard.css';

export interface GameCardData {
  id: string;
  slug: string;
  name: string;
  provider?: string | null;
  status: string;
  category?: string | null;
  playerCount?: number;
  image?: string | null;
}

export interface GameCardProps {
  game: GameCardData;
  theme?: string;
  disabled?: boolean;
  href?: string;
}

const THEME_GRADIENTS: Record<string, string> = {
  popular: 'ds-game-card--crimson',
  'indian-cards': 'ds-game-card--emerald',
  crash: 'ds-game-card--magenta',
  pool: 'ds-game-card--blue',
  roulette: 'ds-game-card--gold',
  default: 'ds-game-card--default',
};

const EMOJI: Record<string, string> = {
  dice: '🎲',
  'sic-bo': '🎲',
  ludo: '🎲',
  '8-pool': '🎱',
  pool: '🎱',
  aviator: '✈️',
  mines: '💎',
  'dragon-tiger': '🐉',
  'teen-patti-1day': '🃏',
  '32-cards': '🂱',
};

export function GameCard({ game, theme, disabled, href }: GameCardProps) {
  const isActive = game.status === 'ACTIVE' && !disabled;
  const themeClass = theme ?? THEME_GRADIENTS[game.category ?? ''] ?? THEME_GRADIENTS.default;
  const emoji = EMOJI[game.slug] ?? '🎰';
  const isGhori = game.slug === 'dice' || game.slug === 'ghori';

  const card = (
    <article className={`ds-game-card ${themeClass} ${!isActive ? 'ds-game-card--disabled' : ''}`}>
      {game.playerCount !== undefined && game.playerCount > 0 && (
        <span className="ds-game-card__live">
          <span className="ds-game-card__live-dot" />
          {game.playerCount.toLocaleString()}
        </span>
      )}
      <div className="ds-game-card__visual">
        {isGhori ? (
          <img src="/images/ghori-dice.svg" alt={game.name} className="ds-game-card__svg-icon" />
        ) : game.image ? (
          <img src={game.image} alt={game.name} className="ds-game-card__svg-icon" />
        ) : (
          <span className="ds-game-card__emoji">{emoji}</span>
        )}
      </div>
      {!isActive && (
        <span className="ds-game-card__badge">
          {game.status === 'MAINTENANCE' ? 'Maintenance' : 'Coming Soon'}
        </span>
      )}
      <div className="ds-game-card__footer">
        <h3 className="ds-game-card__title">{game.name}</h3>
      </div>
      <div className="ds-game-card__rim" aria-hidden="true" />
    </article>
  );

  if (isActive && href) {
    return <Link to={href} className="ds-game-card-link">{card}</Link>;
  }

  return <div className={`ds-game-card-link ${!isActive ? 'ds-game-card-link--disabled' : ''}`}>{card}</div>;
}
