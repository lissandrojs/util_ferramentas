import { Request, Response, NextFunction } from 'express';

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: string;
  plan: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
    }
  }
}

export function requireTenant(req: Request, res: Response, next: NextFunction): void {
  const tenantId = req.headers['x-tenant-id'] as string;
  const userId   = req.headers['x-user-id']   as string;

  if (!tenantId || !userId) {
    res.status(401).json({ error: 'Missing tenant context. Route through gateway.' });
    return;
  }

  req.tenant = {
    tenantId,
    userId,
    role:  (req.headers['x-user-role']  as string) || 'member',
    plan:  (req.headers['x-user-plan']  as string) || 'free',
    email: (req.headers['x-user-email'] as string) || '',
  };

  next();
}

// Dev middleware — injects a fake tenant for local testing without gateway
export function devTenant(req: Request, _res: Response, next: NextFunction): void {
  if (!req.headers['x-tenant-id']) {
    req.headers['x-tenant-id'] = process.env.DEV_TENANT_ID || '00000000-0000-0000-0000-000000000001';
    req.headers['x-user-id']   = process.env.DEV_USER_ID   || '00000000-0000-0000-0000-000000000001';
    req.headers['x-user-role'] = 'admin';
    req.headers['x-user-plan'] = 'pro';
  }
  next();
}
