import 'express-async-errors';
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { createServer } from 'http';
import { setupMiddleware } from './config/middleware';
import { setupRoutes } from './routes';
import { setupProxy } from './proxy/proxyRouter';
import { logger } from './utils/logger';
import { db } from './config/database';

const app = express();
const server = createServer(app);

async function bootstrap() {
  // ── Connect to database ──────────────────────────────
  await db.connect();
  logger.info('✅ Database connected');

  // ── Global middleware (helmet, cors, rate limit, etc) ─
  setupMiddleware(app);

  // ── Internal API routes (/api/auth, /api/users, etc) ─
  setupRoutes(app);

  // ── Reverse proxy routes (/app1, /app2, etc) ─────────
  setupProxy(app);

  // ── Global error handler ──────────────────────────────
  app.use(errorHandler);

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    logger.info(`🚀 Gateway running on port ${PORT} [${process.env.NODE_ENV}]`);
    logger.info(`📡 Proxying: /app1 → ${process.env.APP1_DASHBOARD_URL}`);
    logger.info(`📡 Proxying: /app2 → ${process.env.APP2_URLSHORTENER_URL}`);
  });
}

// ── Global error handler middleware ────────────────────
import { Request, Response, NextFunction } from 'express';
import { AppError } from './utils/AppError';

function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
    });
  }

  logger.error(`Unhandled error on ${req.method} ${req.path}: ${(err as Error).message}`);

  return res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
}

bootstrap().catch((err) => {
  logger.error(err, 'Fatal error during bootstrap');
  process.exit(1);
});

export { app };
