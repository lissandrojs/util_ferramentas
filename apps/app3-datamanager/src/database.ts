import { Pool, PoolClient } from 'pg';
import { logger } from './utils/logger';

class Database {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
    this.pool.on('error', (err) => logger.error('DB pool error: ' + err.message));
  }

  async connect(): Promise<void> {
    const client = await this.pool.connect();
    client.release();
    await this.migrate();
  }

  async query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]> {
    const result = await this.pool.query(text, params);
    return result.rows as T[];
  }

  async queryOne<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T | null> {
    const rows = await this.query<T>(text, params);
    return rows[0] ?? null;
  }

  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
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
  }

  private async migrate(): Promise<void> {
    await this.pool.query(`
      -- ── Entity Types (e.g. "Produtos", "Boletos", "Clientes") ─────
      CREATE TABLE IF NOT EXISTS entity_types (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id     UUID NOT NULL,
        name          VARCHAR(255) NOT NULL,
        slug          VARCHAR(100) NOT NULL,
        description   TEXT,
        icon          VARCHAR(50)  DEFAULT 'database',
        color         VARCHAR(20)  DEFAULT '#6c63ff',
        record_count  INTEGER      NOT NULL DEFAULT 0,
        created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        UNIQUE(tenant_id, slug)
      );

      -- ── Field Definitions ──────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS entity_fields (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_type_id  UUID NOT NULL REFERENCES entity_types(id) ON DELETE CASCADE,
        tenant_id       UUID NOT NULL,
        name            VARCHAR(255) NOT NULL,
        field_key       VARCHAR(100) NOT NULL,
        field_type      VARCHAR(50)  NOT NULL,
        required        BOOLEAN      NOT NULL DEFAULT false,
        default_value   JSONB,
        options         JSONB,
        validation      JSONB,
        order_index     INTEGER      NOT NULL DEFAULT 0,
        is_searchable   BOOLEAN      NOT NULL DEFAULT true,
        is_filterable   BOOLEAN      NOT NULL DEFAULT true,
        show_in_list    BOOLEAN      NOT NULL DEFAULT true,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        UNIQUE(entity_type_id, field_key)
      );

      -- ── Dynamic Records ────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS entity_records (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_type_id  UUID NOT NULL REFERENCES entity_types(id) ON DELETE CASCADE,
        tenant_id       UUID NOT NULL,
        data            JSONB NOT NULL DEFAULT '{}',
        search_vector   TSVECTOR,
        created_by      UUID,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at      TIMESTAMPTZ
      );

      -- ── File Attachments ───────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS record_files (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id       UUID NOT NULL,
        record_id       UUID REFERENCES entity_records(id) ON DELETE CASCADE,
        entity_type_id  UUID NOT NULL,
        field_key       VARCHAR(100) NOT NULL,
        original_name   VARCHAR(500) NOT NULL,
        stored_name     VARCHAR(500) NOT NULL,
        mime_type       VARCHAR(100),
        size_bytes      INTEGER,
        storage_type    VARCHAR(20) NOT NULL DEFAULT 'local',
        storage_path    TEXT NOT NULL,
        public_url      TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- ── Webhooks ───────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS ddm_webhooks (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id       UUID NOT NULL,
        entity_type_id  UUID REFERENCES entity_types(id) ON DELETE CASCADE,
        name            VARCHAR(255) NOT NULL,
        url             TEXT NOT NULL,
        events          TEXT[] NOT NULL DEFAULT '{}',
        secret          VARCHAR(255),
        is_active       BOOLEAN NOT NULL DEFAULT true,
        last_triggered  TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- ── Indexes ────────────────────────────────────────────────────
      CREATE INDEX IF NOT EXISTS idx_entity_types_tenant     ON entity_types(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_entity_fields_entity    ON entity_fields(entity_type_id);
      CREATE INDEX IF NOT EXISTS idx_entity_records_entity   ON entity_records(entity_type_id);
      CREATE INDEX IF NOT EXISTS idx_entity_records_tenant   ON entity_records(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_entity_records_deleted  ON entity_records(deleted_at) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_entity_records_data     ON entity_records USING GIN(data);
      CREATE INDEX IF NOT EXISTS idx_entity_records_search   ON entity_records USING GIN(search_vector);
      CREATE INDEX IF NOT EXISTS idx_record_files_record     ON record_files(record_id);
      CREATE INDEX IF NOT EXISTS idx_record_files_tenant     ON record_files(tenant_id);
    `);
    logger.info('✅ DDM migrations applied');
  }
}

export const db = new Database();
