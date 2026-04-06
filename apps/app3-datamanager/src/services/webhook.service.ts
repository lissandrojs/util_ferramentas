import { createHmac } from 'crypto';
import { db } from '../database';
import { logger } from '../utils/logger';

export type WebhookEvent = 'record.created' | 'record.updated' | 'record.deleted';

export async function dispatchWebhook(
  tenantId: string,
  entityTypeId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>
): Promise<void> {
  const hooks = await db.query<{
    id: string;
    url: string;
    events: string[];
    secret: string | null;
  }>(
    `SELECT id, url, events, secret FROM ddm_webhooks
     WHERE tenant_id = $1
       AND (entity_type_id = $2 OR entity_type_id IS NULL)
       AND is_active = true
       AND $3 = ANY(events)`,
    [tenantId, entityTypeId, event]
  );

  for (const hook of hooks) {
    // Fire-and-forget — don't await, don't block request
    setImmediate(async () => {
      try {
        const body = JSON.stringify({
          event,
          timestamp: new Date().toISOString(),
          tenant_id: tenantId,
          entity_type_id: entityTypeId,
          data: payload,
        });

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Webhook-Event': event,
        };

        if (hook.secret) {
          const sig = createHmac('sha256', hook.secret).update(body).digest('hex');
          headers['X-Webhook-Signature'] = `sha256=${sig}`;
        }

        const { default: fetch } = await import('node-fetch').catch(() => ({ default: null }));
        if (!fetch) return; // node-fetch not available

        const res = await (fetch as Function)(hook.url, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(10000),
        });

        await db.query(
          'UPDATE ddm_webhooks SET last_triggered = NOW() WHERE id = $1',
          [hook.id]
        );

        logger.info(`Webhook ${event} → ${hook.url} [${res.status}]`);
      } catch (err) {
        logger.error(`Webhook failed for ${hook.url}: ${(err as Error).message}`);
      }
    });
  }
}
