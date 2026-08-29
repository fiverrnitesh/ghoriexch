/** Development-only demo user catalog — must match prisma/seed.ts */
export const DEMO_DEV_PASSWORD = 'DevPassword123!';

export const DEMO_PLAYERS = [
  { email: 'player1@games.local', username: 'player1', displayName: 'Player One', balance: 25000, avatarSeed: 'playerone' },
  { email: 'rahul@games.local', username: 'rahul', displayName: 'Rahul', balance: 30000, avatarSeed: 'rahul' },
  { email: 'tanya@games.local', username: 'tanya', displayName: 'Tanya', balance: 25000, avatarSeed: 'tanya' },
  { email: 'rohit@games.local', username: 'rohit', displayName: 'Rohit', balance: 50000, avatarSeed: 'rohit' },
  { email: 'sneha@games.local', username: 'sneha', displayName: 'Sneha', balance: 90000, avatarSeed: 'sneha' },
  { email: 'arjun@games.local', username: 'arjun', displayName: 'Arjun', balance: 40000, avatarSeed: 'arjun' },
  { email: 'priya@games.local', username: 'priya', displayName: 'Priya', balance: 35000, avatarSeed: 'priya' },
  { email: 'vikram@games.local', username: 'vikram', displayName: 'Vikram', balance: 45000, avatarSeed: 'vikram' },
  { email: 'neha@games.local', username: 'neha', displayName: 'Neha', balance: 60000, avatarSeed: 'neha' },
] as const;

export const DEMO_ADMIN = { email: 'admin@games.local', displayName: 'Admin' };

export const DEMO_ROOM_CODE = 'DICEDEMO';
export const DEMO_ROOM_NAME = 'DICE DEMO TABLE';

export const TIGER_DISPLAY_BALANCE = 100000;

export const DEMO_PRESETS = {
  '2': ['player1@games.local'],
  '4': ['player1@games.local', 'rahul@games.local', 'tanya@games.local'],
  '6': [
    'rahul@games.local',
    'tanya@games.local',
    'rohit@games.local',
    'sneha@games.local',
  ],
  '8': [
    'rahul@games.local',
    'tanya@games.local',
    'rohit@games.local',
    'sneha@games.local',
    'arjun@games.local',
    'priya@games.local',
  ],
  full: DEMO_PLAYERS.map((p) => p.email),
} as const;

export type DemoPreset = keyof typeof DEMO_PRESETS;

export function demoAvatarUrl(seed: string) {
  return `https://api.dicebear.com/7.x/personas/svg?seed=${encodeURIComponent(seed)}`;
}
