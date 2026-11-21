import { APIGatewayProxyEvent } from 'aws-lambda';

export type Role = 'admin' | 'operator' | 'viewer';

export interface AuthContext {
  userId: string;
  role: Role;
  email: string;
}

export const ROLE_PERMISSIONS: Record<Role, Set<string>> = {
  admin: new Set([
    'read:all',
    'write:all',
    'delete:all',
    'audit:read',
    'bulk:import',
  ]),
  operator: new Set([
    'read:all',
    'write:own',
    'write:shared',
    'audit:read',
    'bulk:import',
  ]),
  viewer: new Set([
    'read:all',
    'audit:read',
  ]),
};

export function extractAuthContext(event: APIGatewayProxyEvent): AuthContext {
  const authHeader = event.headers['Authorization'] || '';
  const token = authHeader.replace('Bearer ', '');
  
  if (!token) {
    throw new Error('Missing authorization token');
  }
  
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
    return {
      userId: decoded.userId || 'unknown',
      role: (decoded.role || 'viewer') as Role,
      email: decoded.email || 'unknown@example.com',
    };
  } catch (error) {
    throw new Error('Invalid authorization token');
  }
}

export function hasPermission(role: Role, permission: string): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) return false;
  
  if (permissions.has(permission)) return true;
  
  const [resource, action] = permission.split(':');
  if (permissions.has(`${resource}:*`)) return true;
  if (permissions.has(`*:${action}`)) return true;
  if (permissions.has('*:*')) return true;
  
  return false;
}

export function requirePermission(role: Role, permission: string): void {
  if (!hasPermission(role, permission)) {
    throw new Error(`Forbidden: ${permission}`);
  }
}

export function requireRole(role: Role, allowedRoles: Role[]): void {
  if (!allowedRoles.includes(role)) {
    throw new Error(`Forbidden: role ${role} not allowed`);
  }
}