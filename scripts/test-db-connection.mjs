import "dotenv/config";

import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

try {
  const { rows } = await pool.query(`
    select
      current_database() as database,
      current_user as user,
      version() as version,
      exists(select 1 from pg_extension where extname = 'vector') as vector_enabled
  `);

  console.log(JSON.stringify(rows[0], null, 2));
} finally {
  await pool.end();
}
