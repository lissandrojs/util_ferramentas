import 'express-async-errors';
import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { db } from './database';
import { logger } from './utils/logger';
import { requireTenant, devTenant } from './middleware/tenant';
import { entitiesRouter } from './routes/entities.routes';
import { fieldsRouter } from './routes/fields.routes';
import { recordsRouter } from './routes/records.routes';
import { filesRouter, exportRouter, webhooksRouter } from './routes/extra.routes';

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'data-manager' }));

// Inject dev tenant when no gateway headers present (local dev only)
if (process.env.NODE_ENV !== 'production') {
  app.use('/api', devTenant);
}

// All API routes require tenant context
app.use('/api', requireTenant);

// ── Routes ─────────────────────────────────────────────────────
app.use('/api/entities', entitiesRouter);
app.use('/api/entities/:entityId/fields',    fieldsRouter);
app.use('/api/entities/:entityId/records',   recordsRouter);
app.use('/api/entities/:entityId/export',    exportRouter);
app.use('/api/entities/:entityId/webhooks',  webhooksRouter);
app.use('/api/files', filesRouter);

// ── Serve React client ─────────────────────────────────────────
const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// ── Error handler ──────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled: ' + err.message);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

const PORT = process.env.PORT || 4002;

db.connect().then(() => {
  app.listen(PORT, () => {
    logger.info(`📊 Data Manager running on port ${PORT}`);
  });
}).catch((err) => {
  logger.error('Fatal: ' + err.message);
  process.exit(1);
});
