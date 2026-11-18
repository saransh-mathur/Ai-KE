import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as schema from './schema.ts';
import { resolvePgPoolConfig } from './config.ts';

dotenv.config();

// Add global connection pool caching to persist across hot-reloads
declare global {
  var _postgresPool: Pool | undefined;
}

// Create or retrieve the connection pool strictly via the Object Method
export const createPool = () => {
  if (!global._postgresPool) {
    const cfg = resolvePgPoolConfig(process.env);
    global._postgresPool = new Pool({
      host: cfg.host,
      ...(cfg.port !== undefined ? { port: cfg.port } : {}),
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      ...(cfg.ssl !== undefined ? { ssl: cfg.ssl } : {}),
      max: cfg.max,
      connectionTimeoutMillis: cfg.connectionTimeoutMillis,
    });

    // Prevent unhandled pool-level errors from crashing the application
    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

export const pool = createPool();
export const db = drizzle(pool, { schema });
