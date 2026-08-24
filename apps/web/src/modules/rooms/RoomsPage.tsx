import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api-client';
import { GoldButton } from '../../design-system';
import { useAuth } from '../auth/AuthContext';

export function RoomsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [playing, setPlaying] = useState(false);

  const playDice = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    setPlaying(true);
    try {
      const result = await api.post<{ session: { id: string } }>('/api/dice/play', {});
      navigate(`/games/dice/play/${result.session.id}`);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setPlaying(false);
    }
  };

  return (
    <div className="ds-panel ds-panel--chrome" style={{ maxWidth: 560 }}>
      <div className="ds-panel__header">
        <h1 className="ds-panel__title">Play</h1>
      </div>
      <div className="ds-panel__body">
        <p style={{ color: 'var(--ds-text-secondary)' }}>
          Tables are assigned automatically. Press Play Dice to join a live game.
        </p>
        <div style={{ marginTop: '1.25rem' }}>
          <GoldButton loading={playing} onClick={() => void playDice()}>Play Dice</GoldButton>
        </div>
      </div>
    </div>
  );
}
