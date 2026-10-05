import { describe, expect, it } from "vitest";

import { toEventUserDto } from "../../../src/modules/eventUsers/eventUser.dto.js";

function buildEventUser(overrides = {}) {
  return {
    id: "64f000000000000000000001",

    authProvider: "external",

    emailSnapshot: "thomas@example.com",

    externalProvider: "dummy",
    externalUserId: "host-user-1",

    firstNameSnapshot: "Thomas",
    lastNameSnapshot: "Test",

    profileBio: "Profile bio",

    profileImageAssetId: "64f000000000000000000002",

    profileImageAsset: {
      id: "64f000000000000000000002",
      fileUrl: "/api/public/media-assets/64f000000000000000000002/file",
      filenameOriginal: "profile.jpg",
      mimeType: "image/jpeg",
      size: 12345,

      _id: "must-not-leak",
      key: "internal/storage/key",
    },

    role: "event_manager",

    effectivePermissions: ["events.read", "events.updateOwn", "events.read"],

    mustChangePassword: false,
    lastLoginAt: new Date("2030-01-02T10:00:00.000Z"),

    isActive: true,
    notes: "Test notes",

    createdAt: new Date("2030-01-01T10:00:00.000Z"),
    updatedAt: "2030-01-03T10:00:00.000Z",

    _id: "must-not-leak",
    __v: 42,
    passwordHash: "must-not-leak",
    internalOnly: "must-not-leak",

    ...overrides,
  };
}

describe("EventUser DTO contract", () => {
  it("serializes only the canonical EventUser HTTP contract", () => {
    const result = toEventUserDto(buildEventUser());

    expect(result).toEqual({
      id: "64f000000000000000000001",

      authProvider: "external",

      emailSnapshot: "thomas@example.com",

      externalProvider: "dummy",
      externalUserId: "host-user-1",

      firstNameSnapshot: "Thomas",
      lastNameSnapshot: "Test",

      profileBio: "Profile bio",

      profileImageAssetId: "64f000000000000000000002",

      profileImageAsset: {
        id: "64f000000000000000000002",
        fileUrl: "/api/public/media-assets/64f000000000000000000002/file",
        filenameOriginal: "profile.jpg",
        mimeType: "image/jpeg",
        size: 12345,
      },

      role: "event_manager",

      effectivePermissions: ["events.read", "events.updateOwn"],

      mustChangePassword: false,
      lastLoginAt: "2030-01-02T10:00:00.000Z",

      isActive: true,
      notes: "Test notes",

      createdAt: "2030-01-01T10:00:00.000Z",
      updatedAt: "2030-01-03T10:00:00.000Z",
    });

    expect(result._id).toBeUndefined();
    expect(result.__v).toBeUndefined();
    expect(result.passwordHash).toBeUndefined();
    expect(result.internalOnly).toBeUndefined();

    expect(result.profileImageAsset._id).toBeUndefined();
    expect(result.profileImageAsset.key).toBeUndefined();
  });

  it("supports EventUsers without an external identity or profile image", () => {
    const result = toEventUserDto(
      buildEventUser({
        authProvider: "local",

        externalProvider: null,
        externalUserId: null,

        profileImageAssetId: null,
        profileImageAsset: null,

        lastLoginAt: null,

        role: "admin",
      }),
    );

    expect(result.externalProvider).toBeNull();
    expect(result.externalUserId).toBeNull();

    expect(result.profileImageAssetId).toBeNull();
    expect(result.profileImageAsset).toBeNull();

    expect(result.lastLoginAt).toBeNull();

    expect(result.role).toBe("admin");
  });

  it("rejects EventUsers without a canonical id", () => {
    expect(() =>
      toEventUserDto(
        buildEventUser({
          id: null,
        }),
      ),
    ).toThrow(/without id/i);
  });

  it("does not fall back to MongoDB _id", () => {
    expect(() =>
      toEventUserDto(
        buildEventUser({
          id: null,
          _id: "64f000000000000000000099",
        }),
      ),
    ).toThrow(/without id/i);
  });
});
