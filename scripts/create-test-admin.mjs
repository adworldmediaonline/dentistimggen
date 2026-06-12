import "dotenv/config";

import { generateId } from "@better-auth/core/utils/id";
import { hashPassword } from "@better-auth/utils/password";
import pg from "pg";

const { Pool } = pg;

const email = (
  process.argv[2] ??
  process.env.TEST_ADMIN_EMAIL ??
  "admin@admin.com"
).toLowerCase();
const password =
  process.argv[3] ?? process.env.TEST_ADMIN_PASSWORD ?? "Admin123";
const name = process.argv[4] ?? process.env.TEST_ADMIN_NAME ?? "Test Admin";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

if (password.length < 8) {
  console.error("Admin password must be at least 8 characters");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const now = new Date();
const passwordHash = await hashPassword(password);

try {
  const result = await pool.query(
    `
      with existing_user as (
        select id from "user" where email = $1
      ),
      inserted_user as (
        insert into "user" (
          id,
          name,
          email,
          "emailVerified",
          "createdAt",
          "updatedAt",
          role,
          banned
        )
        select $2, $3, $1, true, $4, $4, 'admin', false
        where not exists (select 1 from existing_user)
        returning id
      ),
      selected_user as (
        select id from inserted_user
        union all
        select id from existing_user
        limit 1
      ),
      updated_user as (
        update "user"
        set
          name = $3,
          "emailVerified" = true,
          "updatedAt" = $4,
          role = 'admin',
          banned = false,
          "banReason" = null,
          "banExpires" = null
        where id = (select id from selected_user)
        returning id, email, name, role
      ),
      existing_account as (
        select id
        from "account"
        where "userId" = (select id from selected_user)
          and "providerId" = 'credential'
        limit 1
      ),
      updated_account as (
        update "account"
        set
          "accountId" = (select id from selected_user),
          password = $6,
          "updatedAt" = $4
        where id = (select id from existing_account)
        returning id
      ),
      inserted_account as (
        insert into "account" (
          id,
          "accountId",
          "providerId",
          "userId",
          password,
          "createdAt",
          "updatedAt"
        )
        select $5, (select id from selected_user), 'credential', (select id from selected_user), $6, $4, $4
        where not exists (select 1 from updated_account)
        returning id
      ),
      selected_account as (
        select id from updated_account
        union all
        select id from inserted_account
        limit 1
      )
      select
        updated_user.id,
        updated_user.email,
        updated_user.name,
        updated_user.role,
        (select id from selected_account) as "accountId"
      from updated_user
    `,
    [email, generateId(), name, now, generateId(), passwordHash]
  );

  const admin = result.rows[0];

  if (!admin) {
    throw new Error("Admin user was not created or updated");
  }

  console.log(
    JSON.stringify(
      {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        accountId: admin.accountId,
        password: process.argv[3] ? "(provided via CLI)" : password,
      },
      null,
      2
    )
  );
} finally {
  await pool.end();
}
