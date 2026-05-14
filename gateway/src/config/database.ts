import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => logger.error('DB pool error: ' + err.message));

export const db = {
  async connect(): Promise<void> {
    await pool.query('SELECT 1');
    logger.info('✅ DB conectado');
    await runMigrations(pool);
  },

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    const res = await pool.query(sql, params);
    return res.rows as T[];
  },

  async queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null> {
    const res = await pool.query(sql, params);
    return (res.rows[0] as T) ?? null;
  },

  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};

// ── Run each statement separately (Neon serverless requirement) ──
async function runMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Core tables ────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name        VARCHAR(255) NOT NULL,
        slug        VARCHAR(100) UNIQUE NOT NULL,
        plan        VARCHAR(50)  NOT NULL DEFAULT 'free',
        is_active   BOOLEAN      NOT NULL DEFAULT true,
        metadata    JSONB        DEFAULT '{}',
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        email           VARCHAR(255) UNIQUE NOT NULL,
        password_hash   VARCHAR(255) NOT NULL,
        name            VARCHAR(255) NOT NULL,
        role            VARCHAR(50)  NOT NULL DEFAULT 'admin',
        is_active       BOOLEAN      NOT NULL DEFAULT true,
        last_login_at   TIMESTAMPTZ,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS plan_apps (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        plan        VARCHAR(50)  NOT NULL,
        app_key     VARCHAR(100) NOT NULL,
        can_access  BOOLEAN      NOT NULL DEFAULT true,
        UNIQUE (plan, app_key)
      )
    `);

    await client.query(`
      INSERT INTO plan_apps (plan, app_key, can_access) VALUES
        ('free', 'app2',  false),
        ('free', 'app3',  false),
        ('free', 'app4',  true),
        ('free', 'app5',  true),
        ('free', 'app6',  true),
        ('free', 'app7',  true),
        ('free', 'app8',  true),
        ('free', 'app9',  true),
        ('free', 'app10', true),
        ('pro',  'app2',  true),
        ('pro',  'app3',  true),
        ('pro',  'app4',  true),
        ('pro',  'app5',  true),
        ('pro',  'app6',  true),
        ('pro',  'app7',  true),
        ('pro',  'app8',  true),
        ('pro',  'app9',  true),
        ('pro',  'app10', true)
      ON CONFLICT (plan, app_key) DO NOTHING
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS purchase_requests (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(255) NOT NULL,
        email           VARCHAR(255) NOT NULL,
        plan            VARCHAR(50)  NOT NULL DEFAULT 'pro',
        amount_cents    INTEGER      NOT NULL,
        status          VARCHAR(30)  NOT NULL DEFAULT 'pending_payment',
        pix_txid        VARCHAR(100),
        admin_notes     TEXT,
        approved_by     VARCHAR(255),
        approved_at     TIMESTAMPTZ,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS app_permissions (
        id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id   UUID    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        app_key     VARCHAR(100) NOT NULL,
        can_access  BOOLEAN NOT NULL DEFAULT true,
        UNIQUE (tenant_id, app_key)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash  VARCHAR(255) NOT NULL,
        expires_at  TIMESTAMPTZ  NOT NULL,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS short_links (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id    UUID NOT NULL,
        user_id      UUID,
        slug         VARCHAR(20) UNIQUE NOT NULL,
        original_url TEXT NOT NULL,
        title        VARCHAR(255),
        expires_at   TIMESTAMPTZ,
        is_active    BOOLEAN NOT NULL DEFAULT true,
        click_count  INTEGER NOT NULL DEFAULT 0,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS link_clicks (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        link_id    UUID NOT NULL REFERENCES short_links(id) ON DELETE CASCADE,
        tenant_id  UUID NOT NULL,
        referrer   TEXT,
        user_agent TEXT,
        clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS entity_types (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id   UUID NOT NULL,
        name        VARCHAR(255) NOT NULL,
        slug        VARCHAR(255) NOT NULL,
        description TEXT,
        icon        VARCHAR(100) DEFAULT 'box',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, slug)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS entity_fields (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_type_id UUID NOT NULL REFERENCES entity_types(id) ON DELETE CASCADE,
        name           VARCHAR(255) NOT NULL,
        field_key      VARCHAR(100) NOT NULL,
        field_type     VARCHAR(50)  NOT NULL DEFAULT 'text',
        required       BOOLEAN      NOT NULL DEFAULT false,
        options        JSONB        DEFAULT '[]',
        order_index    INTEGER      NOT NULL DEFAULT 0,
        is_searchable  BOOLEAN      NOT NULL DEFAULT false,
        show_in_list   BOOLEAN      NOT NULL DEFAULT true,
        min            TEXT,
        max            TEXT,
        created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS entity_records (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_type_id UUID NOT NULL REFERENCES entity_types(id) ON DELETE CASCADE,
        tenant_id      UUID NOT NULL,
        data           JSONB NOT NULL DEFAULT '{}',
        search_text    TEXT,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS record_files (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        record_id      UUID NOT NULL REFERENCES entity_records(id) ON DELETE CASCADE,
        field_key      VARCHAR(100) NOT NULL,
        original_name  VARCHAR(255) NOT NULL,
        storage_path   TEXT NOT NULL,
        mime_type      VARCHAR(100),
        size_bytes     INTEGER,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── Indexes ─────────────────────────────────────────────────
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_email         ON users(email)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_tenant        ON users(tenant_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_short_links_slug    ON short_links(slug)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_short_links_tenant  ON short_links(tenant_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_entity_types_tenant ON entity_types(tenant_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_entity_records_type ON entity_records(entity_type_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_purchase_email      ON purchase_requests(email)`);

    await client.query('COMMIT');
    logger.info('✅ Migrations concluídas');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration error: ' + (err as Error).message);
    throw err;
  } finally {
    client.release();
  }
}
