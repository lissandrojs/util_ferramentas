import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';

class Database {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      ssl:
        process.env.NODE_ENV === 'production'
          ? { rejectUnauthorized: false }
          : false,
    });

    this.pool.on('error', (err) => {
      logger.error('Unexpected database pool error: ' + err.message);
    });
  }

  async connect(): Promise<void> {
    const client = await this.pool.connect();
    client.release();
    await this.runMigrations();
  }

  async query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ): Promise<T[]> {
    const start = Date.now();
    const result = await this.pool.query(text, params);
    const duration = Date.now() - start;

    if (duration > 1000) {
      logger.warn(`Slow query detected (${duration}ms): ${text}`);
    }

    return result.rows as T[];
  }

  async queryOne<T = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ): Promise<T | null> {
    const rows = await this.query<T>(text, params);
    return rows[0] ?? null;
  }

  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  async transaction<T>(
    fn: (client: PoolClient) => Promise<T>
  ): Promise<T> {
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

  private async runMigrations(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        plan VARCHAR(50) NOT NULL DEFAULT 'free',
        stripe_customer_id VARCHAR(255),
        stripe_subscription_id VARCHAR(255),
        is_active BOOLEAN NOT NULL DEFAULT true,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'member',
        is_active BOOLEAN NOT NULL DEFAULT true,
        email_verified BOOLEAN NOT NULL DEFAULT false,
        last_login_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS app_permissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        app_key VARCHAR(100) NOT NULL,
        can_access BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS usage_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        app_key VARCHAR(100) NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_usage_events_tenant_app ON usage_events(tenant_id, app_key);
      CREATE INDEX IF NOT EXISTS idx_usage_events_created_at ON usage_events(created_at);
    `);

    // ── License & Payment tables ─────────────────────────────
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(255) NOT NULL,
        description     TEXT,
        price_cents     INTEGER NOT NULL,
        currency        VARCHAR(3) NOT NULL DEFAULT 'BRL',
        license_type    VARCHAR(50) NOT NULL DEFAULT 'perpetual',
        duration_days   INTEGER,
        max_activations INTEGER NOT NULL DEFAULT 1,
        is_active       BOOLEAN NOT NULL DEFAULT true,
        metadata        JSONB DEFAULT '{}',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS licenses (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        license_key       VARCHAR(50) UNIQUE NOT NULL,
        product_id        UUID NOT NULL REFERENCES products(id),
        customer_name     VARCHAR(255) NOT NULL,
        customer_email    VARCHAR(255) NOT NULL,
        customer_doc      VARCHAR(20),
        status            VARCHAR(30) NOT NULL DEFAULT 'pending_payment',
        max_activations   INTEGER NOT NULL DEFAULT 1,
        activations_count INTEGER NOT NULL DEFAULT 0,
        activated_at      TIMESTAMPTZ,
        expires_at        TIMESTAMPTZ,
        notes             TEXT,
        metadata          JSONB DEFAULT '{}',
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS license_activations (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        license_id    UUID NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
        machine_id    VARCHAR(255) NOT NULL,
        machine_name  VARCHAR(255),
        ip_address    VARCHAR(50),
        first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        is_active     BOOLEAN NOT NULL DEFAULT true,
        UNIQUE(license_id, machine_id)
      );

      CREATE TABLE IF NOT EXISTS pix_payments (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        license_id      UUID NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
        amount_cents    INTEGER NOT NULL,
        currency        VARCHAR(3) NOT NULL DEFAULT 'BRL',
        pix_type        VARCHAR(20) NOT NULL DEFAULT 'static',
        txid            VARCHAR(100),
        end_to_end_id   VARCHAR(100),
        pix_key         VARCHAR(255),
        qrcode_base64   TEXT,
        qrcode_text     TEXT,
        payload_url     TEXT,
        gateway         VARCHAR(50) NOT NULL DEFAULT 'manual',
        gateway_id      VARCHAR(255),
        gateway_payload JSONB DEFAULT '{}',
        status          VARCHAR(20) NOT NULL DEFAULT 'pending',
        paid_at         TIMESTAMPTZ,
        expires_at      TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS license_events (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        license_id  UUID NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
        event_type  VARCHAR(50) NOT NULL,
        actor       VARCHAR(100),
        description TEXT,
        metadata    JSONB DEFAULT '{}',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_licenses_key           ON licenses(license_key);
      CREATE INDEX IF NOT EXISTS idx_licenses_email         ON licenses(customer_email);
      CREATE INDEX IF NOT EXISTS idx_licenses_status        ON licenses(status);
      CREATE INDEX IF NOT EXISTS idx_pix_payments_license   ON pix_payments(license_id);
      CREATE INDEX IF NOT EXISTS idx_pix_payments_txid      ON pix_payments(txid);
      CREATE INDEX IF NOT EXISTS idx_pix_payments_status    ON pix_payments(status);
      CREATE INDEX IF NOT EXISTS idx_license_events_license ON license_events(license_id);
      CREATE INDEX IF NOT EXISTS idx_activations_license    ON license_activations(license_id);
    `);

    // ── DDM (Gerenciador de Dados Dinâmicos) tables ──────────
    await this.pool.query(`
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

      CREATE INDEX IF NOT EXISTS idx_entity_types_tenant    ON entity_types(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_entity_fields_entity   ON entity_fields(entity_type_id);
      CREATE INDEX IF NOT EXISTS idx_entity_records_entity  ON entity_records(entity_type_id);
      CREATE INDEX IF NOT EXISTS idx_entity_records_tenant  ON entity_records(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_entity_records_deleted ON entity_records(deleted_at) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_entity_records_data    ON entity_records USING GIN(data);
      CREATE INDEX IF NOT EXISTS idx_entity_records_search  ON entity_records USING GIN(search_vector);
      CREATE INDEX IF NOT EXISTS idx_record_files_record    ON record_files(record_id);
      CREATE INDEX IF NOT EXISTS idx_record_files_tenant    ON record_files(tenant_id);
    `);

    logger.info('✅ Database migrations applied');
  }
}

export const db = new Database();
