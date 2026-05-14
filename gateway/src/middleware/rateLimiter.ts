import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000; // 15 min
const maxRequests = Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100;

// ── General API rate limiter ────────────────────────────
export const rateLimiter = rateLimit({
  windowMs,
  max: maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) =>
    req.user?.tenantId || req.ip || 'anonymous',
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'Muitas requisições. Tente novamente em alguns minutos.',
      code: 'RATE_LIMIT_EXCEEDED',
    });
  },
});

// ── Stricter limiter for auth endpoints ────────────────
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.ip || 'anonymous',
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
    });
  },
});

// ── Per-plan usage limiter factory ─────────────────────
export function createUsageLimiter(freePlanMax: number, proPlanMax: number) {
  return rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 24h window
    max: (req: Request) => {
      if (req.user?.plan === 'pro') return proPlanMax;
      return freePlanMax;
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => req.user?.sub || req.ip || 'anonymous',
    handler: (_req: Request, res: Response) => {
      res.status(429).json({
        success: false,
        error: 'Limite diário atingido. Faça upgrade para o plano Pro.',
        code: 'USAGE_LIMIT_EXCEEDED',
        upgradeUrl: '/checkout.html',
      });
    },
  });
}
