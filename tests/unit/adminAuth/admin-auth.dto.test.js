import { describe, expect, it } from "vitest";

import { toAdminUserDto } from "../../../src/modules/adminAuth/adminAuth.dto.js";

describe("adminAuth DTO", () => {
  it("serializes a canonical admin user to the public contract", () => {
    const result = toAdminUserDto({
      id: "64f000000000000000000001",
      emailSnapshot: "ADMIN@EXAMPLE.COM",
      firstNameSnapshot: "Thomas",
      lastNameSnapshot: "Admin",
      role: "admin",
      mustChangePassword: true,

      passwordHash: "must-not-leak",
      notes: "must-not-leak",
      profileImageAssetId: "must-not-leak",
      rawClaims: {
        secret: "must-not-leak",
      },
    });

    expect(result).toEqual({
      id: "64f000000000000000000001",
      email: "admin@example.com",
      firstName: "Thomas",
      lastName: "Admin",
      displayName: "Thomas Admin",
      role: "admin",
      mustChangePassword: true,
    });

    expect(result).not.toHaveProperty("_id");
    expect(result).not.toHaveProperty("passwordHash");
    expect(result).not.toHaveProperty("notes");
    expect(result).not.toHaveProperty("profileImageAssetId");
    expect(result).not.toHaveProperty("rawClaims");
  });

  it("serializes a canonical admin user using its string id", () => {
    expect(
      toAdminUserDto({
        id: "00000000-0000-4000-8000-000000000001",
        emailSnapshot: "admin@admin",
        firstNameSnapshot: "",
        lastNameSnapshot: "",
        role: "admin",
        mustChangePassword: false,
        passwordHash: "must-not-leak",
      }),
    ).toEqual({
      id: "00000000-0000-4000-8000-000000000001",
      email: "admin@admin",
      firstName: "",
      lastName: "",
      displayName: "admin@admin",
      role: "admin",
      mustChangePassword: false,
    });
  });

  it("rejects an admin user without an id", () => {
    expect(() =>
      toAdminUserDto({
        emailSnapshot: "admin@example.com",
        role: "admin",
      }),
    ).toThrow("Cannot serialize an invalid API id.");
  });

  it("rejects an admin user without an email", () => {
    expect(() =>
      toAdminUserDto({
        id: "admin-1",
        role: "admin",
      }),
    ).toThrow("Cannot serialize an admin user without an email.");
  });
});
