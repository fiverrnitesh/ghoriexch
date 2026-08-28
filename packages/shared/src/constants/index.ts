export const IDEMPOTENCY_HEADER = 'x-idempotency-key';

export const DEFAULT_CURRENCY = 'USD';

export const GAME_CATEGORIES = [
  { id: 'popular', title: 'Popular Games' },
  { id: 'indian-cards', title: 'Indian Cards' },
  { id: 'crash', title: 'Crash Games' },
] as const;

export const ADMIN_NAV = [
  { path: '/', label: 'Dashboard', icon: 'dashboard' },
  { path: '/users', label: 'Users', icon: 'users' },
  { path: '/wallets', label: 'Wallets', icon: 'wallet' },
  { path: '/transactions', label: 'Transactions', icon: 'transactions' },
  { path: '/games', label: 'Games', icon: 'games' },
  { path: '/rooms', label: 'Rooms', icon: 'rooms' },
  { path: '/sessions', label: 'Sessions', icon: 'sessions' },
  { path: '/bets', label: 'Bets', icon: 'bets' },
  { path: '/bots', label: 'Bots', icon: 'bots' },
  { path: '/audit-logs', label: 'Audit Logs', icon: 'audit' },
  { path: '/test-mode', label: 'Test Mode', icon: 'test' },
] as const;

export const PLAYER_NAV = [
  { path: '/', label: 'Lobby' },
  { path: '/games/dice', label: 'Ghori' },
  { path: '/wallet', label: 'Wallet' },
  { path: '/history', label: 'History' },
  { path: '/profile', label: 'Profile' },
] as const;
