import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  clearMongoTestDb,
  connectMongoTestDb,
  disconnectMongoTestDb,
} from "../../helpers/mongoTestDb.js";

describe("MongoDB integration test setup", () => {
  beforeAll(async () => {
    await connectMongoTestDb();
  });

  afterAll(async () => {
    await clearMongoTestDb();
    await disconnectMongoTestDb();
  });

  it("connects to the dedicated MongoDB test database", async () => {
    expect(mongoose.connection.readyState).toBe(1);
    expect(mongoose.connection.name).toContain("test");
  });

  it("can write, read and clean test data", async () => {
    const collection = mongoose.connection.db.collection("integration_smoke");

    await collection.insertOne({
      name: "kiwi-events MongoDB smoke test",
      createdAt: new Date(),
    });

    const document = await collection.findOne({
      name: "kiwi-events MongoDB smoke test",
    });

    expect(document).toBeDefined();
    expect(document.name).toBe("kiwi-events MongoDB smoke test");

    await clearMongoTestDb();

    const count = await collection.countDocuments();

    expect(count).toBe(0);
  });
});
