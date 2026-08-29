import bcrypt from 'bcryptjs';
import { prisma } from '../../database/client.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  WalletError,
} from '../../lib/errors.js';
import {
  HIERARCHY_LEVELS,
  HIERARCHY_CHILD_ROLE,
  getAllowedChildRoles,
  getHighestRole,
  type RoleName,
} from '@games/shared';
import { parseAmount, decimalToString } from '../../lib/utils.js';

const SALT_ROUNDS = 12;

export interface CreateDownlineInput {
  username: string;
  password: string;
  roleName?: RoleName;
  displayName?: string;
  initialCoins?: number;
}

export class AgentService {
  /** Get current user's role hierarchy metadata and capabilities */
  async getHierarchyInfo(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: { include: { role: true } },
        wallet: true,
        parent: {
          select: { id: true, username: true, displayName: true, isUnlimited: true },
        },
      },
    });

    if (!user) throw new NotFoundError('User not found');

    const roles = user.roles.map((r) => r.role.name as RoleName);
    const role = getHighestRole(roles);
    const level = HIERARCHY_LEVELS[role] ?? 7;
    const defaultChildRole = HIERARCHY_CHILD_ROLE[role];
    const allowedChildRoles = getAllowedChildRoles(role);
    const isUnlimited = user.isUnlimited || role === 'COMPANY';

    return {
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      role,
      level,
      isUnlimited,
      balance: isUnlimited ? 'Unlimited' : decimalToString(user.wallet?.availableBalance ?? 0),
      defaultChildRole,
      allowedChildRoles,
      parent: user.parent,
      canCreateUsers: level < 7,
    };
  }

  /** List direct downline users created under this agent */
  async getDownlines(agentId: string, page = 1, pageSize = 50, search?: string) {
    const skip = (page - 1) * pageSize;
    const where: any = { parentId: agentId };

    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [downlines, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          roles: { include: { role: true } },
          wallet: true,
          _count: { select: { downlines: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.user.count({ where }),
    ]);

    return {
      items: downlines.map((u) => {
        const roles = u.roles.map((r) => r.role.name as RoleName);
        const role = getHighestRole(roles);
        return {
          id: u.id,
          username: u.username,
          displayName: u.displayName,
          role,
          level: HIERARCHY_LEVELS[role] ?? 7,
          status: u.status,
          balance: u.isUnlimited ? 'Unlimited' : decimalToString(u.wallet?.availableBalance ?? 0),
          totalBalance: u.isUnlimited ? 'Unlimited' : decimalToString(u.wallet?.balance ?? 0),
          downlineCount: u._count.downlines,
          isUnlimited: u.isUnlimited,
          createdAt: u.createdAt,
          lastLoginAt: u.lastLoginAt,
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  /** Create a new downline account under the logged-in agent */
  async createDownline(agentId: string, input: CreateDownlineInput) {
    const agent = await prisma.user.findUnique({
      where: { id: agentId },
      include: {
        roles: { include: { role: true } },
        wallet: true,
      },
    });

    if (!agent) throw new NotFoundError('Agent not found');

    const agentRoles = agent.roles.map((r) => r.role.name as RoleName);
    const agentRole = getHighestRole(agentRoles);
    const agentLevel = HIERARCHY_LEVELS[agentRole] ?? 7;

    if (agentLevel >= 7) {
      throw new ForbiddenError('Only agents can create downline accounts');
    }

    const allowedRoles = getAllowedChildRoles(agentRole);
    const targetRoleName = input.roleName ?? HIERARCHY_CHILD_ROLE[agentRole];

    if (!targetRoleName || !allowedRoles.includes(targetRoleName)) {
      throw new ValidationError(
        `Invalid role. You can only create: ${allowedRoles.join(', ')}`
      );
    }

    const normalizedUsername = input.username.trim().toLowerCase();
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: normalizedUsername, mode: 'insensitive' } },
          { email: `${normalizedUsername}@ghoriexch.local` },
        ],
      },
    });

    if (existing) {
      throw new ConflictError(`Username "${input.username}" is already taken`);
    }

    const initialCoins = parseAmount(input.initialCoins ?? 0);
    const isCompanyAgent = agent.isUnlimited || agentRole === 'COMPANY';

    if (initialCoins > 0 && !isCompanyAgent) {
      const available = Number(agent.wallet?.availableBalance ?? 0);
      if (available < initialCoins) {
        throw new WalletError(
          `Insufficient coins. Available: ${available}, Required: ${initialCoins}`
        );
      }
    }

    const targetRole = await prisma.role.findUniqueOrThrow({
      where: { name: targetRoleName },
    });
    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

    return prisma.$transaction(async (tx) => {
      // 1. Debit agent wallet if coins were allocated (and not Company)
      if (initialCoins > 0 && !isCompanyAgent && agent.wallet) {
        const agentWallet = await tx.wallet.findUniqueOrThrow({
          where: { id: agent.wallet.id },
        });

        const newBal = Number(agentWallet.balance) - initialCoins;
        const newAvail = Number(agentWallet.availableBalance) - initialCoins;

        await tx.wallet.update({
          where: { id: agentWallet.id },
          data: {
            balance: newBal,
            availableBalance: newAvail,
            version: { increment: 1 },
          },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: agentWallet.id,
            type: 'AGENT_DEPOSIT',
            status: 'COMPLETED',
            amount: initialCoins,
            balanceBefore: agentWallet.balance,
            balanceAfter: newBal,
            availableBefore: agentWallet.availableBalance,
            availableAfter: newAvail,
            lockedBefore: agentWallet.lockedBalance,
            lockedAfter: agentWallet.lockedBalance,
            description: `Transferred coins to new user @${normalizedUsername}`,
            referenceType: 'agent_create_downline',
          },
        });
      }

      // 2. Create downline user
      const newUser = await tx.user.create({
        data: {
          username: normalizedUsername,
          email: `${normalizedUsername}@ghoriexch.local`,
          displayName: input.displayName?.trim() || input.username,
          passwordHash,
          parentId: agent.id,
          status: 'ACTIVE',
          isUnlimited: targetRoleName === 'COMPANY',
          roles: { create: [{ roleId: targetRole.id, grantedBy: agent.id }] },
          wallet: {
            create: {
              balance: initialCoins,
              availableBalance: initialCoins,
              lockedBalance: 0,
              currency: 'USD',
            },
          },
        },
        include: {
          roles: { include: { role: true } },
          wallet: true,
        },
      });

      // 3. Log credit transaction for new user if initialCoins > 0
      if (initialCoins > 0 && newUser.wallet) {
        await tx.walletTransaction.create({
          data: {
            walletId: newUser.wallet.id,
            type: 'AGENT_DEPOSIT',
            status: 'COMPLETED',
            amount: initialCoins,
            balanceBefore: 0,
            balanceAfter: initialCoins,
            availableBefore: 0,
            availableAfter: initialCoins,
            lockedBefore: 0,
            lockedAfter: 0,
            description: `Initial coins received from @${agent.username}`,
            referenceType: 'upline_initial_coins',
            referenceId: agent.id,
          },
        });
      }

      return {
        id: newUser.id,
        username: newUser.username,
        displayName: newUser.displayName,
        role: targetRoleName,
        level: HIERARCHY_LEVELS[targetRoleName],
        status: newUser.status,
        balance: decimalToString(newUser.wallet?.availableBalance ?? 0),
        parentId: agent.id,
        parentUsername: agent.username,
      };
    });
  }

  /** Transfer coins between logged-in agent and a downline user (Deposit or Withdraw) */
  async transferCoins(
    agentId: string,
    targetUserId: string,
    rawAmount: number,
    direction: 'deposit' | 'withdraw'
  ) {
    const amount = parseAmount(rawAmount);
    if (amount <= 0) throw new ValidationError('Amount must be greater than 0');

    const [agent, target] = await Promise.all([
      prisma.user.findUnique({
        where: { id: agentId },
        include: { roles: { include: { role: true } }, wallet: true },
      }),
      prisma.user.findUnique({
        where: { id: targetUserId },
        include: { roles: { include: { role: true } }, wallet: true },
      }),
    ]);

    if (!agent) throw new NotFoundError('Agent not found');
    if (!target) throw new NotFoundError('Target user not found');

    // Hierarchy check: target must be downline of agent
    if (target.parentId !== agent.id) {
      throw new ForbiddenError('You can only transfer coins to your own downlines');
    }

    const agentRoles = agent.roles.map((r) => r.role.name as RoleName);
    const agentRole = getHighestRole(agentRoles);
    const isCompany = agent.isUnlimited || agentRole === 'COMPANY';

    return prisma.$transaction(async (tx) => {
      const agentWallet = await tx.wallet.findUniqueOrThrow({ where: { userId: agent.id } });
      const targetWallet = await tx.wallet.findUniqueOrThrow({ where: { userId: target.id } });

      if (direction === 'deposit') {
        // Agent gives coins to downline
        if (!isCompany) {
          const avail = Number(agentWallet.availableBalance);
          if (avail < amount) {
            throw new WalletError(`Insufficient coins. Available: ${avail}, Required: ${amount}`);
          }

          const agBal = Number(agentWallet.balance) - amount;
          const agAvail = Number(agentWallet.availableBalance) - amount;

          await tx.wallet.update({
            where: { id: agentWallet.id },
            data: { balance: agBal, availableBalance: agAvail, version: { increment: 1 } },
          });

          await tx.walletTransaction.create({
            data: {
              walletId: agentWallet.id,
              type: 'AGENT_DEPOSIT',
              status: 'COMPLETED',
              amount,
              balanceBefore: agentWallet.balance,
              balanceAfter: agBal,
              availableBefore: agentWallet.availableBalance,
              availableAfter: agAvail,
              lockedBefore: agentWallet.lockedBalance,
              lockedAfter: agentWallet.lockedBalance,
              description: `Coins sent to downline @${target.username}`,
              referenceType: 'agent_deposit_out',
              referenceId: target.id,
            },
          });
        }

        // Credit target
        const tarBal = Number(targetWallet.balance) + amount;
        const tarAvail = Number(targetWallet.availableBalance) + amount;

        await tx.wallet.update({
          where: { id: targetWallet.id },
          data: { balance: tarBal, availableBalance: tarAvail, version: { increment: 1 } },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: targetWallet.id,
            type: 'AGENT_DEPOSIT',
            status: 'COMPLETED',
            amount,
            balanceBefore: targetWallet.balance,
            balanceAfter: tarBal,
            availableBefore: targetWallet.availableBalance,
            availableAfter: tarAvail,
            lockedBefore: targetWallet.lockedBalance,
            lockedAfter: targetWallet.lockedBalance,
            description: `Coins received from upline @${agent.username}`,
            referenceType: 'agent_deposit_in',
            referenceId: agent.id,
          },
        });

        return {
          success: true,
          direction: 'deposit',
          amount,
          targetUsername: target.username,
          targetBalance: decimalToString(tarAvail),
          agentBalance: isCompany ? 'Unlimited' : decimalToString(Number(agentWallet.availableBalance) - amount),
        };
      } else {
        // Agent withdraws / recalls coins from downline
        const tarAvail = Number(targetWallet.availableBalance);
        if (tarAvail < amount) {
          throw new WalletError(
            `Downline has insufficient available coins. Available: ${tarAvail}, Requested: ${amount}`
          );
        }

        const tarBal = Number(targetWallet.balance) - amount;
        const newTarAvail = tarAvail - amount;

        await tx.wallet.update({
          where: { id: targetWallet.id },
          data: { balance: tarBal, availableBalance: newTarAvail, version: { increment: 1 } },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: targetWallet.id,
            type: 'AGENT_WITHDRAW',
            status: 'COMPLETED',
            amount,
            balanceBefore: targetWallet.balance,
            balanceAfter: tarBal,
            availableBefore: targetWallet.availableBalance,
            availableAfter: newTarAvail,
            lockedBefore: targetWallet.lockedBalance,
            lockedAfter: targetWallet.lockedBalance,
            description: `Coins withdrawn by upline @${agent.username}`,
            referenceType: 'agent_withdraw_out',
            referenceId: agent.id,
          },
        });

        let newAgAvail = Number(agentWallet.availableBalance);
        if (!isCompany) {
          const agBal = Number(agentWallet.balance) + amount;
          newAgAvail = Number(agentWallet.availableBalance) + amount;

          await tx.wallet.update({
            where: { id: agentWallet.id },
            data: { balance: agBal, availableBalance: newAgAvail, version: { increment: 1 } },
          });

          await tx.walletTransaction.create({
            data: {
              walletId: agentWallet.id,
              type: 'AGENT_WITHDRAW',
              status: 'COMPLETED',
              amount,
              balanceBefore: agentWallet.balance,
              balanceAfter: agBal,
              availableBefore: agentWallet.availableBalance,
              availableAfter: newAgAvail,
              lockedBefore: agentWallet.lockedBalance,
              lockedAfter: agentWallet.lockedBalance,
              description: `Coins recalled from downline @${target.username}`,
              referenceType: 'agent_withdraw_in',
              referenceId: target.id,
            },
          });
        }

        return {
          success: true,
          direction: 'withdraw',
          amount,
          targetUsername: target.username,
          targetBalance: decimalToString(newTarAvail),
          agentBalance: isCompany ? 'Unlimited' : decimalToString(newAgAvail),
        };
      }
    });
  }

  /** Toggle active/suspended status of downline */
  async updateDownlineStatus(agentId: string, targetUserId: string, status: 'ACTIVE' | 'SUSPENDED') {
    const target = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundError('User not found');
    if (target.parentId !== agentId) {
      throw new ForbiddenError('You can only modify your own downlines');
    }

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: { status },
    });

    return { id: updated.id, username: updated.username, status: updated.status };
  }

  /** Reset password of a downline */
  async resetDownlinePassword(agentId: string, targetUserId: string, newPass: string) {
    if (!newPass || newPass.length < 6) {
      throw new ValidationError('Password must be at least 6 characters');
    }

    const target = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundError('User not found');
    if (target.parentId !== agentId) {
      throw new ForbiddenError('You can only modify your own downlines');
    }

    const passwordHash = await bcrypt.hash(newPass, SALT_ROUNDS);
    await prisma.user.update({
      where: { id: targetUserId },
      data: { passwordHash },
    });

    return { success: true, username: target.username };
  }
}

export const agentService = new AgentService();
