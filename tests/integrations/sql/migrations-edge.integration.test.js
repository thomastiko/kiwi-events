import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  clearSqlTestDb,
  connectSqlTestDb,
  disconnectSqlTestDb,
  getSqlTestProvider,
  getSqlTestUri,
} from "../../helpers/sqlTestDb.js";

import {
  getDatabaseConnection,
  getDatabaseProvider,
  getDatabaseStatus,
  testDatabaseConnection,
} from "../../../src/modules/database/database.service.js";
import { runLatestMigrations } from "../../../src/modules/database/migration.service.js";
import { createEvent } from "../../../src/modules/events/repositories/event.repository.js";
import {
  EVENT_CATEGORIES,
  EVENT_STATUSES,
  EVENT_VISIBILITIES,
} from "../../../src/modules/events/event.constants.js";

function buildFutureSession() {
  const startAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const endAt = new Date(startAt.getTime() + 2 * 60 * 60 * 1000);

  return {
    startAt,
    endAt,
    timezone: "Europe/Vienna",
    locationLabel: "Migration Hall",
    locationDetails: "Room 1",
    capacity: 100,
    status: "scheduled",
  };
}

function buildEventPayload(overrides = {}) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    title: "SQL Migration Edge Event",
    slug: `sql-migration-edge-event-${suffix}`,
    shortDescription: "Event used by SQL migration edge tests.",
    description: "This event verifies migration and repository compatibility.",
    category: EVENT_CATEGORIES.EVENT,
    status: EVENT_STATUSES.DRAFT,
    visibility: EVENT_VISIBILITIES.PUBLIC,
    location: "WU Wien",
    imageAssetIds: [],
    tags: ["sql", "migration", "edge"],
    sessions: [buildFutureSession()],
    faqs: [],
    isFree: true,
    salesStartAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    salesEndAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
    isFeatured: false,
    featuredOrder: 0,
    notesInternal: "Created by SQL migration edge integration test",
    ...overrides,
  };
}

async function getCurrentDatabaseName(db) {
  const rawResult = await db.raw("SELECT DATABASE() AS databaseName");
  const rows = Array.isArray(rawResult) ? rawResult[0] : rawResult?.rows;

  return rows?.[0]?.databaseName;
}

async function getColumnMetadata(db, tableName, columnName) {
  const databaseName = await getCurrentDatabaseName(db);

  const rawResult = await db.raw(
    `
      SELECT
        COLUMN_NAME AS columnName,
        DATA_TYPE AS dataType,
        COLUMN_DEFAULT AS columnDefault,
        IS_NULLABLE AS isNullable
      FROM information_schema.columns
      WHERE table_schema = ?
        AND table_name = ?
        AND column_name = ?
      LIMIT 1
    `,
    [databaseName, tableName, columnName],
  );

  const rows = Array.isArray(rawResult) ? rawResult[0] : rawResult?.rows;

  return rows?.[0] || null;
}

describe("SQL migration/config edge integration", () => {
  beforeAll(async () => {
    await connectSqlTestDb();
  });

  beforeEach(async () => {
    await clearSqlTestDb();
  });

  afterAll(async () => {
    await clearSqlTestDb();
    await disconnectSqlTestDb();
  });

  it("connects using the configured SQL provider without exposing the test URI", async () => {
    const provider = getSqlTestProvider();
    const uri = getSqlTestUri();

    expect(getDatabaseProvider()).toBe(provider);

    const status = getDatabaseStatus();

    expect(status).toMatchObject({
      provider,
      configured: true,
      state: "connected",
    });

    expect(status).not.toHaveProperty("uri");
    expect(JSON.stringify(status)).not.toContain(uri);

    const connectionTest = await testDatabaseConnection({
      provider,
      uri,
    });

    expect(connectionTest).toMatchObject({
      success: true,
      provider,
    });
  });

  it("creates the current kiwi-events SQL schema including multi-image event support", async () => {
    const db = getDatabaseConnection();

    await expect(db.schema.hasTable("event_users")).resolves.toBe(true);
    await expect(db.schema.hasTable("media_assets")).resolves.toBe(true);
    await expect(db.schema.hasTable("events")).resolves.toBe(true);
    await expect(db.schema.hasTable("event_sessions")).resolves.toBe(true);
    await expect(db.schema.hasTable("event_tags")).resolves.toBe(true);
    await expect(db.schema.hasTable("event_faqs")).resolves.toBe(true);
    await expect(db.schema.hasTable("ticket_types")).resolves.toBe(true);
    await expect(db.schema.hasTable("ticket_templates")).resolves.toBe(true);
    await expect(db.schema.hasTable("discount_code_groups")).resolves.toBe(
      true,
    );
    await expect(db.schema.hasTable("discount_codes")).resolves.toBe(true);
    await expect(db.schema.hasTable("orders")).resolves.toBe(true);
    await expect(db.schema.hasTable("tickets")).resolves.toBe(true);
    await expect(db.schema.hasTable("email_templates")).resolves.toBe(true);
    await expect(db.schema.hasTable("email_logs")).resolves.toBe(true);

    await expect(
      db.schema.hasColumn("events", "image_asset_ids"),
    ).resolves.toBe(true);

    await expect(
      db.schema.hasColumn("media_assets", "owner_event_id"),
    ).resolves.toBe(true);

    await expect(
      db.schema.hasColumn("media_assets", "storage_target"),
    ).resolves.toBe(true);

    await expect(
      db.schema.hasColumn("tickets", "ticket_pdf_storage_target"),
    ).resolves.toBe(true);

    await expect(
      db.schema.hasColumn("ticket_templates", "event_id"),
    ).resolves.toBe(true);

    await expect(
      db.schema.hasColumn("ticket_templates", "template"),
    ).resolves.toBe(true);

    for (const columnName of [
      "discount_code_id_snapshot",
      "discount_code_snapshot",
      "discount_code_group_id_snapshot",
      "discount_code_group_name_snapshot",
      "discount_percent",
      "discount_amount",
    ]) {
      await expect(db.schema.hasColumn("orders", columnName)).resolves.toBe(
        true,
      );
    }

    for (const columnName of [
      "event_id",
      "name",
      "discount_percent",
      "is_active",
    ]) {
      await expect(
        db.schema.hasColumn("discount_code_groups", columnName),
      ).resolves.toBe(true);
    }

    for (const columnName of ["event_id", "group_id", "code", "is_active"]) {
      await expect(
        db.schema.hasColumn("discount_codes", columnName),
      ).resolves.toBe(true);
    }

    await expect(db.schema.hasColumn("events", "image_asset_id")).resolves.toBe(
      false,
    );
  });

  it("does not define a default value for the JSON image_asset_ids column", async () => {
    const db = getDatabaseConnection();

    const column = await getColumnMetadata(db, "events", "image_asset_ids");

    expect(column).toBeDefined();
    expect(column.columnName).toBe("image_asset_ids");

    /**
     * MySQL/MariaDB do not allow defaults on JSON/BLOB/TEXT-like columns.
     * This test protects against reintroducing:
     *   table.json("image_asset_ids").defaultTo("[]")
     */
    expect([null, "NULL"]).toContain(column.columnDefault);
  });

  it("uses a zero default for order discount_amount", async () => {
    const db = getDatabaseConnection();

    const column = await getColumnMetadata(db, "orders", "discount_amount");

    expect(column).toBeDefined();
    expect(column.columnName).toBe("discount_amount");
    expect(Number(column.columnDefault)).toBe(0);
    expect(String(column.isNullable).toUpperCase()).toBe("NO");
  });

  it("runs latest migrations idempotently after the schema is already up to date", async () => {
    const result = await runLatestMigrations();

    expect(result).toMatchObject({
      skipped: false,
    });

    expect(Array.isArray(result.migrations)).toBe(true);
    expect(result.migrations).toHaveLength(0);
  });

  it("stores and reads imageAssetIds as an array through the SQL event repository", async () => {
    const event = await createEvent(
      buildEventPayload({
        title: "SQL Migration Image Asset Ids Event",
        slug: "sql-migration-image-asset-ids-event",
        imageAssetIds: [
          "00000000-0000-4000-8000-000000000101",
          "00000000-0000-4000-8000-000000000102",
          "00000000-0000-4000-8000-000000000101",
        ],
      }),
    );

    expect(event).toMatchObject({
      title: "SQL Migration Image Asset Ids Event",
      slug: "sql-migration-image-asset-ids-event",
      imageAssetIds: [
        "00000000-0000-4000-8000-000000000101",
        "00000000-0000-4000-8000-000000000102",
      ],
    });

    expect(event.imageAssetId).toBeUndefined();

    const db = getDatabaseConnection();

    const row = await db("events")
      .select("image_asset_ids")
      .where("id", event.id)
      .first();

    expect(row).toBeDefined();

    const storedImageAssetIds =
      typeof row.image_asset_ids === "string"
        ? JSON.parse(row.image_asset_ids)
        : row.image_asset_ids;

    expect(storedImageAssetIds).toEqual([
      "00000000-0000-4000-8000-000000000101",
      "00000000-0000-4000-8000-000000000102",
    ]);
  });

  it("stores an empty imageAssetIds array when no event images are provided", async () => {
    const event = await createEvent(
      buildEventPayload({
        title: "SQL Migration Empty Images Event",
        slug: "sql-migration-empty-images-event",
      }),
    );

    expect(event.imageAssetIds).toEqual([]);
    expect(event.imageAssetId).toBeUndefined();

    const db = getDatabaseConnection();

    const row = await db("events")
      .select("image_asset_ids")
      .where("id", event.id)
      .first();

    const storedImageAssetIds =
      typeof row.image_asset_ids === "string"
        ? JSON.parse(row.image_asset_ids)
        : row.image_asset_ids;

    expect(storedImageAssetIds).toEqual([]);
  });
});
