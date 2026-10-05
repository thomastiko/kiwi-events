import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  clearSqlTestDb,
  connectSqlTestDb,
  disconnectSqlTestDb,
  hasSqlTestDatabaseConfiguration,
} from "../../helpers/sqlTestDb.js";
import { getDatabaseConnection } from "../../../src/modules/database/database.service.js";

describe.skipIf(!hasSqlTestDatabaseConfiguration())(
  "SQL integration test setup",
  () => {
    beforeAll(async () => {
      await connectSqlTestDb();
    });

    afterAll(async () => {
      await clearSqlTestDb();
      await disconnectSqlTestDb();
    });

    it("connects to the dedicated SQL test database", async () => {
      const db = getDatabaseConnection();

      const result = await db.raw("select 1 as KIWI_EVENTS_db_check");

      expect(result).toBeDefined();
    });

    it("runs SQL migrations and creates the core tables", async () => {
      const db = getDatabaseConnection();

      await expect(db.schema.hasTable("event_users")).resolves.toBe(true);
      await expect(db.schema.hasTable("events")).resolves.toBe(true);
      await expect(db.schema.hasTable("ticket_types")).resolves.toBe(true);
      await expect(db.schema.hasTable("orders")).resolves.toBe(true);
      await expect(db.schema.hasTable("tickets")).resolves.toBe(true);
      await expect(db.schema.hasTable("payment_refunds")).resolves.toBe(true);
      await expect(db.schema.hasTable("email_templates")).resolves.toBe(true);
      await expect(db.schema.hasTable("email_logs")).resolves.toBe(true);
    });

    it("can write, read and clean SQL test data", async () => {
      const db = getDatabaseConnection();

      await db("event_users").insert({
        id: "sql-smoke-event-user-1",
        auth_provider: "local",
        email_snapshot: "sql-smoke@example.com",
        password_hash: "test-password-hash",
        first_name_snapshot: "SQL",
        last_name_snapshot: "Smoke",
        role: "admin",
        must_change_password: false,
        last_login_at: null,
        is_active: true,
        notes: "",
        created_at: new Date(),
        updated_at: new Date(),
      });

      const user = await db("event_users")
        .where({
          id: "sql-smoke-event-user-1",
        })
        .first();

      expect(user).toBeDefined();
      expect(user.email_snapshot).toBe("sql-smoke@example.com");

      await clearSqlTestDb();

      const countResult = await db("event_users").count("* as count").first();
      const count = Number(countResult.count);

      expect(count).toBe(0);
    });
  },
);
