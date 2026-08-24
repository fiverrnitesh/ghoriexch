export const ROLES = {
  USER: 'USER',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

export const ADMIN_ROLES: RoleName[] = [ROLES.ADMIN, ROLES.SUPER_ADMIN];

export function hasRole(userRoles: RoleName[], role: RoleName): boolean {
  return userRoles.includes(role);
}

export function isAdmin(userRoles: RoleName[]): boolean {
  return userRoles.some((r) => ADMIN_ROLES.includes(r));
}

export function isSuperAdmin(userRoles: RoleName[]): boolean {
  return userRoles.includes(ROLES.SUPER_ADMIN);
}
