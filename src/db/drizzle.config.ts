import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";
import { resolveDrizzleAdminConfig } from "./config.ts";

dotenv.config();

const creds = resolveDrizzleAdminConfig(process.env);

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: {
    host: creds.host,
    ...(creds.port !== undefined ? { port: creds.port } : {}),
    user: creds.user,
    password: creds.password,
    database: creds.database,
    ssl: creds.ssl,
  },
  verbose: true,
});
