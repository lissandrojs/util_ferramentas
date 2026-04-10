import { Express } from 'express';
import { authRouter } from './auth.routes';
import { usersRouter } from './users.routes';
import { billingRouter, webhookRouter } from './billing.routes';
import {
  licenseAdminRouter,
  licensePublicRouter,
  licenseWebhookRouter,
} from './licenses.routes';
import { seoRouter } from './seo.routes';

export function setupRoutes(app: Express): void {
  // ── SEO — landing page, sitemap, robots.txt ────────────────
  app.use(seoRouter);

  // ── Stripe webhook ─────────────────────────────────────────
  app.use(webhookRouter);

  // ── PIX webhooks (no auth) ─────────────────────────────────
  app.use('/api/webhooks', licenseWebhookRouter);

  // ── Internal API routes ─────────────────────────────────────
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/billing', billingRouter);

  // ── License public routes (checkout, validate) ──────────────
  app.use('/api/licenses', licensePublicRouter);

  // ── License admin routes (protected) ────────────────────────
  app.use('/api/admin', licenseAdminRouter);

  // ── Apps registry (public) ──────────────────────────────
  app.get('/api/apps', (_req, res) => {
    const { APP_REGISTRY } = require('../proxy/proxyRouter');
    res.json({
      success: true,
      data: APP_REGISTRY.map((a: { key: string; description: string; pathPrefix: string }) => ({
        key: a.key,
        description: a.description,
        path: a.pathPrefix,
      })),
    });
  });
  // NOTE: /api/* 404 handler is in server.ts AFTER all routes are mounted
}
