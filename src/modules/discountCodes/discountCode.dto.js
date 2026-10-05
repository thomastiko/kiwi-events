import { toApiDate, toApiId } from "../../core/dto/contractValue.dto.js";

function requireId(value, fieldName) {
  const id = toApiId(value);

  if (!id) {
    throw new TypeError(
      `Cannot serialize discount code data without ${fieldName}.`,
    );
  }

  return id;
}

function requireString(value, fieldName) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    throw new TypeError(
      `Cannot serialize discount code data without ${fieldName}.`,
    );
  }

  return normalized;
}

function requireDiscountPercent(value) {
  const percent = Number(value);

  if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
    throw new TypeError("Cannot serialize an invalid discountPercent.");
  }

  return percent;
}

export function toAdminDiscountCodeGroupDto(group) {
  if (!group) {
    throw new TypeError("Cannot serialize a missing discount code group.");
  }

  return {
    id: requireId(group.id, "id"),

    eventId: requireId(group.eventId, "eventId"),

    name: requireString(group.name, "name"),

    discountPercent: requireDiscountPercent(group.discountPercent),

    isActive: Boolean(group.isActive),

    createdAt: toApiDate(group.createdAt),

    updatedAt: toApiDate(group.updatedAt),
  };
}

export function toAdminDiscountCodeDto(code) {
  if (!code) {
    throw new TypeError("Cannot serialize a missing discount code.");
  }

  return {
    id: requireId(code.id, "id"),

    eventId: requireId(code.eventId, "eventId"),

    groupId: requireId(code.groupId, "groupId"),

    code: requireString(code.code, "code"),

    isActive: Boolean(code.isActive),

    createdAt: toApiDate(code.createdAt),

    updatedAt: toApiDate(code.updatedAt),
  };
}
