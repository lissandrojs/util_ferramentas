#!/usr/bin/env node
/**
 * Seed script — creates the first admin user
 * Run: node scripts/seed-admin.js
 * Or:  DATABASE_URL=... node scripts/seed-admin.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../gateway/.env') });

const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  // Admin credentials — change these before running!
  const ADMIN_NAME     = process.env.ADMIN_NAME     || 'Admin';
  const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@util-ferramentas.com';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || generatePassword();

  console.log('\n🌱 Seed: criando usuário admin...\n');
  console.log('  Email:  ', ADMIN_EMAIL);
  console.log('  Senha:  ', ADMIN_PASSWORD);
  console.log('  (anote a senha — ela não será exibida novamente)\n');

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [ADMIN_EMAIL]);
  if (existing.rows[0]) {
    console.log('⚠️  Usuário já existe. Nada foi alterado.');
    await pool.end();
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const slug = 'admin-' + crypto.randomBytes(4).toString('hex');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tenantRes = await client.query(
      `INSERT INTO tenants (name, slug, plan) VALUES ($1, $2, 'pro') RETURNING id`,
      ['Admin Workspace', slug]
    );
    const tenantId = tenantRes.rows[0].id;

    await client.query(
      `INSERT INTO users (tenant_id, email, password_hash, name, role) VALUES ($1, $2, $3, $4, 'admin')`,
      [tenantId, ADMIN_EMAIL, passwordHash, ADMIN_NAME]
    );

    await client.query('COMMIT');
    console.log('✅ Usuário admin criado com sucesso!');
    console.log('   Acesse: /app1 → Login com o email e senha acima.\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Erro:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

function generatePassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

main().catch(err => { console.error(err); process.exit(1); });
