import { describe, expect, it, vi } from "vitest";

import { toApiDate, toApiId } from "../../../src/core/dto/contractValue.dto.js";
import {
  buildSuccessResponse,
  sendSuccess,
} from "../../../src/core/http/response.js";

function createResponseMock() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };

  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);

  return res;
}

describe("API contract values", () => {
  it("normalizes MongoDB and SQL ids to strings", () => {
    const mongoLikeId = {
      toString() {
        return "64f000000000000000000001";
      },
    };

    expect(toApiId(mongoLikeId)).toBe("64f000000000000000000001");

    expect(toApiId("00000000-0000-4000-8000-000000000001")).toBe(
      "00000000-0000-4000-8000-000000000001",
    );
  });

  it("returns null only for missing optional ids", () => {
    expect(toApiId(null)).toBe(null);
    expect(toApiId(undefined)).toBe(null);
  });

  it("rejects empty or invalid ids", () => {
    expect(() => toApiId("")).toThrow("Cannot serialize an invalid API id.");

    expect(() => toApiId("   ")).toThrow("Cannot serialize an invalid API id.");

    expect(() => toApiId({})).toThrow("Cannot serialize an invalid API id.");
  });

  it("normalizes Date objects and persisted date strings to ISO strings", () => {
    expect(toApiDate(new Date("2026-08-04T12:30:00.000Z"))).toBe(
      "2026-08-04T12:30:00.000Z",
    );

    expect(toApiDate("2026-08-04T12:30:00+02:00")).toBe(
      "2026-08-04T10:30:00.000Z",
    );
  });

  it("returns null only for missing optional dates", () => {
    expect(toApiDate(null)).toBe(null);
    expect(toApiDate(undefined)).toBe(null);
  });

  it("rejects ambiguous and invalid dates", () => {
    expect(() => toApiDate("2026-08-04 12:30:00")).toThrow(
      "Cannot serialize an API date without an explicit timezone.",
    );

    expect(() => toApiDate("2026-08-04T12:30:00")).toThrow(
      "Cannot serialize an API date without an explicit timezone.",
    );

    expect(() => toApiDate("2026-99-99T12:30:00.000Z")).toThrow(
      "Cannot serialize an invalid API date.",
    );
  });
});

describe("success response contract", () => {
  it("builds the canonical success response without meta", () => {
    expect(
      buildSuccessResponse({
        data: {
          id: "event-1",
        },
      }),
    ).toEqual({
      success: true,
      data: {
        id: "event-1",
      },
    });
  });

  it("includes meta only when explicitly supplied", () => {
    expect(
      buildSuccessResponse({
        data: [],
        meta: {
          pagination: {
            page: 1,
            pageSize: 25,
            totalItems: 0,
            totalPages: 0,
          },
        },
      }),
    ).toEqual({
      success: true,
      data: [],
      meta: {
        pagination: {
          page: 1,
          pageSize: 25,
          totalItems: 0,
          totalPages: 0,
        },
      },
    });
  });

  it("sends the canonical response with the requested HTTP status", () => {
    const res = createResponseMock();

    const result = sendSuccess(res, {
      status: 201,
      data: {
        id: "order-1",
      },
    });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        id: "order-1",
      },
    });

    expect(result).toBe(res);
  });
});
