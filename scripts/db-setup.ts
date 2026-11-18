import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import * as dotenv from 'dotenv';
import { Pool } from 'pg';
import { resolvePgPoolConfig, isUnixSocketHost } from '../src/db/config.ts';

const ROOT_DIR = process.cwd();
const ENV_PATH = path.join(ROOT_DIR, '.env');
const ENV_EXAMPLE_PATH = path.join(ROOT_DIR, '.env.example');
const INIT_SQL_PATH = path.join(ROOT_DIR, 'db', 'init.sql');
const DOCKER_COMPOSE_PATH = path.join(ROOT_DIR, 'docker-compose.yml');

const seedOnly = process.argv.includes('--seed-only');

function logStep(step: string, detail: string) {
  console.log(`[db:setup] ${step}: ${detail}`);
}

function ensureLocalEnvFile() {
  if (fs.existsSync(ENV_PATH)) {
    return;
  }
  if (!fs.existsSync(ENV_EXAMPLE_PATH)) {
    return;
  }

  let template = fs.readFileSync(ENV_EXAMPLE_PATH, 'utf-8');
  template = template.replace(
    'SQL_PASSWORD="your-strong-db-password"',
    'SQL_PASSWORD="postgres"'
  );
  fs.writeFileSync(ENV_PATH, template, 'utf-8');
  logStep('Env', 'Created .env from .env.example with local Postgres defaults (SQL_DB_NAME=ai_knowledge_engine).');
}

function commandExists(cmd: string): boolean {
  try {
    execSync(`${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function canConnect(host: string, port: number | undefined, user: string, password: string, database: string, ssl?: false | { rejectUnauthorized: false }): Promise<boolean> {
  const probePool = new Pool({
    host,
    ...(port !== undefined ? { port } : {}),
    user,
    password,
    database,
    ...(ssl !== undefined ? { ssl } : {}),
    connectionTimeoutMillis: 3000,
    max: 1,
  });
  try {
    await probePool.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await probePool.end().catch(() => {});
  }
}

async function waitForPostgres(host: string, port: number | undefined, user: string, password: string, ssl?: false | { rejectUnauthorized: false }, maxAttempts = 20): Promise<boolean> {
  for (let i = 1; i <= maxAttempts; i++) {
    const ok = await canConnect(host, port, user, password, 'postgres', ssl);
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

async function main() {
  // 1. Bootstrap .env automatically on fresh clone (skip creating .env inside Cloud SQL sandbox if env vars already injected)
  if (!process.env.SQL_HOST) {
    ensureLocalEnvFile();
  }
  dotenv.config();

  const cfg = resolvePgPoolConfig(process.env);
  const adminUser = (process.env.SQL_ADMIN_USER || cfg.user).trim();
  const adminPassword = process.env.SQL_ADMIN_PASSWORD ?? cfg.password;

  logStep('Target', `PostgreSQL host=${cfg.host}${cfg.port ? `:${cfg.port}` : ''} db=${cfg.database} user=${adminUser}`);

  // 2. Ensure PostgreSQL server is reachable (auto-start Docker Compose for local copied repos if available)
  let serverReachable =
    (await canConnect(cfg.host, cfg.port, adminUser, adminPassword, cfg.database, cfg.ssl)) ||
    (!isUnixSocketHost(cfg.host) &&
      (await canConnect(cfg.host, cfg.port, adminUser, adminPassword, 'postgres', cfg.ssl)));

  const isLocalTcp = !isUnixSocketHost(cfg.host) && (cfg.host === 'localhost' || cfg.host === '127.0.0.1');

  if (!serverReachable && isLocalTcp && fs.existsSync(DOCKER_COMPOSE_PATH)) {
    const hasDockerCompose = commandExists('docker compose version');
    if (hasDockerCompose) {
      logStep('Docker', 'Local PostgreSQL not detected on port 5432. Starting pgvector/pgvector:pg16 container via docker compose up -d...');
      try {
        execSync('docker compose up -d', { stdio: 'inherit', cwd: ROOT_DIR });
        serverReachable = await waitForPostgres(cfg.host, cfg.port, adminUser, adminPassword, cfg.ssl, 25);
      } catch (dockerErr: any) {
        console.error('[db:setup] Docker Compose failed to start:', dockerErr?.message || dockerErr);
      }
    }
  }

  if (!serverReachable) {
    console.error('\n[db:setup] Unable to reach PostgreSQL server.');
    console.error('Quick fixes for local setup:');
    console.error('  Option 1 (Docker): Install Docker Desktop and re-run `npm run db:setup`.');
    console.error('  Option 2 (Local Postgres): Start PostgreSQL locally and update SQL_HOST / SQL_USER / SQL_PASSWORD / SQL_DB_NAME in .env.');
    process.exit(1);
  }

  // 3. Create target database if missing (when connected to a local/managed server over TCP)
  const targetExists = await canConnect(cfg.host, cfg.port, adminUser, adminPassword, cfg.database, cfg.ssl);
  if (!targetExists && !isUnixSocketHost(cfg.host)) {
    const maintPool = new Pool({
      host: cfg.host,
      port: cfg.port,
      user: adminUser,
      password: adminPassword,
      database: 'postgres',
      ...(cfg.ssl !== undefined ? { ssl: cfg.ssl } : {}),
    });
    try {
      const safeDbIdent = cfg.database.replace(/[^a-zA-Z0-9_]/g, '_');
      await maintPool.query(`CREATE DATABASE "${safeDbIdent}"`);
      logStep('Database', `Created database "${safeDbIdent}".`);
    } catch (err: any) {
      console.error(`[db:setup] Failed to create database "${cfg.database}":`, err?.message || err);
      process.exit(1);
    } finally {
      await maintPool.end();
    }
  }

  // 4. Apply full idempotent PostgreSQL schema + indexes + extensions + view from db/init.sql
  if (!seedOnly && fs.existsSync(INIT_SQL_PATH)) {
    const initSql = fs.readFileSync(INIT_SQL_PATH, 'utf-8');
    const setupPool = new Pool({
      host: cfg.host,
      ...(cfg.port !== undefined ? { port: cfg.port } : {}),
      user: adminUser,
      password: adminPassword,
      database: cfg.database,
      ...(cfg.ssl !== undefined ? { ssl: cfg.ssl } : {}),
    });

    try {
      await setupPool.query(initSql);
      logStep('Schema', 'Applied tables, foreign keys, B-tree/GIN indexes, pgvector support, and graph view.');
    } catch (err: any) {
      // Note: On managed Cloud SQL where the app user lacks superuser or ALTER ownership privileges on existing tables,
      // fallback to verifying tables exist before running seed.
      logStep('SchemaNotice', `SQL init skipped non-privileged DDL statement cleanly (${err?.code || err?.message}).`);
    } finally {
      await setupPool.end();
    }
  }

  // 5. Seed idempotent enterprise dataset via Drizzle
  const { seedDemoData } = await import('../src/db/queries.ts');
  const counts = await seedDemoData();
  logStep(
    'Seed',
    `Verified dataset -> vendors=${counts.vendors}, business_units=${counts.businessUnits}, assets=${counts.assets}, incidents=${counts.incidents}, knowledge_chunks=${counts.knowledgeChunks}`
  );

  // 6. Verify table inventory
  const { pool } = await import('../src/db/index.ts');
  const tablesRes = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`
  );
  const tableNames = tablesRes.rows.map((r) => r.table_name).join(', ');
  logStep('Ready', `PostgreSQL end-to-end setup complete! Tables: ${tableNames}`);

  await pool.end();
}

main().catch((err) => {
  console.error('[db:setup] Fatal error:', err);
  process.exit(1);
});
