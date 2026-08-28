import { useState } from 'react';
import './DesignSystemPage.css';
import {
  GameLayout,
  GameTable,
  TablePot,
  PlayerSeat,
  BettingPanel,
  GameCard,
  RoomCard,
  PlayerCard,
  WalletDisplay,
  BalanceBadge,
  UserAvatar,
  PrimaryButton,
  SecondaryButton,
  DangerButton,
  GoldButton,
  Modal,
  ConfirmModal,
  useToast,
  Notification,
  CountdownTimer,
  GameHistory,
  TransactionList,
  EmptyState,
  LoadingState,
  ErrorState,
} from '../design-system';

function ShowcaseContent() {
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [betAmount, setBetAmount] = useState(25);

  return (
    <div className="ds-showcase">
      <section className="ds-showcase__hero ds-panel ds-panel--chrome">
        <h1>Design System</h1>
        <p>Premium 2D/3D hybrid gaming UI — reusable across all game types</p>
      </section>

      {/* Buttons */}
      <section className="ds-showcase__section">
        <h2>Buttons</h2>
        <div className="ds-showcase__row">
          <PrimaryButton>Primary</PrimaryButton>
          <SecondaryButton>Secondary</SecondaryButton>
          <DangerButton>Danger</DangerButton>
          <GoldButton>Gold</GoldButton>
          <GoldButton loading>Loading</GoldButton>
        </div>
      </section>

      {/* Tokens preview */}
      <section className="ds-showcase__section">
        <h2>Color Tokens</h2>
        <div className="ds-showcase__swatches">
          {['bg', 'surface', 'gold', 'red', 'success', 'warning', 'danger'].map((t) => (
            <div key={t} className={`ds-showcase__swatch ds-showcase__swatch--${t}`}>
              <span>{t}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Avatars & Cards */}
      <section className="ds-showcase__section">
        <h2>Avatars & Cards</h2>
        <div className="ds-showcase__grid-3">
          <UserAvatar name="Player One" size="lg" status="playing" highlight />
          <PlayerCard name="Player Two" subtitle="Seat 2" balance="$1,250" status="online" />
          <BalanceBadge amount="2,500.00" />
        </div>
        <div className="ds-showcase__scroll">
          <GameCard game={{ id: '1', slug: 'ludo', name: 'LUDO', status: 'ACTIVE', category: 'indian-cards', provider: 'TRISTAR', playerCount: 4200 }} href="#" />
          <GameCard game={{ id: '2', slug: 'aviator', name: 'AVIATOR', status: 'ACTIVE', category: 'crash', provider: 'SPRIBE', playerCount: 8900 }} href="#" />
          <GameCard game={{ id: '3', slug: 'pool', name: '8 BALL POOL', status: 'DRAFT', category: 'pool' }} />
        </div>
        <div className="ds-showcase__grid-2" style={{ marginTop: '1rem' }}>
          <RoomCard name="High Rollers" code="XR7K2P" status="OPEN" playerCount={3} maxPlayers={8} minBet="$10" onJoin={() => toast('Join room', 'info')} />
        </div>
      </section>

      {/* Feedback */}
      <section className="ds-showcase__section">
        <h2>Feedback States</h2>
        <div className="ds-showcase__grid-3">
          <div className="ds-panel"><EmptyState title="No games" description="Check back soon" action={<GoldButton size="sm">Refresh</GoldButton>} /></div>
          <div className="ds-panel"><LoadingState message="Connecting..." /></div>
          <div className="ds-panel"><ErrorState message="Connection failed" onRetry={() => toast('Retrying...', 'warning')} /></div>
        </div>
      </section>

      {/* Modals & Toast */}
      <section className="ds-showcase__section">
        <h2>Overlays</h2>
        <div className="ds-showcase__row">
          <SecondaryButton onClick={() => setModalOpen(true)}>Open Modal</SecondaryButton>
          <SecondaryButton onClick={() => setConfirmOpen(true)}>Confirm</SecondaryButton>
          <GoldButton onClick={() => toast('Bet placed successfully', 'success')}>Toast Success</GoldButton>
          <DangerButton onClick={() => toast('Insufficient balance', 'error')}>Toast Error</DangerButton>
        </div>
        <Notification title="Welcome bonus" body="Your sandbox wallet is ready." type="wallet" unread timestamp="Just now" onRead={() => {}} />
      </section>

      {/* Timer & Lists */}
      <section className="ds-showcase__section">
        <h2>Timer & Lists</h2>
        <CountdownTimer durationSeconds={45} label="Round ends" variant="gold" />
        <div className="ds-showcase__grid-2" style={{ marginTop: '1rem' }}>
          <div className="ds-panel ds-panel--chrome"><div className="ds-panel__body">
            <GameHistory items={[
              { id: '1', gameName: 'Ludo', amount: '50.00', status: 'WON', payout: '95.00', date: 'Today 14:32' },
              { id: '2', gameName: 'Aviator', amount: '25.00', status: 'LOST', date: 'Today 13:10' },
            ]} />
          </div></div>
          <div className="ds-panel ds-panel--chrome"><div className="ds-panel__body">
            <TransactionList items={[
              { id: '1', type: 'SANDBOX_CREDIT', amount: '1000.00', status: 'COMPLETED', date: 'Today' },
              { id: '2', type: 'GAME_DEBIT', amount: '50.00', status: 'COMPLETED', date: 'Yesterday' },
            ]} />
          </div></div>
        </div>
      </section>

      {/* Wallet */}
      <section className="ds-showcase__section">
        <h2>Wallet</h2>
        <WalletDisplay balance="2,500.00" available="2,350.00" locked="150.00" />
      </section>

      {/* Game Layout Preview */}
      <section className="ds-showcase__section ds-showcase__section--full">
        <h2>Game Layout (Generic — works for any game)</h2>
        <div className="ds-showcase__game-preview">
          <GameLayout
            title="Sample Game Room"
            subtitle="Room XR7K2P · Round 3"
            balance="2,500.00"
            timerSeconds={30}
            timerLabel="Betting"
            onLeave={() => toast('Leave game', 'info')}
            table={
              <GameTable watermark="GHORI EXCH" center={<TablePot amount="$480.00" />} top={<UserAvatar name="Host" size="md" />}>
                <PlayerSeat name="Alex" balance="$1,200" position="top-left" status="playing" />
                <PlayerSeat name="Sam" balance="$800" position="top-right" />
                <PlayerSeat name="You" balance="$2,500" position="bottom" isSelf highlight statusLabel="Your turn" ribbon="Winner" />
              </GameTable>
            }
            bettingPanel={
              <BettingPanel
                balance="$2,500"
                selectedAmount={betAmount}
                onAmountChange={setBetAmount}
                betOptions={[
                  { id: 'a', label: 'Option A', odds: '2.00x' },
                  { id: 'b', label: 'Option B', odds: '3.50x' },
                  { id: 'c', label: 'Option C', odds: '5.00x' },
                ]}
                onBet={(id) => toast(`Bet on ${id} for $${betAmount}`, 'success')}
                onClear={() => setBetAmount(10)}
              />
            }
            actionBar={
              <>
                <DangerButton>Fold</DangerButton>
                <SecondaryButton>Check</SecondaryButton>
                <GoldButton>Raise</GoldButton>
              </>
            }
          />
        </div>
      </section>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Sample Modal">
        <p style={{ color: 'var(--ds-text-secondary)', margin: 0 }}>Reusable modal with chrome border and backdrop blur.</p>
      </Modal>

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => { setConfirmOpen(false); toast('Confirmed', 'success'); }}
        title="Confirm Action"
        message="Are you sure you want to proceed?"
        confirmLabel="Yes, proceed"
      />
    </div>
  );
}

export function DesignSystemPage() {
  return <ShowcaseContent />;
}
