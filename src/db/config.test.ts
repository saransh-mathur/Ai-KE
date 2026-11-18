import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isUnixSocketHost,
  resolveDrizzleAdminConfig,
  resolvePgPoolConfig,
} from './config.ts';

test('isUnixSocketHost distinguishes Cloud SQL sockets from TCP hosts', () => {
  assert.equal(isUnixSocketHost('/cloudsql/project:region:instance'), true);
  assert.equal(isUnixSocketHost('localhost'), false);
  assert.equal(isUnixSocketHost('127.0.0.1'), false);
  assert.equal(isUnixSocketHost(undefined), false);
});

test('resolvePgPoolConfig configures Cloud SQL Auth Proxy Unix socket without port or SSL', () => {
  const cfg = resolvePgPoolConfig({
    SQL_HOST: '/cloudsql/my-proj:asia-southeast1:my-db',
    SQL_USER: 'app_user',
    SQL_PASSWORD: 'secret',
    SQL_DB_NAME: 'enterprise_db',
  });

  assert.equal(cfg.host, '/cloudsql/my-proj:asia-southeast1:my-db');
  assert.equal(cfg.port, undefined);
  assert.equal(cfg.ssl, undefined);
  assert.equal(cfg.user, 'app_user');
  assert.equal(cfg.database, 'enterprise_db');
});

test('resolvePgPoolConfig configures sensible defaults for copied local repo', () => {
  const cfg = resolvePgPoolConfig({});
  assert.equal(cfg.host, 'localhost');
  assert.equal(cfg.port, 5432);
  assert.equal(cfg.user, 'postgres');
  assert.equal(cfg.database, 'ai_knowledge_engine');
  assert.equal(cfg.ssl, undefined);
});

test('resolvePgPoolConfig honors SQL_PORT and SQL_SSL for hosted Postgres', () => {
  const cfg = resolvePgPoolConfig({
    SQL_HOST: 'db.example.com',
    SQL_PORT: '6543',
    SQL_USER: 'postgres',
    SQL_PASSWORD: 'pw',
    SQL_DB_NAME: 'prod_kg',
    SQL_SSL: 'true',
  });

  assert.equal(cfg.host, 'db.example.com');
  assert.equal(cfg.port, 6543);
  assert.deepEqual(cfg.ssl, { rejectUnauthorized: false });
});

test('resolveDrizzleAdminConfig prioritizes SQL_ADMIN_USER and falls back to SQL_USER locally', () => {
  const cloudCfg = resolveDrizzleAdminConfig({
    SQL_HOST: '/cloudsql/p:r:i',
    SQL_DB_NAME: 'db',
    SQL_ADMIN_USER: 'cloudsql_admin',
    SQL_ADMIN_PASSWORD: 'admin_pw',
    SQL_USER: 'app_user',
    SQL_PASSWORD: 'app_pw',
  });
  assert.equal(cloudCfg.user, 'cloudsql_admin');
  assert.equal(cloudCfg.password, 'admin_pw');
  assert.equal(cloudCfg.port, undefined);

  const localCfg = resolveDrizzleAdminConfig({
    SQL_HOST: 'localhost',
    SQL_DB_NAME: 'ai_knowledge_engine',
    SQL_USER: 'postgres',
    SQL_PASSWORD: 'postgres_local',
  });
  assert.equal(localCfg.user, 'postgres');
  assert.equal(localCfg.password, 'postgres_local');
  assert.equal(localCfg.port, 5432);
});
