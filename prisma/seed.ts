import { PrismaClient, RoleName, GameStatus, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEV_PASSWORD = 'DevPassword123!';

async function seedRoles() {
  const roles: RoleName[] = ['USER', 'ADMIN', 'SUPER_ADMIN'];
  for (const name of roles) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
}

async function seedUsers() {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 12);

  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'SUPER_ADMIN' } });
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } });
  const userRole = await prisma.role.findUniqueOrThrow({ where: { name: 'USER' } });

  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@games.local' },
    update: {},
    create: {
      email: 'superadmin@games.local',
      username: 'superadmin',
      displayName: 'Super Admin',
      passwordHash,
      status: UserStatus.ACTIVE,
      roles: { create: [{ roleId: superAdminRole.id }, { roleId: adminRole.id }, { roleId: userRole.id }] },
      wallet: {
        create: {
          balance: 10000,
          availableBalance: 10000,
          lockedBalance: 0,
          currency: 'USD',
        },
      },
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@games.local' },
    update: {},
    create: {
      email: 'admin@games.local',
      username: 'admin',
      displayName: 'Platform Admin',
      passwordHash,
      status: UserStatus.ACTIVE,
      roles: { create: [{ roleId: adminRole.id }, { roleId: userRole.id }] },
      wallet: {
        create: {
          balance: 5000,
          availableBalance: 5000,
          lockedBalance: 0,
          currency: 'USD',
        },
      },
    },
  });

  const demoPlayers = [
    { email: 'player1@games.local', username: 'player1', displayName: 'Player One', balance: 25000, avatarSeed: 'playerone' },
    { email: 'rahul@games.local', username: 'rahul', displayName: 'Rahul', balance: 30000, avatarSeed: 'rahul' },
    { email: 'tanya@games.local', username: 'tanya', displayName: 'Tanya', balance: 25000, avatarSeed: 'tanya' },
    { email: 'rohit@games.local', username: 'rohit', displayName: 'Rohit', balance: 50000, avatarSeed: 'rohit' },
    { email: 'sneha@games.local', username: 'sneha', displayName: 'Sneha', balance: 90000, avatarSeed: 'sneha' },
    { email: 'arjun@games.local', username: 'arjun', displayName: 'Arjun', balance: 40000, avatarSeed: 'arjun' },
    { email: 'priya@games.local', username: 'priya', displayName: 'Priya', balance: 35000, avatarSeed: 'priya' },
    { email: 'vikram@games.local', username: 'vikram', displayName: 'Vikram', balance: 45000, avatarSeed: 'vikram' },
    { email: 'neha@games.local', username: 'neha', displayName: 'Neha', balance: 60000, avatarSeed: 'neha' },
  ];

  for (const u of demoPlayers) {
    const avatarUrl = `https://api.dicebear.com/7.x/personas/svg?seed=${u.avatarSeed}`;
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        displayName: u.displayName,
        avatarUrl,
        wallet: {
          update: {
            balance: u.balance,
            availableBalance: u.balance,
            lockedBalance: 0,
            currency: 'USD',
          },
        },
      },
      create: {
        email: u.email,
        username: u.username,
        displayName: u.displayName,
        avatarUrl,
        passwordHash,
        status: UserStatus.ACTIVE,
        roles: { create: [{ roleId: userRole.id }] },
        wallet: {
          create: {
            balance: u.balance,
            availableBalance: u.balance,
            lockedBalance: 0,
            currency: 'USD',
          },
        },
      },
    });
  }

  // Legacy aliases kept for backwards compatibility
  await prisma.user.upsert({
    where: { email: 'player2@games.local' },
    update: {},
    create: {
      email: 'player2@games.local',
      username: 'player2',
      displayName: 'Player Two',
      passwordHash,
      status: UserStatus.ACTIVE,
      roles: { create: [{ roleId: userRole.id }] },
      wallet: { create: { balance: 1500, availableBalance: 1500, lockedBalance: 0, currency: 'USD' } },
    },
  });

  await prisma.user.upsert({
    where: { email: 'player3@games.local' },
    update: {},
    create: {
      email: 'player3@games.local',
      username: 'player3',
      displayName: 'Player Three',
      passwordHash,
      status: UserStatus.ACTIVE,
      roles: { create: [{ roleId: userRole.id }] },
      wallet: { create: { balance: 1000, availableBalance: 1000, lockedBalance: 0, currency: 'USD' } },
    },
  });

  return { superAdmin, admin };
}

async function seedGames() {
  const catalog = [
    { slug: 'sic-bo', name: 'SIC BO', category: 'popular', provider: 'Ezugi', sortOrder: 1 },
    { slug: 'dragon-tiger', name: 'DRAGON TIGER', category: 'popular', provider: 'Ezugi', sortOrder: 2 },
    { slug: 'aero', name: 'AERO', category: 'popular', provider: 'TURBO GAMES', sortOrder: 3 },
    { slug: 'chicken-highway', name: 'CHICKEN HIGHWAY', category: 'popular', provider: 'TURBO GAMES', sortOrder: 4 },
    { slug: 'teen-patti-1day', name: 'TEEN PATTI 1-DAY', category: 'indian-cards', provider: 'TRISTAR', sortOrder: 5 },
    { slug: 'teen-patti-20-20', name: 'TEEN PATTI 20-20', category: 'indian-cards', provider: 'TRISTAR', sortOrder: 6 },
    { slug: 'bollywood-casino', name: 'BOLLYWOOD CASINO', category: 'indian-cards', provider: 'TRISTAR', sortOrder: 7 },
    { slug: '32-cards', name: '32 CARDS', category: 'indian-cards', provider: 'TRISTAR', sortOrder: 8 },
    { slug: 'ludo', name: 'LUDO', category: 'indian-cards', provider: 'TRISTAR', sortOrder: 9 },
    { slug: 'aviator', name: 'AVIATOR', category: 'crash', provider: 'SPRIBE', sortOrder: 10 },
    { slug: 'mines', name: 'MINES', category: 'crash', provider: 'SPRIBE', sortOrder: 11 },
  ];

  for (const game of catalog) {
    await prisma.game.upsert({
      where: { slug: game.slug },
      update: {
        name: game.name,
        category: game.category,
        provider: game.provider,
        sortOrder: game.sortOrder,
      },
      create: {
        ...game,
        status: GameStatus.ACTIVE,
        minPlayers: 1,
        maxPlayers: 100,
        description: `${game.name} — platform catalog entry (game engine not yet implemented)`,
      },
    });
  }
}

async function main() {
  console.log('🌱 Seeding database...\n');

  await seedRoles();
  console.log('✓ Roles seeded (USER, ADMIN, SUPER_ADMIN)');

  await seedUsers();
  console.log('✓ Demo users seeded (9 players + admin, USD sandbox balances)');
  console.log('  Password for all dev accounts:', DEV_PASSWORD);
  console.log('  Demo players: player1, rahul, tanya, rohit, sneha, arjun, priya, vikram, neha @games.local');
  console.log('  Admin:       admin@games.local');

  await seedGames();
  console.log('✓ Game catalog seeded (11 games, no engines attached yet)');

  await seedBots();
  console.log('✓ Bot entities seeded (TIGER bot for Dragon Tiger)');

  await seedDiceGame();
  console.log('✓ Dice game seeded with configuration');

  await seedDemoRoom();
  console.log('✓ Dice demo room seeded (DICEDEMO)');

  await seedSimulationRoom();
  console.log('✓ Dice simulation room seeded (DICE10SIM)');

  console.log('\n✅ Seed complete');
}

async function seedDemoRoom() {
  const game = await prisma.game.findUnique({ where: { slug: 'dice' } });
  const host = await prisma.user.findUnique({ where: { email: 'player1@games.local' } });
  if (!game || !host) return;

  await prisma.room.upsert({
    where: { code: 'DICEDEMO' },
    update: { name: 'DICE DEMO TABLE', status: 'OPEN', gameId: game.id },
    create: {
      gameId: game.id,
      hostUserId: host.id,
      name: 'DICE DEMO TABLE',
      code: 'DICEDEMO',
      maxPlayers: game.maxPlayers,
      minBet: game.minBet,
      maxBet: game.maxBet,
      status: 'OPEN',
    },
  });
}

async function seedSimulationRoom() {
  const game = await prisma.game.findUnique({ where: { slug: 'dice' } });
  const host = await prisma.user.findUnique({ where: { email: 'player1@games.local' } });
  const simEmails = [
    'player1@games.local',
    'rahul@games.local',
    'tanya@games.local',
    'rohit@games.local',
    'sneha@games.local',
    'arjun@games.local',
    'priya@games.local',
    'vikram@games.local',
    'neha@games.local',
    'player2@games.local',
  ];
  const simUsers = await prisma.user.findMany({ where: { email: { in: simEmails } } });
  if (!game || !host) return;

  await prisma.room.upsert({
    where: { code: 'DICE10SIM' },
    update: {
      name: '10 PLAYER LIVE TEST',
      status: 'OPEN',
      gameId: game.id,
      maxPlayers: 6,
      metadata: {
        gameMode: 'FRIENDS',
        isSystemRoom: true,
        simulationRoom: true,
        acceptedParticipantIds: simUsers.map((u) => u.id),
        pendingJoinRequests: [],
      },
    },
    create: {
      gameId: game.id,
      hostUserId: host.id,
      name: '10 PLAYER LIVE TEST',
      code: 'DICE10SIM',
      maxPlayers: 6,
      minBet: game.minBet,
      maxBet: game.maxBet,
      status: 'OPEN',
      isPrivate: true,
      metadata: {
        gameMode: 'FRIENDS',
        isSystemRoom: true,
        simulationRoom: true,
        acceptedParticipantIds: simUsers.map((u) => u.id),
        pendingJoinRequests: [],
      },
    },
  });
}

async function seedDiceGame() {
  const game = await prisma.game.upsert({
    where: { slug: 'dice' },
    update: {
      name: 'Dice',
      status: GameStatus.ACTIVE,
      minPlayers: 2,
      maxPlayers: 6,
      minBet: 10,
      maxBet: 10000,
      version: '1.0.0',
      category: 'popular',
      provider: 'GO EXCHANGE',
      sortOrder: 0,
    },
    create: {
      slug: 'dice',
      name: 'Dice',
      description: 'Custom dual-dice ODD/EVEN table game with side betting',
      status: GameStatus.ACTIVE,
      minPlayers: 2,
      maxPlayers: 6,
      minBet: 10,
      maxBet: 10000,
      version: '1.0.0',
      category: 'popular',
      provider: 'GO EXCHANGE',
      sortOrder: 0,
    },
  });

  await prisma.gameConfiguration.upsert({
    where: { gameId_key: { gameId: game.id, key: 'settings' } },
    update: {
      value: {
        platformFeeRate: 0.1,
        turnTimeoutSeconds: 60,
        payoutMultiplier: 1.9,
        sideBetWindowSeconds: 10,
        botName: 'Shoot',
        minBet: 10,
        maxBet: 10000,
      },
    },
    create: {
      gameId: game.id,
      key: 'settings',
      value: {
        platformFeeRate: 0.1,
        turnTimeoutSeconds: 60,
        payoutMultiplier: 1.9,
        sideBetWindowSeconds: 10,
        botName: 'Shoot',
        minBet: 10,
        maxBet: 10000,
      },
    },
  });

  const dragonTiger = await prisma.game.findUnique({ where: { slug: 'dragon-tiger' } });
  if (dragonTiger) {
    await prisma.bot.updateMany({
      where: { gameId: dragonTiger.id, name: { in: ['TIGER', 'Shoot'] } },
      data: { gameId: game.id },
    });
  }
}

async function seedBots() {
  const diceGame = await prisma.game.findUnique({ where: { slug: 'dice' } });
  const dragonTiger = await prisma.game.findUnique({ where: { slug: 'dragon-tiger' } });
  const targetGame = diceGame ?? dragonTiger;
  if (!targetGame) return;

  const existing = await prisma.bot.findFirst({ where: { gameId: targetGame.id, name: { in: ['TIGER', 'Shoot'] } } });
  if (existing) {
    await prisma.bot.update({
      where: { id: existing.id },
      data: {
        name: 'Shoot',
        avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=tiger',
        status: 'ACTIVE',
        config: {
          entityType: 'BOT',
          personality: 'aggressive',
          betStrategy: 'follow_trend',
          minBet: 10,
          maxBet: 500,
          responseDelayMs: 800,
          note: 'Internal BOT entity — never linked to a user account',
        },
      },
    });
    return;
  }

  await prisma.bot.create({
    data: {
      gameId: targetGame.id,
      name: 'Shoot',
      avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=tiger',
      status: 'ACTIVE',
      config: {
        entityType: 'BOT',
        personality: 'aggressive',
        betStrategy: 'follow_trend',
        minBet: 10,
        maxBet: 500,
        responseDelayMs: 800,
        note: 'Internal BOT entity — never linked to a user account',
      },
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
