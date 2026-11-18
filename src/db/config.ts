export interface PgPoolResolvedConfig {
  host: string;
  port?: number;
  user: string;
  password: string;
  database: string;
  max: number;
  connectionTimeoutMillis: number;
  ssl?: false | { rejectUnauthorized: false };
}

export interface DrizzleAdminResolvedConfig {
  host: string;
  port?: number;
  user: string;
  password: string;
  database: string;
  ssl: boolean | { rejectUnauthorized: false };
}

export function isUnixSocketHost(host?: string): boolean {
  return Boolean(host && host.trim().startsWith('/'));
}

export function shouldUseSsl(env: Record<string, string | undefined>, host: string): boolean {
  if (isUnixSocketHost(host)) return false;
  const raw = (env.SQL_SSL || '').trim().toLowerCase();
  if (raw === 'true' || raw === '1' || raw === 'require') return true;
  if (raw === 'false' || raw === '0' || raw === 'disable') return false;
  return false;
}

/**
 * Resolves a PostgreSQL pg.Pool configuration using the Object Method (`host`, `port`, `user`, `password`, `database`).
 * Seamlessly handles Cloud SQL Auth Proxy Unix domain sockets (`/cloudsql/...`), local TCP Postgres, and SSL cloud Postgres.
 */
export function resolvePgPoolConfig(
  env: Record<string, string | undefined> = process.env
): PgPoolResolvedConfig {
  const host = (env.SQL_HOST || 'localhost').trim();
  const user = (env.SQL_USER || env.SQL_ADMIN_USER || 'postgres').trim();
  const password = env.SQL_PASSWORD ?? env.SQL_ADMIN_PASSWORD ?? '';
  const database = (env.SQL_DB_NAME || 'ai_knowledge_engine').trim();
  const parsedPort = env.SQL_PORT ? Number(env.SQL_PORT) : 5432;
  const useSsl = shouldUseSsl(env, host);

  const config: PgPoolResolvedConfig = {
    host,
    user,
    password,
    database,
    max: 10,
    connectionTimeoutMillis: 15000,
  };

  if (!isUnixSocketHost(host)) {
    config.port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 5432;
    if (useSsl) {
      config.ssl = { rejectUnauthorized: false };
    }
  }

  return config;
}

/**
 * Resolves admin credentials for Drizzle Kit (`drizzle.config.ts`).
 * Prefers `SQL_ADMIN_USER` / `SQL_ADMIN_PASSWORD` (Cloud SQL), falling back cleanly to `SQL_USER` / `SQL_PASSWORD` for cloned local repos.
 */
export function resolveDrizzleAdminConfig(
  env: Record<string, string | undefined> = process.env
): DrizzleAdminResolvedConfig {
  const host = (env.SQL_HOST || 'localhost').trim();
  const database = (env.SQL_DB_NAME || 'ai_knowledge_engine').trim();
  const user = (env.SQL_ADMIN_USER || env.SQL_USER || 'postgres').trim();
  const password = env.SQL_ADMIN_PASSWORD ?? env.SQL_PASSWORD ?? '';
  const parsedPort = env.SQL_PORT ? Number(env.SQL_PORT) : 5432;
  const useSsl = shouldUseSsl(env, host);

  const config: DrizzleAdminResolvedConfig = {
    host,
    user,
    password,
    database,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  };

  if (!isUnixSocketHost(host)) {
    config.port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 5432;
  }

  return config;
}
