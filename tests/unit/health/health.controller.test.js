import { describe, expect, it, vi } from "vitest";

import { getHealth } from "../../../src/modules/health/health.controller.js";
import { toHealthDto } from "../../../src/modules/health/health.dto.js";

function createResponseMock() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };

  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);

  return res;
}

describe("health DTO", () => {
  it("returns the stable public health contract", () => {
    expect(toHealthDto()).toEqual({
      status: "healthy",
    });
  });
});

describe("health controller", () => {
  it("returns only the canonical public liveness response", () => {
    const res = createResponseMock();

    const result = getHealth({}, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        status: "healthy",
      },
    });

    expect(result).toBe(res);
  });

  it("never exposes request identity or persistence information", () => {
    const res = createResponseMock();

    getHealth(
      {
        identity: {
          rawClaims: {
            secretClaim: "must-not-leak",
          },
        },
        eventUser: {
          id: "event-user-1",
          passwordHash: "must-not-leak",
        },
        database: {
          provider: "mongodb",
          connectionString: "must-not-leak",
        },
        storage: {
          provider: "s3",
          secretAccessKey: "must-not-leak",
        },
      },
      res,
    );

    const responseBody = res.json.mock.calls[0][0];

    expect(responseBody).toEqual({
      success: true,
      data: {
        status: "healthy",
      },
    });

    expect(responseBody).not.toHaveProperty("message");
    expect(responseBody.data).not.toHaveProperty("identity");
    expect(responseBody.data).not.toHaveProperty("eventUser");
    expect(responseBody.data).not.toHaveProperty("database");
    expect(responseBody.data).not.toHaveProperty("storage");
  });
});
