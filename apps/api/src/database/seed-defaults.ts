import { PrismaClient, RoleName, GameStatus, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const DEV_PASSWORD = 'DevPassword123!';

export async function ensureDefaultSeedData(prisma: PrismaClient): Promise<void> {
  try {
    // 1. Ensure Roles
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

    const rolesMap: Record<RoleName, { id: string }> = {
      COMPANY: await prisma.role.findUniqueOrThrow({ where: { name: 'COMPANY' } }),
      PANEL: await prisma.role.findUniqueOrThrow({ where: { name: 'PANEL' } }),
      SUPER_ADMIN: await prisma.role.findUniqueOrThrow({ where: { name: 'SUPER_ADMIN' } }),
      ADMIN: await prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } }),
      SUPER_MASTER: await prisma.role.findUniqueOrThrow({ where: { name: 'SUPER_MASTER' } }),
      MASTER: await prisma.role.findUniqueOrThrow({ where: { name: 'MASTER' } }),
      USER: await prisma.role.findUniqueOrThrow({ where: { name: 'USER' } }),
    };

    const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);

    // 2. Ensure COMPANY user
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
            currency: 'PKR',
          },
        },
      },
    });

    // 3. Ensure PANEL user
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
            currency: 'PKR',
          },
        },
      },
    });

    // 4. Ensure SUPER_ADMIN user
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
            currency: 'PKR',
          },
        },
      },
    });

    // 5. Ensure ADMIN user
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
            currency: 'PKR',
          },
        },
      },
    });

    // 6. Ensure SUPER_MASTER user
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
            currency: 'PKR',
          },
        },
      },
    });

    // 7. Ensure MASTER user
    await prisma.user.upsert({
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
            currency: 'PKR',
          },
        },
      },
    });

    // 8. Clean up any legacy demo dummy rooms or demo dummy players
    try {
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
      // Only remove if they are untouched demo users
      await prisma.user.deleteMany({
        where: { email: { in: demoEmails } },
      }).catch(() => {});

      await prisma.room.deleteMany({
        where: {
          OR: [
            { code: { in: ['DEMO-DICE-01', 'SIM-DICE-01'] } },
            { name: { in: ['Demo Room', 'Dice Demo', '6-Player Demo', 'Simulation Room'] } },
          ],
        },
      }).catch(() => {});
    } catch {
      // ignore cleanup errors
    }

    // 9. Ensure Games exist
    await prisma.game.upsert({
      where: { slug: 'dice' },
      update: { maxPlayers: 8 },
      create: {
        slug: 'dice',
        name: 'Ghori Dice',
        description: 'Multiplayer Pasa Dice Game',
        status: GameStatus.ACTIVE,
        minPlayers: 2,
        maxPlayers: 8,
        minBet: 10,
        maxBet: 10000,
      },
    });

    await prisma.game.upsert({
      where: { slug: 'ludo' },
      update: {},
      create: {
        slug: 'ludo',
        name: 'Ludo Express',
        description: 'Classic 4-Player Ludo Board Game',
        status: GameStatus.ACTIVE,
        minPlayers: 2,
        maxPlayers: 4,
        minBet: 10,
        maxBet: 5000,
      },
    });

    console.log('[bootstrap] Default roles, admin users, and games verified.');
  } catch (err) {
    console.error('[bootstrap] Warning: Failed to ensure default seed data:', err);
  }
}
