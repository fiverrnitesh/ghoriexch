import { PrismaClient, RoleName, GameStatus, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEV_PASSWORD = 'DevPassword123!';

async function seedRoles() {
  const roles: RoleName[] = [
    'COMPANY',
    'PANEL',
    'SUPER_ADMIN',
    'ADMIN',
    'SUPER_MASTER',
    'MASTER',
    'USER',
  ];
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

  const rolesMap: Record<RoleName, { id: string }> = {
    COMPANY: await prisma.role.findUniqueOrThrow({ where: { name: 'COMPANY' } }),
    PANEL: await prisma.role.findUniqueOrThrow({ where: { name: 'PANEL' } }),
    SUPER_ADMIN: await prisma.role.findUniqueOrThrow({ where: { name: 'SUPER_ADMIN' } }),
    ADMIN: await prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } }),
    SUPER_MASTER: await prisma.role.findUniqueOrThrow({ where: { name: 'SUPER_MASTER' } }),
    MASTER: await prisma.role.findUniqueOrThrow({ where: { name: 'MASTER' } }),
    USER: await prisma.role.findUniqueOrThrow({ where: { name: 'USER' } }),
  };

  // 1. Level 1: COMPANY (Root with unlimited coins)
  const company = await prisma.user.upsert({
    where: { email: 'company@ghoriexch.local' },
    update: { isUnlimited: true },
    create: {
      email: 'company@ghoriexch.local',
      username: 'company',
      displayName: 'Company Master',
      passwordHash,
      status: UserStatus.ACTIVE,
      isUnlimited: true,
      roles: { create: [{ roleId: rolesMap.COMPANY.id }] },
      wallet: {
        create: {
          balance: 999999999,
          availableBalance: 999999999,
          lockedBalance: 0,
          currency: 'USD',
        },
      },
    },
  });

  // 2. Level 2: PANEL
  const panel = await prisma.user.upsert({
    where: { email: 'panel1@ghoriexch.local' },
    update: { parentId: company.id },
    create: {
      email: 'panel1@ghoriexch.local',
      username: 'panel1',
      displayName: 'Main Panel',
      passwordHash,
      status: UserStatus.ACTIVE,
      parentId: company.id,
      roles: { create: [{ roleId: rolesMap.PANEL.id }] },
      wallet: {
        create: {
          balance: 500000,
          availableBalance: 500000,
          lockedBalance: 0,
          currency: 'USD',
        },
      },
    },
  });

  // 3. Level 3: SUPER_ADMIN
  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@games.local' },
    update: { parentId: panel.id },
    create: {
      email: 'superadmin@games.local',
      username: 'superadmin',
      displayName: 'Super Admin',
      passwordHash,
      status: UserStatus.ACTIVE,
      parentId: panel.id,
      roles: { create: [{ roleId: rolesMap.SUPER_ADMIN.id }] },
      wallet: {
        create: {
          balance: 200000,
          availableBalance: 200000,
          lockedBalance: 0,
          currency: 'USD',
        },
      },
    },
  });

  // 4. Level 4: ADMIN
  const admin = await prisma.user.upsert({
    where: { email: 'admin@games.local' },
    update: { parentId: superAdmin.id },
    create: {
      email: 'admin@games.local',
      username: 'admin',
      displayName: 'Platform Admin',
      passwordHash,
      status: UserStatus.ACTIVE,
      parentId: superAdmin.id,
      roles: { create: [{ roleId: rolesMap.ADMIN.id }] },
      wallet: {
        create: {
          balance: 100000,
          availableBalance: 100000,
          lockedBalance: 0,
          currency: 'USD',
        },
      },
    },
  });

  // 5. Level 5: SUPER_MASTER
  const superMaster = await prisma.user.upsert({
    where: { email: 'supermaster1@ghoriexch.local' },
    update: { parentId: admin.id },
    create: {
      email: 'supermaster1@ghoriexch.local',
      username: 'supermaster1',
      displayName: 'Super Master 1',
      passwordHash,
      status: UserStatus.ACTIVE,
      parentId: admin.id,
      roles: { create: [{ roleId: rolesMap.SUPER_MASTER.id }] },
      wallet: {
        create: {
          balance: 50000,
          availableBalance: 50000,
          lockedBalance: 0,
          currency: 'USD',
        },
      },
    },
  });

  // 6. Level 6: MASTER
  const master = await prisma.user.upsert({
    where: { email: 'master1@ghoriexch.local' },
    update: { parentId: superMaster.id },
    create: {
      email: 'master1@ghoriexch.local',
      username: 'master1',
      displayName: 'Master Agent 1',
      passwordHash,
      status: UserStatus.ACTIVE,
      parentId: superMaster.id,
      roles: { create: [{ roleId: rolesMap.MASTER.id }] },
      wallet: {
        create: {
          balance: 25000,
          availableBalance: 25000,
          lockedBalance: 0,
          currency: 'USD',
        },
      },
    },
  });

  // 7. Cleanup old demo dummy players if any
  const demoEmails = [
    'player1@games.local',
    'rahul@games.local',
    'tanya@games.local',
    'rohit@games.local',
    'sneha@games.local',
    'arjun@games.local',
    'priya@games.local',
    'vikram@games.local',
    'neha@games.local',
  ];
  await prisma.user.deleteMany({
    where: { email: { in: demoEmails } },
  }).catch(() => {});
}

async function seedGames() {
  const dice = await prisma.game.upsert({
    where: { slug: 'dice' },
    update: {
      name: 'GHORI',
      provider: 'GHORI EXCH',
      category: 'popular',
      status: GameStatus.ACTIVE,
      maxPlayers: 8,
    },
    create: {
      name: 'GHORI',
      slug: 'dice',
      provider: 'GHORI EXCH',
      category: 'popular',
      status: GameStatus.ACTIVE,
      minBet: 1,
      maxBet: 10000,
      maxPlayers: 8,
    },
  });

  return { dice };
}

async function main() {
  console.log('Seeding 7-Tier Hierarchy Roles...');
  await seedRoles();
  console.log('Seeding 7-Tier Hierarchy Users & Agents...');
  await seedUsers();
  console.log('Seeding Games...');
  await seedGames();
  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
