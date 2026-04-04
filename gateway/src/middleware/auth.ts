import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError';
import { db } from '../config/database';

export interface JwtPayload {
  sub: string;        // user ID
  tenantId: string;
  email: string;
  role: string;
  plan: string;       // free | pro
  iat: number;
  exp: number;
}

// Augment Express Request
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// ── Verify JWT token from Authorization header ──────────
export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError('Missing or malformed Authorization header', 401, 'UNAUTHORIZED');
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET!
    ) as JwtPayload;

    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError('Token expired', 401, 'TOKEN_EXPIRED');
    }
    throw new AppError('Invalid token', 401, 'INVALID_TOKEN');
  }
}

// ── Optional auth — doesn't block, just enriches req ───
export function optionalAuthenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      req.user = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    } catch {
      // token invalid — continue without user context
    }
  }

  next();
}

// ── Role-based access control ───────────────────────────
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    if (!roles.includes(req.user.role)) {
      throw new AppError(
        `Access denied. Required roles: ${roles.join(', ')}`,
        403,
        'FORBIDDEN'
      );
    }

    next();
  };
}

// ── Plan-based access control ───────────────────────────
export function requirePlan(...plans: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    if (!plans.includes(req.user.plan)) {
      throw new AppError(
        'Upgrade your plan to access this feature',
        402,
        'PLAN_UPGRADE_REQUIRED'
      );
    }

    next();
  };
}

// ── Check per-app access permissions ───────────────────
export function requireAppAccess(appKey: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    // Admins always have access
    if (req.user.role === 'admin') {
      next();
      return;
    }

    const permission = await db.queryOne(
      `SELECT can_access FROM app_permissions 
       WHERE tenant_id = $1 AND user_id = $2 AND app_key = $3`,
      [req.user.tenantId, req.user.sub, appKey]
    );

    if (!permission || !(permission as { can_access: boolean }).can_access) {
      throw new AppError(
        `You don't have access to ${appKey}`,
        403,
        'APP_ACCESS_DENIED'
      );
    }

    next();
  };
}

// ── Token generation utilities ─────────────────────────
export function generateTokens(payload: Omit<JwtPayload, 'iat' | 'exp'>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accessToken = jwt.sign(payload as any, process.env.JWT_SECRET!, {
    expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as any,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refreshToken = jwt.sign(
    { sub: payload.sub },
    process.env.JWT_SECRET!,
    { expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '30d') as any }
  );

  return { accessToken, refreshToken };
}
