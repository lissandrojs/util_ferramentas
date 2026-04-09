import 'express-async-errors';
import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import path from 'path';
import { setupMiddleware } from './config/middleware';
import { setupRoutes } from './routes';
import { setupProxy } from './proxy/proxyRouter';
import { logger } from './utils/logger';
import { db } from './config/database';
import { AppError } from './utils/AppError';

// ── DDM (App3) routes ──────────────────────────────────────────
import { authenticate, injectDdmTenant } from './middleware/auth';
import { entitiesRouter } from './ddm/routes/entities.routes';
import { fieldsRouter }   from './ddm/routes/fields.routes';
import { recordsRouter }  from './ddm/routes/records.routes';
import { filesRouter, exportRouter, webhooksRouter } from './ddm/routes/extra.routes';

// ── App4 (Video Downloader) routes ─────────────────────────────
import { videoRouter } from './app4/video.routes';

// ── App2 (URL Shortener) routes ────────────────────────────────
import { urlShortenerRouter, redirectRouter, migrateUrlShortener } from './app2/urlshortener.routes';

const app = express();
const server = createServer(app);

async function bootstrap() {
  await db.connect();
  logger.info('✅ Database connected');

  // Run App2 migrations
  await migrateUrlShortener();

  setupMiddleware(app);
  setupRoutes(app);

  // ── Serve App1 (dashboard) static files at /app1 ──────────
  const app1Dist = path.join(__dirname, '../../apps/app1-dashboard/dist');
  app.use('/app1', express.static(app1Dist));
  app.get('/app1/*', (_req: Request, res: Response) => {
    res.sendFile(path.join(app1Dist, 'index.html'));
  });

  // ── Serve checkout.html ────────────────────────────────────
  const checkoutFile = path.join(__dirname, '../../apps/app1-dashboard/public/checkout.html');
  app.get('/checkout.html', (_req: Request, res: Response) => {
    res.sendFile(checkoutFile);
  });

  // ── Serve App3 (Data Manager) static files at /app3 ───────
  const app3Dist = path.join(__dirname, '../../apps/app3-datamanager/client/dist');
  app.use('/app3', express.static(app3Dist));
  app.get('/app3/*', (_req: Request, res: Response) => {
    res.sendFile(path.join(app3Dist, 'index.html'));
  });

  // ── Serve App4 (Video Downloader) static files at /app4 ───
  const app4Dist = path.join(__dirname, '../../apps/app4-videodownloader/client/dist');
  app.use('/app4', express.static(app4Dist));
  app.get('/app4/*', (_req: Request, res: Response) => {
    res.sendFile(path.join(app4Dist, 'index.html'));
  });

  // ── Serve App2 (URL Shortener) static files at /app2 ──────
  const app2Dist = path.join(__dirname, '../../apps/app2-urlshortener/client/dist');
  app.use('/app2', express.static(app2Dist));
  app.get('/app2/*', (_req: Request, res: Response) => {
    res.sendFile(path.join(app2Dist, 'index.html'));
  });

  // ── Public short link redirects /r/:slug ───────────────────
  app.use(redirectRouter);

  // ── Mount App2 (URL Shortener) API routes ─────────────────
  app.use('/api/app2', authenticate, urlShortenerRouter);

  // ── Mount DDM API routes (protected by JWT) ────────────────
  // Frontend baseURL = /api/ddm, then calls /entities, /entities/:id/fields etc.
  app.use('/api/ddm/entities', authenticate, injectDdmTenant, entitiesRouter);
  app.use('/api/ddm/entities/:entityId/fields',   authenticate, injectDdmTenant, fieldsRouter);
  app.use('/api/ddm/entities/:entityId/records',  authenticate, injectDdmTenant, recordsRouter);
  app.use('/api/ddm/entities/:entityId/export',   authenticate, injectDdmTenant, exportRouter);
  app.use('/api/ddm/entities/:entityId/webhooks', authenticate, injectDdmTenant, webhooksRouter);
  app.use('/api/ddm-files',  authenticate, injectDdmTenant, filesRouter);

  // ── Mount App4 (Video) API routes ─────────────────────────
  // Public — no auth required, rate limiting applied by service
  app.use('/api/video', videoRouter);

  // ── Redirect raiz para /app1 ──────────────────────────────
  app.get('/', (_req: Request, res: Response) => {
    res.redirect('/app1');
  });

  // ── Proxy reverso para App2 (/app2) ───────────────────────
  setupProxy(app);

  // ── 404 para /api/* não encontrado (DEVE ser o último) ────
  app.use('/api/*', (_req: Request, res: Response) => {
    res.status(404).json({ success: false, error: 'API endpoint not found', code: 'NOT_FOUND' });
  });

  app.use(errorHandler);

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    logger.info(`🚀 Gateway na porta ${PORT} [${process.env.NODE_ENV}]`);
    logger.info(`📂 App1 estático em: ${app1Dist}`);
    logger.info(`📂 App3 estático em: ${app3Dist}`);
    logger.info(`📊 DDM API em: /api/ddm`);
  });
}

function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false, error: err.message, code: err.code,
    });
  }
  logger.error(`Unhandled error on ${req.method} ${req.path}: ${err.message}`);
  return res.status(500).json({ success: false, error: 'Internal server error' });
}

bootstrap().catch((err) => {
  logger.error('Fatal error during bootstrap: ' + err.message);
  process.exit(1);
});

export { app };
