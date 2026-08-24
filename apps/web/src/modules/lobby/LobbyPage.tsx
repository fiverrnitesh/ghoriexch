import { useCallback, useEffect, useState } from 'react';
import type { GameCatalogItem } from '@games/shared';
import { api } from '../../lib/api-client';
import { GameCard, LoadingState, ErrorState } from '../../design-system';
import './LobbyPage.css';

export function LobbyPage() {
  const [games, setGames] = useState<GameCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadGames = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.get<GameCatalogItem[]>('/api/games');
      setGames(list);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGames();
  }, [loadGames]);

  useEffect(() => {
    if (!error) return;
    const retry = window.setTimeout(() => { void loadGames(); }, 2500);
    return () => window.clearTimeout(retry);
  }, [error, loadGames]);

  const diceGame = games.find((g) => g.slug === 'dice' && g.status === 'ACTIVE');

  return (
    <div className="lobby">
      <section className="lobby-hero ds-panel ds-panel--chrome">
        <div className="lobby-hero__glow" aria-hidden="true" />
        <div className="lobby-hero__content">
          <span className="ds-badge ds-badge--gold">Live Now</span>
          <h1>Dice Casino</h1>
          <p>Multiplayer dice — PAO or EVEN, server-authoritative, fair, auditable.</p>
        </div>
      </section>

      {loading && <LoadingState message="Loading games..." />}
      {error && <ErrorState message={error} onRetry={() => void loadGames()} />}

      {!loading && !error && (
        <section className="lobby-section">
          <h2 className="lobby-section__title">Dice</h2>
          {diceGame ? (
            <div className="lobby-section__grid">
              <GameCard
                game={{
                  id: diceGame.id,
                  slug: diceGame.slug,
                  name: diceGame.name,
                  provider: diceGame.provider,
                  status: diceGame.status,
                  category: diceGame.category,
                }}
                href="/games/dice"
              />
            </div>
          ) : (
            <p className="lobby-section__empty">Dice is temporarily unavailable.</p>
          )}
        </section>
      )}
    </div>
  );
}
