import DiceGame from './dice/DiceGame'

export const games = [
  {
    id: 'sic-bo',
    name: 'SIC BO',
    category: 'popular',
    players: 3384,
    provider: 'Ezugi',
    status: 'live',
    theme: 'sic-bo',
    component: DiceGame,
  },
  {
    id: 'dragon-tiger',
    name: 'DRAGON TIGER',
    category: 'popular',
    players: 8791,
    provider: 'Ezugi',
    status: 'coming-soon',
    theme: 'dragon-tiger',
  },
  {
    id: 'aero',
    name: 'AERO',
    category: 'popular',
    players: 5120,
    provider: 'TURBO GAMES',
    status: 'coming-soon',
    theme: 'aero',
  },
  {
    id: 'chicken-highway',
    name: 'CHICKEN HIGHWAY',
    category: 'popular',
    players: 2940,
    provider: 'TURBO GAMES',
    status: 'coming-soon',
    theme: 'chicken',
  },
  {
    id: 'teen-patti-1day',
    name: 'TEEN PATTI 1-DAY',
    category: 'indian-cards',
    players: 12450,
    provider: 'TRISTAR',
    status: 'coming-soon',
    theme: 'teen-patti',
  },
  {
    id: 'teen-patti-20-20',
    name: 'TEEN PATTI 20-20',
    category: 'indian-cards',
    players: 9870,
    provider: 'TRISTAR',
    status: 'coming-soon',
    theme: 'teen-patti-gold',
  },
  {
    id: 'bollywood-casino',
    name: 'BOLLYWOOD CASINO',
    category: 'indian-cards',
    players: 6540,
    provider: 'TRISTAR',
    status: 'coming-soon',
    theme: 'bollywood',
  },
  {
    id: '32-cards',
    name: '32 CARDS',
    category: 'indian-cards',
    players: 4320,
    provider: 'TRISTAR',
    status: 'coming-soon',
    theme: 'cards-32',
  },
  {
    id: 'ludo',
    name: 'LUDO',
    category: 'indian-cards',
    players: 7650,
    provider: 'TRISTAR',
    status: 'coming-soon',
    theme: 'ludo',
  },
  {
    id: 'aviator',
    name: 'AVIATOR',
    category: 'crash',
    players: 15200,
    provider: 'SPRIBE',
    status: 'coming-soon',
    theme: 'aviator',
  },
  {
    id: 'mines',
    name: 'MINES',
    category: 'crash',
    players: 8900,
    provider: 'SPRIBE',
    status: 'coming-soon',
    theme: 'mines',
  },
]

export const gameCategories = [
  { id: 'popular', title: 'Popular Games' },
  { id: 'indian-cards', title: 'Indian Cards' },
  { id: 'crash', title: 'Crash Games' },
]

export function getGameById(id) {
  return games.find((game) => game.id === id)
}

export function getGamesByCategory(categoryId) {
  return games.filter((game) => game.category === categoryId)
}
