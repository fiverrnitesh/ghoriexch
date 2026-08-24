import PlayerSeat from './PlayerSeat'
import './GameTable.css'

const defaultPlayers = [
  { id: 'p1', name: 'Tanya', chips: 900000, avatar: '👩', position: 'dealer-left', status: 'SEEN' },
  { id: 'p2', name: 'Rohit', chips: 500000, avatar: '👨', position: 'dealer-right', status: 'SEEN' },
  { id: 'p3', name: 'Rahul', chips: 250000, avatar: '🧑', position: 'left', status: 'SEEN' },
  { id: 'p4', name: 'Sneha', chips: 750000, avatar: '👩‍🦱', position: 'right', status: 'SEEN' },
  {
    id: 'you',
    name: 'You',
    chips: 1000000,
    avatar: '🙂',
    position: 'you',
    isYou: true,
    status: 'SEEN',
  },
]

export default function GameTable({
  title = 'DICE TABLE',
  pot = 1000000,
  players = defaultPlayers,
  centerContent,
  actions,
  winnerId,
}) {
  return (
    <div className="casino-room">
      <div className="game-table-wrap">
        <div className="game-table">
          <div className="table-rim">
            <div className="table-felt">
              <div className="table-dealer" aria-hidden="true">
                <div className="table-dealer__figure">👩‍💼</div>
              </div>

              <div className="table-pot">
                <span className="table-pot__icon">🪙</span>
                <span className="table-pot__amount">{pot.toLocaleString('en-IN')}</span>
              </div>

              <div className="table-brand">{title}</div>

              {centerContent && <div className="table-center">{centerContent}</div>}

              {players.map((player) => (
                <PlayerSeat
                  key={player.id}
                  name={player.name}
                  chips={player.chips}
                  avatar={player.avatar}
                  position={player.position}
                  isYou={player.isYou}
                  status={player.status}
                  dice={player.dice}
                  hidden={player.hiddenDice}
                  isWinner={winnerId === player.id}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {actions && <div className="table-actions">{actions}</div>}
    </div>
  )
}
