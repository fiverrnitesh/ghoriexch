import { useMemo, useState } from 'react'
import GameTable from '../../components/table/GameTable'
import './DiceGame.css'

function rollDie() {
  return Math.floor(Math.random() * 6) + 1
}

const basePlayers = [
  { id: 'p1', name: 'Tanya', chips: 900000, avatar: '👩', position: 'dealer-left', status: 'WAIT' },
  { id: 'p2', name: 'Rohit', chips: 500000, avatar: '👨', position: 'dealer-right', status: 'WAIT' },
  { id: 'p3', name: 'Rahul', chips: 250000, avatar: '🧑', position: 'left', status: 'WAIT' },
  { id: 'p4', name: 'Sneha', chips: 750000, avatar: '👩‍🦱', position: 'right', status: 'WAIT' },
  {
    id: 'you',
    name: 'You',
    chips: 1000000,
    avatar: '🙂',
    position: 'you',
    isYou: true,
    status: 'YOUR TURN',
  },
]

export default function DiceGame() {
  const [dice, setDice] = useState([1, 1])
  const [rolling, setRolling] = useState(false)
  const [pot] = useState(1000000)
  const [winnerId, setWinnerId] = useState(null)

  const players = useMemo(
    () =>
      basePlayers.map((player) =>
        player.isYou
          ? { ...player, dice, hiddenDice: false }
          : { ...player, dice: [0, 0], hiddenDice: true },
      ),
    [dice],
  )

  function handleRoll() {
    if (rolling) return

    setRolling(true)
    setWinnerId(null)

    window.setTimeout(() => {
      const next = [rollDie(), rollDie()]
      setDice(next)
      setRolling(false)
    }, 600)
  }

  const total = dice[0] + dice[1]

  const actions = (
    <>
      <button type="button" className="action-btn action-btn--red" disabled>
        PACK
      </button>
      <button type="button" className="action-btn action-btn--orange" disabled>
        SIDE SHOW
      </button>
      <button
        type="button"
        className="action-btn action-btn--green"
        onClick={handleRoll}
        disabled={rolling}
      >
        {rolling ? 'ROLLING…' : 'ROLL DICE'}
      </button>
      <button type="button" className="action-btn action-btn--purple" disabled>
        2X ROLL
      </button>
    </>
  )

  const centerContent = (
    <div className={`dice-center ${rolling ? 'dice-center--rolling' : ''}`}>
      <div className="dice-center__pair">
        {dice.map((value, index) => (
          <div key={index} className="table-die">
            <span>{value}</span>
          </div>
        ))}
      </div>
      <p className="dice-center__total">Total: {total}</p>
    </div>
  )

  return (
    <GameTable
      title="DICE TABLE"
      pot={pot}
      players={players}
      winnerId={winnerId}
      centerContent={centerContent}
      actions={actions}
    />
  )
}
