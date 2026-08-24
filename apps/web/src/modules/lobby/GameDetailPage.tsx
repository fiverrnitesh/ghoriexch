import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api-client';
import { LoadingState, SecondaryButton, GoldButton } from '../../design-system';
import { useAuth } from '../auth/AuthContext';

interface GameDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: string;
  minPlayers: number;
  maxPlayers: number;
  provider: string | null;
}

export function GameDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [game, setGame] = useState<GameDetail | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (slug) {
      api.get<GameDetail>(`/api/games/${slug}`).then(setGame).catch(console.error);
    }
  }, [slug]);

  const playDice = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    setCreating(true);
    try {
      const result = await api.post<{ session: { id: string } }>('/api/dice/play', {});
      navigate(`/games/dice/play/${result.session.id}`);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  if (!game) return <LoadingState message="Loading game..." />;

  const isDice = game.slug === 'dice';

  return (
    <div className="ds-panel ds-panel--chrome" style={{ maxWidth: 600 }}>
      <div className="ds-panel__header">
        <h1 className="ds-panel__title">{game.name}</h1>
      </div>
      <div className="ds-panel__body">
        <p style={{ color: 'var(--ds-text-secondary)' }}>{game.description}</p>
        <div style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0' }}>
          <span className="ds-badge ds-badge--live">{game.status}</span>
          {game.provider && <span className="ds-badge ds-badge--gold">{game.provider}</span>}
        </div>
        <p>Players: {game.minPlayers}–{game.maxPlayers}</p>

        {isDice && game.status === 'ACTIVE' ? (
          <div style={{ margin: '1.5rem 0', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <GoldButton loading={creating} onClick={() => void playDice()}>Play Dice</GoldButton>
          </div>
        ) : !isDice ? (
          <div style={{ margin: '1.5rem 0', padding: '0.65rem 1rem', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--ds-radius-sm)', color: 'var(--ds-warning)', fontSize: 'var(--ds-text-sm)' }}>
            <strong>COMING SOON</strong> — This game is not yet playable. Dice is the first fully playable game.
          </div>
        ) : null}

        <Link to="/"><SecondaryButton>← Back to Lobby</SecondaryButton></Link>
      </div>
    </div>
  );
}
