import { useCallback, useEffect, useState } from 'react';
import type { GameCatalogItem } from '@games/shared';
import { api } from '../../lib/api-client';
import { GameCard, LoadingState, ErrorState } from '../../design-system';
import './LobbyPage.css';

interface LobbyGameItem {
  id: string;
  slug: string;
  name: string;
  provider?: string | null;
  status: string;
  category?: string | null;
  href?: string;
  theme?: string;
}

const FEATURED_GAMES: LobbyGameItem[] = [
  {
    id: 'dice',
    slug: 'dice',
    name: 'GHORI',
    status: 'ACTIVE',
    category: 'popular',
    href: '/games/dice',
    theme: 'ds-game-card--crimson',
  },
  {
    id: 'ludo',
    slug: 'ludo',
    name: 'LUDO',
    status: 'ACTIVE',
    category: 'indian-cards',
    href: '/games/ludo',
    theme: 'ds-game-card--emerald',
  },
  {
    id: '8-pool',
    slug: '8-pool',
    name: '8 POOL',
    status: 'COMING_SOON',
    category: 'pool',
    theme: 'ds-game-card--blue',
  },
  {
    id: 'aviator',
    slug: 'aviator',
    name: 'AVIATOR',
    status: 'COMING_SOON',
    category: 'crash',
    theme: 'ds-game-card--magenta',
  },
];

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

  const diceApiGame = games.find((g) => g.slug === 'dice');

  const displayGames: LobbyGameItem[] = FEATURED_GAMES.map((item) => {
    if (item.slug === 'dice' && diceApiGame) {
      return {
        ...item,
        id: diceApiGame.id,
        status: diceApiGame.status,
      };
    }
    return item;
  });

  return (
    <div className="lobby">
      {loading && <LoadingState message="Loading games..." />}
      {error && <ErrorState message={error} onRetry={() => void loadGames()} />}

      {!loading && !error && (
        <section className="lobby-section">
          <h2 className="lobby-section__title">GAMES</h2>
          <div className="lobby-section__grid">
            {displayGames.map((game) => (
              <GameCard
                key={game.slug}
                game={{
                  id: game.id,
                  slug: game.slug,
                  name: game.name,
                  provider: game.provider,
                  status: game.status,
                  category: game.category,
                }}
                theme={game.theme}
                href={game.href}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
