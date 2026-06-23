export const ROLE_RANK: Record<string, number> = { reviewer: 1, senior: 2, admin: 3 };
export const ROLES = Object.keys(ROLE_RANK);

export function rank(role: string | undefined): number {
  return ROLE_RANK[role ?? ""] ?? 0;
}

export function meetsRole(userRole: string | undefined, minRole: string): boolean {
  return rank(userRole) >= rank(minRole);
}
