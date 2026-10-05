import { describe, expect, it } from "vitest";

import {
  toEventRoleDto,
  toEventRolePermissionGroupDto,
} from "../../../src/modules/eventRoles/eventRole.dto.js";

function buildRole(overrides = {}) {
  return {
    id: "event_manager",
    key: "event_manager",
    name: "Event Manager",
    description: "Can manage own events.",
    permissions: ["events.read", "events.create"],
    isProtected: false,
    sortOrder: 30,
    createdAt: new Date("2030-01-01T10:00:00.000Z"),
    updatedAt: "2030-01-02T10:00:00.000Z",

    _id: "must-not-leak",
    __v: 7,
    internalOnly: "must-not-leak",

    ...overrides,
  };
}

describe("event role DTO contract", () => {
  it("serializes a canonical role without persistence fields", () => {
    const result = toEventRoleDto(buildRole());

    expect(result).toEqual({
      id: "event_manager",
      key: "event_manager",
      name: "Event Manager",
      description: "Can manage own events.",
      permissions: ["events.read", "events.create"],
      isProtected: false,
      sortOrder: 30,
      createdAt: "2030-01-01T10:00:00.000Z",
      updatedAt: "2030-01-02T10:00:00.000Z",
    });

    expect(result._id).toBeUndefined();
    expect(result.__v).toBeUndefined();
    expect(result.internalOnly).toBeUndefined();
  });

  it("requires the canonical id to equal the role key", () => {
    expect(() =>
      toEventRoleDto(
        buildRole({
          id: "64f000000000000000000001",
        }),
      ),
    ).toThrow(/id differs from its key/i);
  });

  it("rejects roles without a canonical id", () => {
    expect(() =>
      toEventRoleDto(
        buildRole({
          id: null,
        }),
      ),
    ).toThrow(/without id/i);
  });

  it("normalizes permission groups without leaking extra fields", () => {
    const result = toEventRolePermissionGroupDto({
      key: "events.manageOwn",
      label: "Manage own events",
      description: "Can manage own events.",
      permissions: [
        "events.updateOwn",
        "events.updateOwn",
        " events.deleteOwn ",
      ],
      internalOnly: true,
    });

    expect(result).toEqual({
      key: "events.manageOwn",
      label: "Manage own events",
      description: "Can manage own events.",
      permissions: ["events.updateOwn", "events.deleteOwn"],
    });
  });
});
