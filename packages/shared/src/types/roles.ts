export const ROLES = {
  COMPANY: 'COMPANY',
  PANEL: 'PANEL',
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  SUPER_MASTER: 'SUPER_MASTER',
  MASTER: 'MASTER',
  USER: 'USER',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

export const HIERARCHY_LEVELS: Record<RoleName, number> = {
  COMPANY: 1,
  PANEL: 2,
  SUPER_ADMIN: 3,
  ADMIN: 4,
  SUPER_MASTER: 5,
  MASTER: 6,
  USER: 7,
};

export const HIERARCHY_NAMES: Record<RoleName, string> = {
  COMPANY: 'Company',
  PANEL: 'Panel',
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  SUPER_MASTER: 'Super Master',
  MASTER: 'Master',
  USER: 'User',
};

export const HIERARCHY_CHILD_ROLE: Record<RoleName, RoleName | null> = {
  COMPANY: 'PANEL',
  PANEL: 'SUPER_ADMIN',
  SUPER_ADMIN: 'ADMIN',
  ADMIN: 'SUPER_MASTER',
  SUPER_MASTER: 'MASTER',
  MASTER: 'USER',
  USER: null,
};

export const AGENT_ROLES: RoleName[] = [
  ROLES.COMPANY,
  ROLES.PANEL,
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.SUPER_MASTER,
  ROLES.MASTER,
];

export const ADMIN_ROLES: RoleName[] = [
  ROLES.COMPANY,
  ROLES.PANEL,
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.SUPER_MASTER,
  ROLES.MASTER,
];

export function hasRole(userRoles: RoleName[], role: RoleName): boolean {
  return userRoles.includes(role);
}

export function isAgent(userRoles: RoleName[]): boolean {
  return userRoles.some((r) => AGENT_ROLES.includes(r));
}

export function isAdmin(userRoles: RoleName[]): boolean {
  return userRoles.some((r) => ADMIN_ROLES.includes(r));
}

export function isSuperAdmin(userRoles: RoleName[]): boolean {
  return userRoles.includes(ROLES.SUPER_ADMIN) || userRoles.includes(ROLES.PANEL) || userRoles.includes(ROLES.COMPANY);
}

export function isCompany(userRoles: RoleName[]): boolean {
  return userRoles.includes(ROLES.COMPANY);
}

export function getHighestRole(userRoles: RoleName[]): RoleName {
  let highest: RoleName = ROLES.USER;
  let minLevel = 999;
  for (const role of userRoles) {
    const level = HIERARCHY_LEVELS[role] ?? 999;
    if (level < minLevel) {
      minLevel = level;
      highest = role;
    }
  }
  return highest;
}

export function getAllowedChildRoles(userRole: RoleName): RoleName[] {
  const currentLevel = HIERARCHY_LEVELS[userRole] ?? 999;
  if (currentLevel >= 7) return [];
  const roles: RoleName[] = [
    ROLES.COMPANY,
    ROLES.PANEL,
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN,
    ROLES.SUPER_MASTER,
    ROLES.MASTER,
    ROLES.USER,
  ];
  return roles.filter((r) => HIERARCHY_LEVELS[r] > currentLevel);
}
