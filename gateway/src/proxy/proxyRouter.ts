import { Express, Request, Response, NextFunction } from 'express';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';
import { ClientRequest, IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import { authenticate, requireAppAccess } from '../middleware/auth';
import { logger } from '../utils/logger';

interface AppConfig {
  key: string;
  pathPrefix: string;
  target: string;
  protected: boolean;
  requiredPlan?: string[];
  description: string;
}

// App1 servido como static — App3 (DDM) servido como static + rotas internas
export const APP_REGISTRY: AppConfig[] = [
  {
    key: 'app2',
    pathPrefix: '/app2',
    target: process.env.APP2_URLSHORTENER_URL || 'http://localhost:4001',
    protected: true,
    requiredPlan: ['free', 'pro'],
    description: 'URL Shortener',
  },
];

function buildProxyOptions(appConfig: AppConfig): Options {
  return {
    target: appConfig.target,
    changeOrigin: true,
    pathRewrite: (path: string) =>
      path.replace(new RegExp('^' + appConfig.pathPrefix), ''),
    on: {
      proxyReq: (proxyReq: ClientRequest, req: IncomingMessage) => {
        const expressReq = req as unknown as Request;
        if (expressReq.user) {
          proxyReq.setHeader('X-User-ID', expressReq.user.sub);
          proxyReq.setHeader('X-Tenant-ID', expressReq.user.tenantId);
          proxyReq.setHeader('X-User-Role', expressReq.user.role);
          proxyReq.setHeader('X-User-Plan', expressReq.user.plan);
          proxyReq.setHeader('X-User-Email', expressReq.user.email);
        }
        const requestId = (req.headers['x-request-id'] as string) || '';
        proxyReq.setHeader('X-Request-ID', requestId);
        proxyReq.setHeader('X-Forwarded-App', appConfig.key);
      },
      error: (err: Error, _req: IncomingMessage, res: ServerResponse | Socket) => {
        logger.error('Proxy error for ' + appConfig.key + ': ' + err.message);
        if (res instanceof ServerResponse && !res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'Service ' + appConfig.description + ' is temporarily unavailable',
            code: 'UPSTREAM_ERROR',
          }));
        }
      },
    },
  };
}

export function setupProxy(app: Express): void {
  for (const appConfig of APP_REGISTRY) {
    const middlewares: Array<(req: Request, res: Response, next: NextFunction) => void> = [];

    if (appConfig.protected) {
      middlewares.push(authenticate);
      middlewares.push(requireAppAccess(appConfig.key));
    }

    const proxy = createProxyMiddleware(buildProxyOptions(appConfig));

    app.use(
      appConfig.pathPrefix,
      ...middlewares,
      proxy as unknown as (req: Request, res: Response, next: NextFunction) => void,
    );

    logger.info(
      '🔁 Proxy: ' + appConfig.pathPrefix + ' → ' + appConfig.target +
      ' [' + (appConfig.protected ? '🔒 protected' : '🔓 public') + ']'
    );
  }
}
