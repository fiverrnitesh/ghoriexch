import GameCard from './GameCard'
import './GameSection.css'

export default function GameSection({ title, games, showAll = true }) {
  if (!games.length) return null

  return (
    <section className="game-section">
      <div className="game-section__header">
        <h2 className="game-section__title">{title}</h2>
        {showAll && (
          <button type="button" className="game-section__all">
            All &gt;
          </button>
        )}
      </div>

      <div className="game-section__row">
        {games.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </div>
    </section>
  )
}
