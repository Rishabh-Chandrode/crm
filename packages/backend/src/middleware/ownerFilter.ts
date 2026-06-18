import type { AuthenticatedUser } from '../types/index.js';

/**
 * Returns a SQL AND clause + bound value for ownership filtering.
 * Admins see all rows; regular users see only their own.
 *
 * Usage:
 *   const { sql, values } = ownerFilter(req.user!, 'c', conditions.length + values.length + 1);
 *   if (sql) { conditions.push(sql); values.push(...values); }
 */
export function ownerFilter(
  user: AuthenticatedUser,
  tableAlias: string,
  paramIndex: number
): { sql: string; value: string | null } {
  if (user.role === 'admin') return { sql: '', value: null };
  return { sql: `${tableAlias}.created_by = $${paramIndex}`, value: user.id };
}
