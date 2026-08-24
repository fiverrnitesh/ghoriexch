import { Link, useParams } from 'react-router-dom'
import { getGameById } from '../games/registry'
import './GamePage.css'

export default function GamePage() {
  const { gameId } = useParams()
  const game = getGameById(gameId)

  if (!game || game.status !== 'live' || !game.component) {
    return (
      <div className="game-page game-page--fallback">
        <p>Game not found or not available yet.</p>
        <Link to="/" className="btn btn-secondary">
          Back to lobby
        </Link>
      </div>
    )
  }

  const GameComponent = game.component

  return (
    <div className="game-page">
      <Link to="/" className="game-page__back">
        ← Lobby
      </Link>
      <GameComponent />
    </div>
  )
}
